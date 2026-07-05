from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import decision_actions, forecasts, geospatial, integration, models, notifications, reports, uploads, workspace, sessions
from sqlalchemy import text
from app.database import engine, test_database_connection

app = FastAPI(
    title="Dengue Predictive Analytics API",
    description="Backend API for dengue data ingestion, forecasting, risk scoring, and reporting.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router)
app.include_router(integration.router)
app.include_router(forecasts.router)
app.include_router(models.router)
app.include_router(geospatial.router)
app.include_router(notifications.router)
app.include_router(decision_actions.router)
app.include_router(reports.router)
app.include_router(workspace.router)
app.include_router(sessions.router)


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


@app.post("/health/database/test-insert")
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
