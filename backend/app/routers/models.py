from fastapi import APIRouter, Depends

from app.auth_security import require_roles
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


@router.post("/train", dependencies=[Depends(require_roles("cho", "admin"))])
def train_model():
    return train_latest_model()


@router.post("/evaluate", dependencies=[Depends(require_roles("cho", "admin"))])
def evaluate_model():
    return evaluate_latest_model()


@router.post("/forecast", dependencies=[Depends(require_roles("cho", "admin"))])
def forecast_model():
    return forecast_with_latest_model()


@router.get(
    "/latest-metrics",
    dependencies=[Depends(require_roles("cho", "supervisor", "bhw", "admin", "viewer"))],
)
def latest_metrics():
    # Read-only technical metrics are shared across authorized roles. The heavy
    # train/evaluate/forecast endpoints above remain CHO/Admin only.
    return get_latest_metrics()


@router.post("/auto-run", dependencies=[Depends(require_roles("cho", "admin"))])
def auto_run_model():
    return auto_run_latest_model()
