import base64
import hashlib
import hmac
import json
import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = max(1, min(int(os.getenv("JWT_EXPIRE_HOURS", "12")), 24))
PASSWORD_ITERATIONS = max(600000, int(os.getenv("PASSWORD_ITERATIONS", "600000")))
MAX_TOKEN_LENGTH = 8192


def _is_production_runtime() -> bool:
    environment = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
    render_flag = (os.getenv("RENDER") or "").strip().lower()
    return environment in {"production", "prod"} or render_flag in {"1", "true", "yes"}


JWT_SECRET = (os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or "").strip()
if not JWT_SECRET:
    if _is_production_runtime():
        raise RuntimeError("JWT_SECRET_KEY is required in production.")

    # Local development remains usable without a committed/shared secret, but all
    # sessions become invalid whenever the backend restarts. This is safer than a
    # public hard-coded fallback secret.
    JWT_SECRET = secrets.token_urlsafe(48)
    warnings.warn(
        "JWT_SECRET_KEY is not set. Using a temporary development secret; existing sessions will expire on restart.",
        RuntimeWarning,
        stacklevel=2,
    )

if len(JWT_SECRET) < 32:
    if _is_production_runtime():
        raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters in production.")
    warnings.warn("JWT_SECRET_KEY should be at least 32 characters.", RuntimeWarning, stacklevel=2)

bearer_scheme = HTTPBearer(auto_error=False)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected_digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iteration_count = int(iterations)
        if iteration_count <= 0 or iteration_count > 5_000_000:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iteration_count,
        ).hex()
        return hmac.compare_digest(digest, expected_digest)
    except Exception:
        return False


def password_needs_rehash(stored_hash: str) -> bool:
    try:
        algorithm, iterations, _salt, _digest = stored_hash.split("$", 3)
        return algorithm != "pbkdf2_sha256" or int(iterations) < PASSWORD_ITERATIONS
    except Exception:
        return True


def create_access_token(payload: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    expire_at = now + (expires_delta or timedelta(hours=JWT_EXPIRE_HOURS))

    token_payload = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int(expire_at.timestamp()),
    }

    header = {"typ": "JWT", "alg": JWT_ALGORITHM}
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(token_payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        if not token or len(token) > MAX_TOKEN_LENGTH:
            raise ValueError("Invalid token size")

        encoded_header, encoded_payload, encoded_signature = token.split(".", 2)
        header = json.loads(_b64url_decode(encoded_header))
        if header.get("typ") != "JWT" or header.get("alg") != JWT_ALGORITHM:
            raise ValueError("Unsupported token header")

        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        expected_signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_signature = _b64url_decode(encoded_signature)

        if not hmac.compare_digest(expected_signature, actual_signature):
            raise ValueError("Invalid token signature")

        payload = json.loads(_b64url_decode(encoded_payload))
        exp = int(payload.get("exp", 0))
        now_timestamp = int(datetime.now(timezone.utc).timestamp())
        if exp <= now_timestamp:
            raise ValueError("Token expired")

        issued_at = int(payload.get("iat", 0))
        if issued_at <= 0 or issued_at > now_timestamp + 300:
            raise ValueError("Invalid token issued-at timestamp")

        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required.",
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    session_id = payload.get("sid")

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject.")

    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token session.")

    session_row = db.execute(
        text(
            """
            select session_id, user_id, token_expires_at, revoked_at
            from public.auth_sessions
            where session_id = :session_id
              and user_id = :user_id
            limit 1
            """
        ),
        {"session_id": session_id, "user_id": user_id},
    ).mappings().first()

    if not session_row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication session is invalid.")

    if session_row["revoked_at"] is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication session has been revoked.")

    token_expires_at = session_row["token_expires_at"]
    if token_expires_at and token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication session has expired.")

    row = db.execute(
        text(
            """
            select id, email, full_name, role, assigned_barangay, is_active
            from public.app_users
            where id = :id
            limit 1
            """
        ),
        {"id": user_id},
    ).mappings().first()

    if not row or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or missing.")

    current_user = dict(row)
    current_user["session_id"] = str(session_id)
    return current_user


def require_roles(*allowed_roles: str):
    def dependency(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if allowed_roles and current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account role is not allowed to perform this action.",
            )
        return current_user

    return dependency
