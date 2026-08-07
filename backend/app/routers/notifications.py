from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth_security import get_current_user
from app.database import engine, get_db
from app.services.notification_builder import build_backend_notifications
from app.services.notification_state import add_notification_event, clear_notification_events

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


class NotificationEventRequest(BaseModel):
    title: str
    message: str
    severity: str = "info"
    category: str = "system_event"
    to: str = "/dashboard"
    hash: str = "dashboard-summary"
    meta: Optional[Dict[str, Any]] = None
    recipient_role: Optional[str] = None
    recipient_user_id: Optional[str] = None


class NotificationPreferenceUpdate(BaseModel):
    notifications_enabled: bool


def ensure_notification_preferences_table() -> None:
    """Create the account-level preference table without inserting default rows."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                create table if not exists public.user_preferences (
                    user_id uuid primary key references public.app_users(id) on delete cascade,
                    notifications_enabled boolean not null default true,
                    updated_at timestamptz not null default now()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                alter table public.user_preferences
                add column if not exists notifications_enabled boolean not null default true
                """
            )
        )
        connection.execute(
            text(
                """
                alter table public.user_preferences
                add column if not exists updated_at timestamptz not null default now()
                """
            )
        )
        connection.execute(
            text(
                """
                create table if not exists public.notifications (
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
        connection.execute(
            text(
                """
                alter table public.notifications
                add column if not exists recipient_role text
                """
            )
        )
        connection.execute(
            text(
                """
                alter table public.notifications
                add column if not exists recipient_user_id uuid references public.app_users(id) on delete cascade
                """
            )
        )
        connection.execute(
            text(
                """
                create index if not exists notifications_recipient_role_idx
                on public.notifications (recipient_role, created_at desc)
                """
            )
        )
        connection.execute(
            text(
                """
                create index if not exists notifications_recipient_user_idx
                on public.notifications (recipient_user_id, created_at desc)
                """
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
            insert into public.user_preferences (
                user_id,
                notifications_enabled,
                updated_at
            )
            values (
                :user_id,
                :notifications_enabled,
                now()
            )
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
    current_user=Depends(get_current_user),
):
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
def reset_notification_events():
    clear_notification_events()

    return {
        "message": "Notification events cleared.",
    }


@router.get("/reads")
def get_notification_reads(user_key: str = "default_user"):
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
            {"user_key": user_key},
        ).mappings().all()

    return {
        "message": "Notification read state loaded from Supabase.",
        "user_key": user_key,
        "read_notification_ids": [str(row["notification_id"]) for row in rows],
    }


@router.post("/reads/{notification_id}")
def mark_notification_read(notification_id: str, user_key: str = "default_user"):
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
            {
                "notification_id": notification_id,
                "user_key": user_key,
            },
        )

    return {
        "message": "Notification marked as read.",
        "notification_id": notification_id,
        "user_key": user_key,
    }


@router.post("/reads")
def mark_notifications_read(payload: dict):
    user_key = payload.get("user_key") or "default_user"
    notification_ids = payload.get("notification_ids") or []

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
                {
                    "notification_id": str(notification_id),
                    "user_key": user_key,
                },
            )

    return {
        "message": "Notifications marked as read.",
        "user_key": user_key,
        "count": len(notification_ids),
    }
