"""Lightweight cross-device workflow event broker.

Only small change notifications are pushed. Browsers still read authoritative
rows through the existing authenticated API, so realtime delivery never
bypasses role checks or exposes full database records.
"""

from __future__ import annotations

import asyncio
import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4


_ALLOWED_ROLES = {"admin", "cho", "supervisor", "bhw"}


def _barangay_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


@dataclass
class WorkflowSubscription:
    role: str
    user_id: str
    assigned_barangay: str
    client_id: str
    loop: asyncio.AbstractEventLoop
    id: str = field(default_factory=lambda: str(uuid4()))
    events: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=64))

    @property
    def assigned_barangay_key(self) -> str:
        return _barangay_key(self.assigned_barangay)


class WorkflowRealtimeBroker:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._subscriptions: Dict[str, WorkflowSubscription] = {}

    def subscribe(
        self,
        *,
        role: str,
        user_id: str,
        loop: asyncio.AbstractEventLoop,
        assigned_barangay: str = "",
        client_id: str = "",
    ) -> WorkflowSubscription:
        normalized_role = str(role or "").strip().lower()
        if normalized_role not in _ALLOWED_ROLES:
            raise ValueError("This role cannot subscribe to workflow realtime events.")

        subscription = WorkflowSubscription(
            role=normalized_role,
            user_id=str(user_id or ""),
            assigned_barangay=str(assigned_barangay or ""),
            client_id=str(client_id or ""),
            loop=loop,
        )
        with self._lock:
            self._subscriptions[subscription.id] = subscription
        return subscription

    def unsubscribe(self, subscription_id: str) -> None:
        with self._lock:
            self._subscriptions.pop(str(subscription_id or ""), None)

    def publish(
        self,
        *,
        topic: str,
        event: str,
        data: Optional[Dict[str, Any]] = None,
        barangay: str = "",
        target_user_id: str = "",
        origin_client_id: str = "",
    ) -> None:
        payload = {
            "topic": str(topic or "workflow"),
            "event": str(event or "changed"),
            "barangay": str(barangay or ""),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **(data or {}),
        }

        barangay_key = _barangay_key(barangay)
        target_user_id = str(target_user_id or "")
        origin_client_id = str(origin_client_id or "")

        with self._lock:
            subscriptions = list(self._subscriptions.values())

        for subscription in subscriptions:
            # The tab that made the mutation already updated its own state.
            # Skip only that browser tab/client, not every session for the user,
            # so a second laptop using the same account still receives updates.
            if origin_client_id and subscription.client_id == origin_client_id:
                continue

            if subscription.role == "bhw":
                if payload["topic"] == "decision_actions":
                    if not barangay_key or barangay_key != subscription.assigned_barangay_key:
                        continue
                elif payload["topic"] == "field_updates":
                    if target_user_id:
                        if subscription.user_id != target_user_id:
                            continue
                    elif barangay_key and barangay_key != subscription.assigned_barangay_key:
                        continue

            if subscription.loop.is_closed():
                continue
            try:
                subscription.loop.call_soon_threadsafe(self._offer, subscription, payload)
            except RuntimeError:
                # The request/event loop may have closed between the check and
                # the thread-safe callback scheduling.
                continue

    @staticmethod
    def _offer(subscription: WorkflowSubscription, payload: Dict[str, Any]) -> None:
        if subscription.events.full():
            try:
                subscription.events.get_nowait()
            except asyncio.QueueEmpty:
                pass

        try:
            subscription.events.put_nowait(payload)
        except asyncio.QueueFull:
            # A later event will cause the client to fetch authoritative state,
            # so dropping a saturated notification is safe.
            pass


workflow_realtime_broker = WorkflowRealtimeBroker()


def publish_workflow_event(**kwargs) -> None:
    workflow_realtime_broker.publish(**kwargs)
