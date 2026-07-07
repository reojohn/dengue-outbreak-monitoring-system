from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth_security import (
    JWT_EXPIRE_HOURS,
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from app.database import engine, get_db

router = APIRouter(prefix="/auth", tags=["authentication"])
VALID_ROLES = {"cho", "bhw", "supervisor", "admin", "viewer"}
MANAGE_ROLES = ("admin", "cho")


class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreateRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: str
    assigned_barangay: Optional[str] = None
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    assigned_barangay: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=6)


def ensure_auth_tables() -> None:
    """Create the real auth tables only. No demo accounts are inserted here."""
    with engine.begin() as connection:
        connection.execute(text("create extension if not exists pgcrypto"))
        connection.execute(
            text(
                """
                create table if not exists public.app_users (
                    id uuid primary key default gen_random_uuid(),
                    email text not null unique,
                    password_hash text not null,
                    full_name text not null,
                    role text not null check (role in ('cho', 'bhw', 'supervisor', 'admin', 'viewer')),
                    assigned_barangay text,
                    is_active boolean not null default true,
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now(),
                    last_login_at timestamptz,
                    created_by uuid references public.app_users(id) on delete set null
                )
                """
            )
        )
        connection.execute(text("alter table public.app_users add column if not exists created_by uuid references public.app_users(id) on delete set null"))
        connection.execute(text("alter table public.app_users add column if not exists updated_at timestamptz not null default now()"))
        connection.execute(text("alter table public.app_users add column if not exists last_login_at timestamptz"))

        connection.execute(
            text(
                """
                create table if not exists public.auth_sessions (
                    session_id uuid primary key,
                    user_id uuid references public.app_users(id) on delete cascade,
                    token_expires_at timestamptz not null,
                    created_at timestamptz not null default now(),
                    revoked_at timestamptz
                )
                """
            )
        )
        connection.execute(
            text(
                """
                create table if not exists public.user_audit_logs (
                    id uuid primary key default gen_random_uuid(),
                    actor_user_id uuid references public.app_users(id) on delete set null,
                    target_user_id uuid references public.app_users(id) on delete set null,
                    action text not null,
                    details text,
                    created_at timestamptz not null default now()
                )
                """
            )
        )


def public_user(row):
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "assigned_barangay": row["assigned_barangay"] or "",
        "is_active": bool(row["is_active"]),
        "created_at": str(row.get("created_at") or "") if hasattr(row, "get") else "",
        "updated_at": str(row.get("updated_at") or "") if hasattr(row, "get") else "",
        "last_login_at": str(row.get("last_login_at") or "") if hasattr(row, "get") else "",
    }


def write_audit_log(db: Session, *, actor_user_id: Optional[str], target_user_id: Optional[str], action: str, details: str = ""):
    db.execute(
        text(
            """
            insert into public.user_audit_logs (actor_user_id, target_user_id, action, details)
            values (:actor_user_id, :target_user_id, :action, :details)
            """
        ),
        {
            "actor_user_id": actor_user_id,
            "target_user_id": target_user_id,
            "action": action,
            "details": details,
        },
    )


def validate_user_payload(role: str, assigned_barangay: Optional[str]):
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role.")
    if role == "bhw" and not (assigned_barangay or "").strip():
        raise HTTPException(status_code=400, detail="BHW accounts must be assigned to a barangay.")


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            select id, email, password_hash, full_name, role, assigned_barangay, is_active
            from public.app_users
            where lower(email) = lower(:email)
            limit 1
            """
        ),
        {"email": payload.email.strip()},
    ).mappings().first()

    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is inactive.")

    session_id = str(uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    token = create_access_token(
        {"sub": str(row["id"]), "email": row["email"], "role": row["role"], "sid": session_id}
    )

    db.execute(
        text("insert into public.auth_sessions (session_id, user_id, token_expires_at) values (:session_id, :user_id, :token_expires_at)"),
        {"session_id": session_id, "user_id": str(row["id"]), "token_expires_at": expires_at},
    )
    db.execute(text("update public.app_users set last_login_at = now(), updated_at = now() where id = :id"), {"id": str(row["id"])})
    write_audit_log(db, actor_user_id=str(row["id"]), target_user_id=str(row["id"]), action="login", details="User signed in.")
    db.commit()

    return {
        "message": "Login successful.",
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at.isoformat(),
        "session_id": session_id,
        "user": public_user(row),
    }


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return {"user": public_user(current_user)}


@router.post("/logout")
def logout(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        text(
            """
            update public.auth_sessions
            set revoked_at = now()
            where session_id = :session_id
              and user_id = :user_id
              and revoked_at is null
            """
        ),
        {
            "session_id": str(current_user.get("session_id")),
            "user_id": str(current_user["id"]),
        },
    )
    write_audit_log(db, actor_user_id=str(current_user["id"]), target_user_id=str(current_user["id"]), action="logout", details="User signed out.")
    db.commit()
    return {"message": "Logout recorded."}


@router.get("/users", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def list_users(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            select id, email, full_name, role, assigned_barangay, is_active, created_at, updated_at, last_login_at
            from public.app_users
            order by role, full_name, email
            """
        )
    ).mappings().all()
    return {"users": [public_user(row) for row in rows]}


