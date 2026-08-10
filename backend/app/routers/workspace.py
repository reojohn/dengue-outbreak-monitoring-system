from typing import Any, Dict, Optional
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text

from app.auth_security import get_current_user
from app.database import engine

router = APIRouter(
    prefix="/workspace",
    tags=["workspace state"],
)

MAX_WORKSPACE_BYTES = max(65536, int(os.getenv("MAX_WORKSPACE_BYTES", "1000000")))


class WorkspaceStateRequest(BaseModel):
    workspace: Dict[str, Any]
    # Kept for backward-compatible frontend payloads. The server never trusts it
    # as an authorization boundary; ownership is derived from the authenticated user.
    user_key: Optional[str] = None


def _workspace_user_key(current_user: Dict[str, Any]) -> str:
    return f"user:{str(current_user['id']).strip().lower()}"


def _legacy_workspace_keys(current_user: Dict[str, Any]) -> list[str]:
    keys = [_workspace_user_key(current_user)]
    email = str(current_user.get("email") or "").strip().lower()
    if email:
        keys.append(f"user:{email}")
    return list(dict.fromkeys(keys))


def _validate_workspace_size(workspace: Dict[str, Any]) -> str:
    encoded = json.dumps(workspace, default=str, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_WORKSPACE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Workspace state is too large to save.",
        )
    return encoded


@router.get("")
def get_workspace_state(
    # The query parameter is accepted only so older deployed frontends do not break.
    # It is intentionally ignored for authorization and data selection.
    user_key: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    allowed_keys = _legacy_workspace_keys(current_user)
    primary_key = allowed_keys[0]
    legacy_key = allowed_keys[1] if len(allowed_keys) > 1 else primary_key

    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                select user_key, workspace, updated_at
                from public.workspace_states
                where user_key in (:primary_key, :legacy_key)
                order by case when user_key = :primary_key then 0 else 1 end, updated_at desc
                limit 1
                """
            ),
            {"primary_key": primary_key, "legacy_key": legacy_key},
        ).mappings().first()

    return {
        "message": "Workspace state loaded from Supabase." if row else "No saved workspace state found.",
        "user_key": primary_key,
        "workspace": row["workspace"] if row else None,
        "updated_at": str(row["updated_at"]) if row and row.get("updated_at") else None,
    }


@router.put("")
def save_workspace_state(
    payload: WorkspaceStateRequest,
    current_user=Depends(get_current_user),
):
    owner_key = _workspace_user_key(current_user)
    workspace_json = _validate_workspace_size(payload.workspace)

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
                "user_key": owner_key,
                "workspace": workspace_json,
            },
        ).mappings().first()

    return {
        "message": "Workspace state saved to Supabase.",
        "user_key": row["user_key"],
        "workspace": row["workspace"],
        "updated_at": str(row["updated_at"]) if row.get("updated_at") else None,
    }


@router.delete("")
def clear_workspace_state(
    user_key: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    allowed_keys = _legacy_workspace_keys(current_user)
    primary_key = allowed_keys[0]
    legacy_key = allowed_keys[1] if len(allowed_keys) > 1 else primary_key
    with engine.begin() as connection:
        connection.execute(
            text("delete from public.workspace_states where user_key in (:primary_key, :legacy_key)"),
            {"primary_key": primary_key, "legacy_key": legacy_key},
        )

    return {
        "message": "Workspace state cleared from Supabase.",
        "user_key": primary_key,
    }
