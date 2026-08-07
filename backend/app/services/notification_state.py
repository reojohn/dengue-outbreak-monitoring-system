from copy import deepcopy
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid4, uuid5
import json

from sqlalchemy import text

from app.database import engine

_NOTIFICATION_EVENTS = []


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _stable_uuid(value: str):
    return str(uuid5(NAMESPACE_URL, f"dengue-notification:{value}"))


def _to_json(value):
    return json.dumps(value or {}, default=str)


def _row_to_notification(row):
    meta = row.get("meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    severity = row.get("severity") or "info"
    target_page = row.get("target_page") or meta.get("to") or "/dashboard"
    target_hash = row.get("target_hash") or meta.get("hash") or "dashboard-summary"

    return {
        "id": meta.get("notification_key") or str(row.get("notification_id")),
        "database_id": str(row.get("notification_id")),
        "title": row.get("title") or "System notification",
        "message": row.get("message") or "A system event was recorded.",
        "severity": severity,
        "type": severity,
        "category": row.get("category") or "system_event",
        "source": meta.get("source") or "database",
        "to": target_page,
        "hash": target_hash,
        "timestamp": str(row.get("created_at")) if row.get("created_at") else now_iso(),
        "read": bool(row.get("is_read")),
        "recipient_role": row.get("recipient_role"),
        "recipient_user_id": str(row.get("recipient_user_id")) if row.get("recipient_user_id") else None,
        "meta": meta,
    }


def _fallback_add_notification_event(payload: dict):
    event = {
        "id": payload.get("id") or f"event-{uuid4().hex}",
        "title": payload.get("title") or "System notification",
        "message": payload.get("message") or "A system event was recorded.",
        "severity": payload.get("severity") or payload.get("type") or "info",
        "type": payload.get("type") or payload.get("severity") or "info",
        "category": payload.get("category") or "system_event",
        "source": payload.get("source") or "backend_event",
        "to": payload.get("to") or "/dashboard",
        "hash": payload.get("hash") or "dashboard-summary",
        "timestamp": payload.get("timestamp") or now_iso(),
        "read": False,
        "recipient_role": payload.get("recipient_role"),
        "recipient_user_id": str(payload.get("recipient_user_id")) if payload.get("recipient_user_id") else None,
        "meta": payload.get("meta") or {},
    }
    _NOTIFICATION_EVENTS.insert(0, event)
    del _NOTIFICATION_EVENTS[30:]
    return deepcopy(event)


def add_notification_event(payload: dict):
    notification_key = payload.get("id") or f"event-{uuid4().hex}"
    severity = payload.get("severity") or payload.get("type") or "info"
    meta = {
        **(payload.get("meta") or {}),
        "notification_key": notification_key,
        "auto_generated": False,
        "source": payload.get("source") or "backend_event",
    }

    try:
        with engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    insert into public.notifications (
                        notification_id, title, message, severity, category,
                        target_page, target_hash, is_read, meta, created_at,
                        recipient_role, recipient_user_id
                    )
                    values (
                        :notification_id, :title, :message, :severity, :category,
                        :target_page, :target_hash, false, cast(:meta as jsonb), now(),
                        :recipient_role, :recipient_user_id
                    )
                    on conflict (notification_id)
                    do update set
                        title = excluded.title,
                        message = excluded.message,
                        severity = excluded.severity,
                        category = excluded.category,
                        target_page = excluded.target_page,
                        target_hash = excluded.target_hash,
                        meta = excluded.meta,
                        recipient_role = excluded.recipient_role,
                        recipient_user_id = excluded.recipient_user_id
                    returning notification_id, title, message, severity, category,
                              target_page, target_hash, is_read, meta, created_at,
                              recipient_role, recipient_user_id
                    """
                ),
                {
                    "notification_id": _stable_uuid(notification_key),
                    "title": payload.get("title") or "System notification",
                    "message": payload.get("message") or "A system event was recorded.",
                    "severity": severity,
                    "category": payload.get("category") or "system_event",
                    "target_page": payload.get("to") or "/dashboard",
                    "target_hash": payload.get("hash") or "dashboard-summary",
                    "meta": _to_json(meta),
                    "recipient_role": payload.get("recipient_role"),
                    "recipient_user_id": payload.get("recipient_user_id") or None,
                },
            ).mappings().first()
        return _row_to_notification(row)
    except Exception:
        return _fallback_add_notification_event(payload)


def save_generated_notifications(notifications):
    if not notifications:
        return []

    saved = []
    try:
        with engine.begin() as connection:
            for item in notifications:
                notification_key = item.get("id") or f"generated-{uuid4().hex}"
                severity = item.get("severity") or item.get("type") or "info"
                meta = {
                    **(item.get("meta") or {}),
                    "notification_key": notification_key,
                    "auto_generated": True,
                    "source": item.get("source") or "backend",
                }
                row = connection.execute(
                    text(
                        """
                        insert into public.notifications (
                            notification_id, title, message, severity, category,
                            target_page, target_hash, is_read, meta, created_at,
                            recipient_role, recipient_user_id
                        )
                        values (
                            :notification_id, :title, :message, :severity, :category,
                            :target_page, :target_hash, false, cast(:meta as jsonb), now(),
                            :recipient_role, :recipient_user_id
                        )
                        on conflict (notification_id)
                        do update set
                            title = excluded.title,
                            message = excluded.message,
                            severity = excluded.severity,
                            category = excluded.category,
                            target_page = excluded.target_page,
                            target_hash = excluded.target_hash,
                            meta = excluded.meta,
                            recipient_role = excluded.recipient_role,
                            recipient_user_id = excluded.recipient_user_id
                        returning notification_id, title, message, severity, category,
                                  target_page, target_hash, is_read, meta, created_at,
                                  recipient_role, recipient_user_id
                        """
                    ),
                    {
                        "notification_id": _stable_uuid(notification_key),
                        "title": item.get("title") or "System notification",
                        "message": item.get("message") or "A system event was recorded.",
                        "severity": severity,
                        "category": item.get("category") or "system",
                        "target_page": item.get("to") or "/dashboard",
                        "target_hash": item.get("hash") or "dashboard-summary",
                        "meta": _to_json(meta),
                        "recipient_role": item.get("recipient_role"),
                        "recipient_user_id": item.get("recipient_user_id") or None,
                    },
                ).mappings().first()
                saved.append(_row_to_notification(row))
        return saved
    except Exception:
        return []


def clear_generated_hotspot_notifications(integration_run_id=None):
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    delete from public.notifications
                    where coalesce(meta->>'auto_generated', 'false') = 'true'
                      and category in ('confirmed_hotspot_detected', 'emerging_hotspot_detected', 'map_review_needed')
                      and (:integration_run_id is null or meta->>'integration_run_id' = :integration_run_id)
                    """
                ),
                {"integration_run_id": str(integration_run_id) if integration_run_id else None},
            )
    except Exception:
        pass


