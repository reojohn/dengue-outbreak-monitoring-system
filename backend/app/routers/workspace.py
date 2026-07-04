from typing import Any, Dict
import json

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/workspace",
    tags=["workspace state"],
)

DEFAULT_USER_KEY = "default_user"


class WorkspaceStateRequest(BaseModel):
    workspace: Dict[str, Any]
    user_key: str = DEFAULT_USER_KEY


@router.get("")
def get_workspace_state(user_key: str = DEFAULT_USER_KEY):
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                select user_key, workspace, updated_at
                from public.workspace_states
                where user_key = :user_key
                limit 1
                """
            ),
            {"user_key": user_key},
        ).mappings().first()

    return {
        "message": "Workspace state loaded from Supabase." if row else "No saved workspace state found.",
        "user_key": user_key,
        "workspace": row["workspace"] if row else None,
        "updated_at": str(row["updated_at"]) if row and row.get("updated_at") else None,
    }


@router.put("")
def save_workspace_state(payload: WorkspaceStateRequest):
    with engine.begin() as connection:
        row = connection.execute(
            text(
                """
                insert into public.workspace_states (user_key, workspace, updated_at)
                values (:user_key, cast(:workspace as jsonb), now())
                on conflict (user_key)
                do update set
                    workspace = excluded.workspace,
                    updated_at = now()
                returning user_key, workspace, updated_at
                """
            ),
            {
                "user_key": payload.user_key or DEFAULT_USER_KEY,
                "workspace": json.dumps(payload.workspace, default=str),
            },
        ).mappings().first()

    return {
        "message": "Workspace state saved to Supabase.",
        "user_key": row["user_key"],
        "workspace": row["workspace"],
        "updated_at": str(row["updated_at"]) if row.get("updated_at") else None,
    }


@router.delete("")
def clear_workspace_state(user_key: str = DEFAULT_USER_KEY):
    with engine.begin() as connection:
        connection.execute(
            text("delete from public.workspace_states where user_key = :user_key"),
            {"user_key": user_key},
        )

    return {
        "message": "Workspace state cleared from Supabase.",
        "user_key": user_key,
    }
