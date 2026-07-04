from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/sessions",
    tags=["demo sessions"],
)

DEFAULT_USER_KEY = "default_user"


class DemoSessionCreateRequest(BaseModel):
    user_key: str = DEFAULT_USER_KEY
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    label: Optional[str] = None
    email: Optional[str] = None


@router.post("")
def create_demo_session(payload: DemoSessionCreateRequest):
    session_id = str(uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=12)

    with engine.begin() as connection:
        row = connection.execute(
            text(
                """
                insert into public.demo_sessions (
                    session_id,
                    user_key,
                    user_name,
                    user_role,
                    created_at,
                    expires_at
                )
                values (
                    :session_id,
                    :user_key,
                    :user_name,
                    :user_role,
                    now(),
                    :expires_at
                )
                returning session_id, user_key, user_name, user_role, created_at, expires_at
                """
            ),
            {
                "session_id": session_id,
                "user_key": payload.user_key or DEFAULT_USER_KEY,
                "user_name": payload.user_name or payload.label or payload.email or "Demo user",
                "user_role": payload.user_role or "user",
                "expires_at": expires_at,
            },
        ).mappings().first()

    return {
        "message": "Demo session saved to Supabase.",
        "session": {
            "session_id": row["session_id"],
            "user_key": row["user_key"],
            "user_name": row["user_name"],
            "user_role": row["user_role"],
            "created_at": str(row["created_at"]),
            "expires_at": str(row["expires_at"]),
        },
    }


@router.get("/{session_id}")
def get_demo_session(session_id: str):
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                select session_id, user_key, user_name, user_role, created_at, expires_at
                from public.demo_sessions
                where session_id = :session_id
                limit 1
                """
            ),
            {"session_id": session_id},
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Demo session not found.")

    return {
        "message": "Demo session loaded from Supabase.",
        "session": {
            "session_id": row["session_id"],
            "user_key": row["user_key"],
            "user_name": row["user_name"],
            "user_role": row["user_role"],
            "created_at": str(row["created_at"]),
            "expires_at": str(row["expires_at"]),
        },
    }


@router.delete("/{session_id}")
def delete_demo_session(session_id: str):
    with engine.begin() as connection:
        connection.execute(
            text("delete from public.demo_sessions where session_id = :session_id"),
            {"session_id": session_id},
        )

    return {"message": "Demo session removed from Supabase."}
