from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import uploads

app = FastAPI(
    title="Dengue Predictive Analytics API",
    description="Backend API for dengue data ingestion, forecasting, risk scoring, and reporting.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router)


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