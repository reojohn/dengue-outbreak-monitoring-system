import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth_security import require_roles
from app.database import engine, test_database_connection
from app.routers import (
    auth,
    decision_actions,
    field_updates,
    forecasts,
    geospatial,
    integration,
    models,
    notifications,
    reports,
    sessions,
    uploads,
    workspace,
)
from app.routers.auth import ensure_auth_tables


def _is_production_runtime() -> bool:
    environment = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
    render_flag = (os.getenv("RENDER") or "").strip().lower()
    return environment in {"production", "prod"} or render_flag in {"1", "true", "yes"}


IS_PRODUCTION = _is_production_runtime()

app = FastAPI(
    title="Dengue Predictive Analytics API",
    description="Backend API for dengue data ingestion, forecasting, risk scoring, and reporting.",
    version="0.1.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

local_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

deployed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

allowed_origins = list(dict.fromkeys(local_origins + deployed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Local network testing remains available for a Vite dev server on trusted LANs.
    allow_origin_regex=r"http://192\.168\.\d+\.\d+:5173",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    # API/auth responses should not be cached by shared proxies or the browser.
    if request.url.path.startswith(("/auth", "/workspace", "/notifications")):
        response.headers["Cache-Control"] = "no-store"

    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.include_router(auth.router)
app.include_router(uploads.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(integration.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(forecasts.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(models.router)
app.include_router(geospatial.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(notifications.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(decision_actions.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin"))])
app.include_router(field_updates.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin"))])
app.include_router(reports.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(workspace.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])

# Legacy demo sessions are not needed on the public deployment. Keep them locally
# for backward-compatible development/testing only.
if not IS_PRODUCTION:
    app.include_router(sessions.router)


@app.on_event("startup")
def startup_auth_setup():
    ensure_auth_tables()
    notifications.ensure_notification_preferences_table()
    field_updates.ensure_field_updates_table()


@app.get("/")
def read_root():
    return {
        "message": "Dengue Predictive Analytics API is running.",
        "status": "ok",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "backend": "running",
    }


@app.get("/health/database", dependencies=[Depends(require_roles("admin", "cho"))])
def database_health_check():
    connected_at = test_database_connection()
    return {
        "status": "connected",
        "connected_at": connected_at,
    }


@app.post("/health/database/test-insert", dependencies=[Depends(require_roles("admin", "cho"))])
def database_test_insert():
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                insert into public.activity_logs (action, details, entity_type)
                values (:action, :details, :entity_type)
                """
            ),
            {
                "action": "fastapi_test_insert",
                "details": "FastAPI successfully inserted a row into Supabase.",
                "entity_type": "system",
            },
        )

    return {
        "status": "success",
        "message": "FastAPI inserted a test row into Supabase activity_logs.",
    }
