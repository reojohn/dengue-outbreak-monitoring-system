import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth_security import require_roles
from app.database import engine, test_database_connection
from app.routers import (
    analytics,
    auth,
    decision_actions,
    field_updates,
    forecasts,
    geospatial,
    integration,
    models,
    notifications,
    public,
    reports,
    sessions,
    uploads,
    workspace,
    workflow_realtime,
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

# Vite automatically increments its dev-server port when 5173 is already in
# use. During local testing that could move the UI to 5175/5176 and make the
# browser report only "Failed to fetch" even though the API was healthy.
# Accept loopback/private-LAN HTTP origins on any local dev port, but never use
# this broad development regex on the production deployment.
local_dev_origin_regex = (
    r"^http://(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+):\d{2,5}$"
    if not IS_PRODUCTION
    else None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=local_dev_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Cache-Control", "Pragma", "X-Workflow-Client-ID"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    # API/auth responses should not be cached by shared proxies or the browser.
    if request.url.path.startswith((
        "/auth",
        "/workspace",
        "/notifications",
        "/workflow-realtime",
        "/field-updates",
    )):
        response.headers["Cache-Control"] = "no-store"

    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.include_router(public.router)
app.include_router(auth.router)
app.include_router(analytics.router)
app.include_router(uploads.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(integration.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(forecasts.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(models.router)
app.include_router(geospatial.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(notifications.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(decision_actions.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin"))])
app.include_router(field_updates.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin"))])
app.include_router(workflow_realtime.router)
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
