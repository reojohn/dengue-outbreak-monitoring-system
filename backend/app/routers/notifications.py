from typing import Any, Dict, Optional

from fastapi import APIRouter
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
