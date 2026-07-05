from fastapi import APIRouter

from app.ml.model_service import (
    evaluate_latest_model,
    forecast_with_latest_model,
    get_latest_metrics,
    train_latest_model,
    auto_run_latest_model,
)

router = APIRouter(
    prefix="/models",
    tags=["models"],
)


@router.post("/train")
def train_model():
    return train_latest_model()


@router.post("/evaluate")
def evaluate_model():
    return evaluate_latest_model()


@router.post("/forecast")
def forecast_model():
    return forecast_with_latest_model()


@router.get("/latest-metrics")
def latest_metrics():
    return get_latest_metrics()

@router.post("/auto-run")
def auto_run_model():
    return auto_run_latest_model()