@router.post("/users", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def create_user(payload: UserCreateRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    role = payload.role.strip().lower()
    assigned = (payload.assigned_barangay or "").strip() or None
    validate_user_payload(role, assigned)

    try:
        row = db.execute(
            text(
                """
                insert into public.app_users (email, password_hash, full_name, role, assigned_barangay, is_active, created_by)
                values (:email, :password_hash, :full_name, :role, :assigned_barangay, :is_active, :created_by)
                returning id, email, full_name, role, assigned_barangay, is_active, created_at, updated_at, last_login_at
                """
            ),
            {
                "email": str(payload.email).strip().lower(),
                "password_hash": hash_password(payload.password),
                "full_name": payload.full_name.strip(),
                "role": role,
                "assigned_barangay": assigned if role == "bhw" else None,
                "is_active": payload.is_active,
                "created_by": str(current_user["id"]),
            },
        ).mappings().first()
        write_audit_log(db, actor_user_id=str(current_user["id"]), target_user_id=str(row["id"]), action="create_user", details=f"Created {row['email']} as {row['role']}.")
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="User account could not be created. Email may already exist.") from exc

    return {"message": "User account created.", "user": public_user(row)}


@router.patch("/users/{user_id}", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def update_user(user_id: str, payload: UserUpdateRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.execute(text("select * from public.app_users where id = :id limit 1"), {"id": user_id}).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="User account was not found.")

    role = (payload.role or existing["role"]).strip().lower()
    assigned = payload.assigned_barangay if payload.assigned_barangay is not None else existing["assigned_barangay"]
    assigned = (assigned or "").strip() or None
    validate_user_payload(role, assigned)

    row = db.execute(
        text(
            """
            update public.app_users
            set email = :email,
                full_name = :full_name,
                role = :role,
                assigned_barangay = :assigned_barangay,
                is_active = :is_active,
                updated_at = now()
            where id = :id
            returning id, email, full_name, role, assigned_barangay, is_active, created_at, updated_at, last_login_at
            """
        ),
        {
            "id": user_id,
            "email": str(payload.email or existing["email"]).strip().lower(),
            "full_name": (payload.full_name or existing["full_name"]).strip(),
            "role": role,
            "assigned_barangay": assigned if role == "bhw" else None,
            "is_active": existing["is_active"] if payload.is_active is None else payload.is_active,
        },
    ).mappings().first()
    write_audit_log(db, actor_user_id=str(current_user["id"]), target_user_id=user_id, action="update_user", details=f"Updated {row['email']}.")
    db.commit()
    return {"message": "User account updated.", "user": public_user(row)}


@router.post("/users/{user_id}/reset-password", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def reset_user_password(user_id: str, payload: PasswordResetRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            update public.app_users
            set password_hash = :password_hash, updated_at = now()
            where id = :id
            returning id, email, full_name, role, assigned_barangay, is_active, created_at, updated_at, last_login_at
        """),
        {"id": user_id, "password_hash": hash_password(payload.password)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User account was not found.")
    db.execute(text("update public.auth_sessions set revoked_at = now() where user_id = :user_id and revoked_at is null"), {"user_id": user_id})
    write_audit_log(db, actor_user_id=str(current_user["id"]), target_user_id=user_id, action="reset_password", details=f"Reset password for {row['email']}.")
    db.commit()
    return {"message": "Password reset successfully.", "user": public_user(row)}


@router.delete("/users/{user_id}", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def delete_user(user_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if str(current_user["id"]) == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own active account.")
    row = db.execute(text("delete from public.app_users where id = :id returning id, email"), {"id": user_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User account was not found.")
    write_audit_log(db, actor_user_id=str(current_user["id"]), target_user_id=None, action="delete_user", details=f"Deleted {row['email']}.")
    db.commit()
    return {"message": "User account deleted."}


@router.get("/users/audit", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def list_user_audit_logs(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            select l.id, l.action, l.details, l.created_at,
                   actor.full_name as actor_name, actor.email as actor_email,
                   target.full_name as target_name, target.email as target_email
            from public.user_audit_logs l
            left join public.app_users actor on actor.id = l.actor_user_id
            left join public.app_users target on target.id = l.target_user_id
            order by l.created_at desc
            limit 100
            """
        )
    ).mappings().all()
    return {"logs": [dict(row) for row in rows]}


@router.get("/barangays", dependencies=[Depends(require_roles(*MANAGE_ROLES))])
def list_barangays(db: Session = Depends(get_db)):
    try:
        rows = db.execute(
            text(
                """
                select distinct barangay
                from public.barangay_boundaries
                where barangay is not null and trim(barangay) <> ''
                order by barangay
                """
            )
        ).mappings().all()
        names = [row["barangay"] for row in rows]
    except Exception:
        names = []
    return {"barangays": names}
