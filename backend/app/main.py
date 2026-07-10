import os


from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, decision_actions, forecasts, geospatial, integration, models, notifications, reports, uploads, workspace, sessions
from sqlalchemy import text
from app.database import engine, test_database_connection
from app.auth_security import require_roles
from app.routers.auth import ensure_auth_tables

app = FastAPI(
    title="Dengue Predictive Analytics API",
    description="Backend API for dengue data ingestion, forecasting, risk scoring, and reporting.",
    version="0.1.0",
)

local_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

deployed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

allowed_origins = list(dict.fromkeys(local_origins + deployed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Allows local network testing from phones such as http://192.168.x.x:5173
    allow_origin_regex=r"http://192\.168\.\d+\.\d+:5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(uploads.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(integration.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(forecasts.router, dependencies=[Depends(require_roles("cho", "supervisor", "admin"))])
app.include_router(models.router, dependencies=[Depends(require_roles("cho", "admin"))])
app.include_router(geospatial.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(notifications.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(decision_actions.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin"))])
app.include_router(reports.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(workspace.router, dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))])
app.include_router(sessions.router)


@app.on_event("startup")
def startup_auth_setup():
    ensure_auth_tables()


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


@app.get("/health/database")
def database_health_check():
    connected_at = test_database_connection()

    return {
        "status": "connected",
        "database": "supabase_postgresql",
        "connected_at": connected_at,
    }


@app.post("/health/database/test-insert", dependencies=[Depends(require_roles("admin", "cho"))])
def database_test_insert():
    with engine.begin() as connection:
        connection.execute(
            text("""
                insert into public.activity_logs (action, details, entity_type)
                values (:action, :details, :entity_type)
            """),
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
