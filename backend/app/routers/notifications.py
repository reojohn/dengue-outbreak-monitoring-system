from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth_security import get_current_user, require_roles
from app.database import engine, get_db
from app.schema_utils import column_exists, index_exists, table_exists
from app.services.notification_builder import build_backend_notifications
from app.services.notification_state import add_notification_event, clear_notification_events

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)

ALLOWED_RECIPIENT_ROLES = {"cho", "supervisor", "bhw", "admin", "viewer"}


class NotificationEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=1200)
    severity: Literal["info", "success", "activity", "warning", "danger"] = "info"
    category: str = Field(default="system_event", min_length=1, max_length=80)
    to: str = Field(default="/dashboard", min_length=1, max_length=200)
    hash: str = Field(default="dashboard-summary", max_length=120)
    meta: Optional[Dict[str, Any]] = None
    recipient_role: Optional[str] = Field(default=None, max_length=32)
    recipient_user_id: Optional[str] = Field(default=None, max_length=64)


class NotificationPreferenceUpdate(BaseModel):
    notifications_enabled: bool


class NotificationReadsRequest(BaseModel):
    notification_ids: list[str] = Field(default_factory=list, max_length=100)
    # Backward-compatible only. Server derives the read-state owner from auth.
    user_key: Optional[str] = None


def _notification_user_key(current_user: Dict[str, Any]) -> str:
    return f"user:{str(current_user['id']).strip().lower()}"


def _validate_event_target(payload: NotificationEventRequest) -> None:
    if payload.recipient_role and payload.recipient_role not in ALLOWED_RECIPIENT_ROLES:
        raise HTTPException(status_code=400, detail="Invalid notification recipient role.")
    if not payload.to.startswith("/") or payload.to.startswith("//"):
        raise HTTPException(status_code=400, detail="Notification target must be an internal application path.")


def ensure_notification_preferences_table() -> None:
    """Ensure notification tables exist while avoiding redundant startup ALTER statements."""
    with engine.begin() as connection:
        if not table_exists(connection, "public", "user_preferences"):
            connection.execute(
                text(
                    """
                    create table public.user_preferences (
                        user_id uuid primary key references public.app_users(id) on delete cascade,
                        notifications_enabled boolean not null default true,
                        updated_at timestamptz not null default now()
                    )
                    """
                )
            )
        else:
            if not column_exists(connection, "public", "user_preferences", "notifications_enabled"):
                connection.execute(
                    text(
                        "alter table public.user_preferences "
                        "add column notifications_enabled boolean not null default true"
                    )
                )
            if not column_exists(connection, "public", "user_preferences", "updated_at"):
                connection.execute(
                    text(
                        "alter table public.user_preferences "
                        "add column updated_at timestamptz not null default now()"
                    )
                )

        if not table_exists(connection, "public", "notifications"):
            connection.execute(
                text(
                    """
                    create table public.notifications (
                        notification_id uuid primary key,
                        title text not null,
                        message text not null,
                        severity text not null default 'info',
                        category text not null default 'system_event',
                        target_page text,
                        target_hash text,
                        is_read boolean not null default false,
                        meta jsonb not null default '{}'::jsonb,
                        created_at timestamptz not null default now(),
                        recipient_role text,
                        recipient_user_id uuid references public.app_users(id) on delete cascade
                    )
                    """
                )
            )
        else:
            if not column_exists(connection, "public", "notifications", "recipient_role"):
                connection.execute(text("alter table public.notifications add column recipient_role text"))
            if not column_exists(connection, "public", "notifications", "recipient_user_id"):
                connection.execute(
                    text(
                        "alter table public.notifications add column recipient_user_id uuid "
                        "references public.app_users(id) on delete cascade"
                    )
                )

        if not index_exists(connection, "public", "notifications_recipient_role_idx"):
            connection.execute(
                text(
                    "create index notifications_recipient_role_idx "
                    "on public.notifications (recipient_role, created_at desc)"
                )
            )
        if not index_exists(connection, "public", "notifications_recipient_user_idx"):
            connection.execute(
                text(
                    "create index notifications_recipient_user_idx "
                    "on public.notifications (recipient_user_id, created_at desc)"
                )
            )


