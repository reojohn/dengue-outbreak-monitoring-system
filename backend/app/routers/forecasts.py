from fastapi import APIRouter

from app.services.database_forecasts import get_latest_forecast_result_from_database

router = APIRouter(
    prefix="/forecast",
    tags=["forecast"],
)


@router.get("/latest")
def get_latest_saved_forecast():
    return get_latest_forecast_result_from_database()