def get_saved_hotspot_notifications(integration_run_id=None, limit: int = 10):
    safe_limit = max(1, min(int(limit or 10), 30))
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    """
                    select notification_id, title, message, severity, category,
                           target_page, target_hash, is_read, meta, created_at,
                           recipient_role, recipient_user_id
                    from public.notifications
                    where coalesce(meta->>'auto_generated', 'false') = 'true'
                      and category in ('confirmed_hotspot_detected', 'emerging_hotspot_detected', 'map_review_needed')
                      and (:integration_run_id is null or meta->>'integration_run_id' = :integration_run_id)
                    order by created_at desc
                    limit :limit
                    """
                ),
                {
                    "integration_run_id": str(integration_run_id) if integration_run_id else None,
                    "limit": safe_limit,
                },
            ).mappings().all()
        return [_row_to_notification(row) for row in rows]
    except Exception:
        return []


def _is_visible_to(event, recipient_role=None, recipient_user_id=None):
    target_role = event.get("recipient_role")
    target_user = event.get("recipient_user_id")
    if target_role and target_role != recipient_role:
        return False
    if target_user and str(target_user) != str(recipient_user_id or ""):
        return False
    return True


def get_notification_events(limit: int = 10, recipient_role=None, recipient_user_id=None):
    safe_limit = max(1, min(int(limit or 10), 30))
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    """
                    select notification_id, title, message, severity, category,
                           target_page, target_hash, is_read, meta, created_at,
                           recipient_role, recipient_user_id
                    from public.notifications
                    where coalesce(meta->>'auto_generated', 'false') <> 'true'
                      and (recipient_role is null or recipient_role = :recipient_role)
                      and (recipient_user_id is null or recipient_user_id = :recipient_user_id)
                    order by created_at desc
                    limit :limit
                    """
                ),
                {
                    "recipient_role": recipient_role,
                    "recipient_user_id": str(recipient_user_id) if recipient_user_id else None,
                    "limit": safe_limit,
                },
            ).mappings().all()
        return [_row_to_notification(row) for row in rows]
    except Exception:
        return [
            deepcopy(item)
            for item in _NOTIFICATION_EVENTS
            if _is_visible_to(item, recipient_role, recipient_user_id)
        ][:safe_limit]


def clear_notification_events():
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    delete from public.notifications
                    where coalesce(meta->>'auto_generated', 'false') <> 'true'
                    """
                )
            )
    except Exception:
        pass
    _NOTIFICATION_EVENTS.clear()
    return []
