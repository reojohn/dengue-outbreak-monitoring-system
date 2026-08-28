import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.auth_security import require_roles
from app.services.workflow_realtime import workflow_realtime_broker

router = APIRouter(prefix="/workflow-realtime", tags=["workflow realtime"])


def _sse_event(event_name: str, payload) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


@router.get("/stream")
async def stream_workflow_events(
    request: Request,
    current_user=Depends(require_roles("admin", "cho", "supervisor", "bhw")),
):
    client_id = request.headers.get("x-workflow-client-id", "").strip()
    subscription = workflow_realtime_broker.subscribe(
        role=current_user.get("role"),
        user_id=str(current_user.get("id") or ""),
        assigned_barangay=str(current_user.get("assigned_barangay") or ""),
        client_id=client_id,
        loop=asyncio.get_running_loop(),
    )

    async def event_generator():
        try:
            yield _sse_event(
                "connected",
                {
                    "topic": "connection",
                    "event": "connected",
                    "subscription_id": subscription.id,
                },
            )

            while True:
                if await request.is_disconnected():
                    break

                try:
                    payload = await asyncio.wait_for(subscription.events.get(), timeout=20.0)
                    yield _sse_event("workflow", payload)
                except asyncio.TimeoutError:
                    # Tiny heartbeat keeps proxies from closing an otherwise
                    # idle stream. It is deliberately a comment, not a data
                    # event, so it does not trigger browser refreshes.
                    yield ": keep-alive\n\n"
        finally:
            workflow_realtime_broker.unsubscribe(subscription.id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