@router.get("")
def get_notifications(current_user=Depends(get_current_user)):
    return build_backend_notifications(current_user=current_user)


@router.get("/preferences")
def get_notification_preferences(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            select notifications_enabled, updated_at
            from public.user_preferences
            where user_id = :user_id
            limit 1
            """
        ),
        {"user_id": str(current_user["id"])},
    ).mappings().first()

    if not row:
        return {
            "message": "No saved notification preference was found. The browser preference may be migrated once.",
            "notifications_enabled": True,
            "has_saved_preference": False,
            "updated_at": None,
        }

    return {
        "message": "Notification preference loaded from Supabase.",
        "notifications_enabled": bool(row["notifications_enabled"]),
        "has_saved_preference": True,
        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
    }


@router.patch("/preferences")
def update_notification_preferences(
    payload: NotificationPreferenceUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            insert into public.user_preferences (user_id, notifications_enabled, updated_at)
            values (:user_id, :notifications_enabled, now())
            on conflict (user_id)
            do update set
                notifications_enabled = excluded.notifications_enabled,
                updated_at = now()
            returning notifications_enabled, updated_at
            """
        ),
        {
            "user_id": str(current_user["id"]),
            "notifications_enabled": bool(payload.notifications_enabled),
        },
    ).mappings().first()
    db.commit()

    return {
        "message": "Notification preference saved to Supabase.",
        "notifications_enabled": bool(row["notifications_enabled"]),
        "has_saved_preference": True,
        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
    }


@router.post("/events")
def create_notification_event(
    payload: NotificationEventRequest,
    current_user=Depends(require_roles("admin", "cho", "supervisor")),
):
    _validate_event_target(payload)
    event_payload = payload.model_dump()
    event_payload["meta"] = {
        **(event_payload.get("meta") or {}),
        "created_by_user_id": str(current_user["id"]),
        "created_by_role": current_user.get("role"),
    }
    event = add_notification_event(event_payload)

    return {
        "message": "Notification event recorded.",
        "event": event,
    }


@router.delete("/events")
def reset_notification_events(
    current_user=Depends(require_roles("admin", "cho")),
):
    clear_notification_events()
    return {"message": "Notification events cleared."}


@router.get("/reads")
def get_notification_reads(
    user_key: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    owner_key = _notification_user_key(current_user)
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                select notification_id, read_at
                from public.notification_reads
                where user_key = :user_key
                order by read_at desc
                limit 300
                """
            ),
            {"user_key": owner_key},
        ).mappings().all()

    return {
        "message": "Notification read state loaded from Supabase.",
        "user_key": owner_key,
        "read_notification_ids": [str(row["notification_id"]) for row in rows],
    }


@router.post("/reads/{notification_id}")
def mark_notification_read(
    notification_id: str = Path(min_length=1, max_length=128),
    user_key: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    owner_key = _notification_user_key(current_user)
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                insert into public.notification_reads (notification_id, user_key, read_at)
                values (:notification_id, :user_key, now())
                on conflict (notification_id, user_key)
                do update set read_at = now()
                """
            ),
            {"notification_id": notification_id, "user_key": owner_key},
        )

    return {
        "message": "Notification marked as read.",
        "notification_id": notification_id,
        "user_key": owner_key,
    }


@router.post("/reads")
def mark_notifications_read(
    payload: NotificationReadsRequest,
    current_user=Depends(get_current_user),
):
    owner_key = _notification_user_key(current_user)
    notification_ids = list(dict.fromkeys(str(item).strip() for item in payload.notification_ids if str(item).strip()))[:100]

    with engine.begin() as connection:
        for notification_id in notification_ids:
            connection.execute(
                text(
                    """
                    insert into public.notification_reads (notification_id, user_key, read_at)
                    values (:notification_id, :user_key, now())
                    on conflict (notification_id, user_key)
                    do update set read_at = now()
                    """
                ),
                {"notification_id": notification_id[:128], "user_key": owner_key},
            )

    return {
        "message": "Notifications marked as read.",
        "user_key": owner_key,
        "count": len(notification_ids),
    }
