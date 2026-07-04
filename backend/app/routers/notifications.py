from typing import Any, Dict, Optional

from fastapi import APIRouter
from sqlalchemy import text
from app.database import engine
from pydantic import BaseModel

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


@router.get("")
def get_notifications():
    return build_backend_notifications()


@router.post("/events")
def create_notification_event(payload: NotificationEventRequest):
    event = add_notification_event(payload.model_dump())

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
