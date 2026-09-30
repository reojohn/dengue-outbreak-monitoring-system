from copy import deepcopy

from fastapi import APIRouter, Depends

from app.auth_security import get_current_user
from app.services.barangay_normalizer import normalize_barangay_key
from app.services.database_forecasts import get_latest_forecast_result_from_database
from app.services.database_uploads import get_latest_dataset_uploads
from app.services.baseline_forecast import classify_forecast_risk, get_recommendation
from app.services.risk_configuration import public_risk_configuration

router = APIRouter(
    prefix="/forecast",
    tags=["forecast"],
)


def _apply_active_risk_thresholds(result: dict) -> dict:
    """Reclassify saved case forecasts at read time using the active CHO/Admin cutoffs.

    Forecast case values remain unchanged; only the operational Low/Moderate/High
    label and recommendation are refreshed. This avoids rewriting forecast rows.
    """
    if not result or not result.get("has_saved_forecast"):
        return result
    updated = deepcopy(result)
    rows = list(updated.get("forecast_results") or [])
    counts = {"High": 0, "Moderate": 0, "Low": 0}
    for row in rows:
        forecast = row.get("forecast_next_4_periods") or row.get("forecast") or 0
        risk = classify_forecast_risk(forecast)
        row["risk_level"] = risk
        row["risk"] = risk
        row["recommendation"] = get_recommendation(risk, row.get("trend_direction") or row.get("trend") or "Stable")
        counts[risk] += 1
    updated["forecast_results"] = rows
    updated["risk_counts"] = counts
    updated["risk_thresholds"] = public_risk_configuration()
    return updated


def _scope_forecast_for_user(result: dict, current_user: dict) -> dict:
    """Return the shared forecast with BHW rows restricted to the assigned barangay."""
    role = str(current_user.get("role") or "").strip().lower()
    if role != "bhw" or not result.get("has_saved_forecast"):
        return result

    assigned_barangay = str(current_user.get("assigned_barangay") or "").strip()
    assigned_key = normalize_barangay_key(assigned_barangay)
    scoped = deepcopy(result)
    all_rows = list(scoped.get("forecast_results") or [])
    scoped_rows = [
        row
        for row in all_rows
        if normalize_barangay_key(row.get("barangay") or row.get("barangay_key") or "") == assigned_key
    ]

    scoped_risk_counts = {"High": 0, "Moderate": 0, "Low": 0}
    for row in scoped_rows:
        risk_level = str(row.get("risk_level") or row.get("risk") or "Low")
        if risk_level in scoped_risk_counts:
            scoped_risk_counts[risk_level] += 1

    scoped["forecast_results"] = scoped_rows
    scoped["barangay_count"] = len(scoped_rows)
    scoped["total_barangay_count"] = len(all_rows)
    scoped["total_forecast_next_4_periods"] = sum(
        int(row.get("forecast_next_4_periods") or 0) for row in scoped_rows
    )
    scoped["risk_counts"] = scoped_risk_counts
    scoped["city_summary"] = {
        "barangay_count": len(all_rows),
        "risk_counts": result.get("risk_counts") or {},
    }
    scoped["scope"] = "assigned_barangay"
    scoped["scope_barangay"] = assigned_barangay
    return scoped


@router.get("/latest")
def get_latest_saved_forecast(current_user=Depends(get_current_user)):
    result = _apply_active_risk_thresholds(get_latest_forecast_result_from_database())
    return _scope_forecast_for_user(result, current_user)


@router.get("/system-status")
def get_shared_system_status(current_user=Depends(get_current_user)):
    """Small shared readiness/source snapshot for all authenticated roles.

    This intentionally exposes only persisted upload metadata and readiness counts,
    never raw uploaded rows. It lets BHW/Supervisor/Viewer screens stay synchronized
    without granting access to the protected /uploads router.
    """
    status = get_latest_dataset_uploads()
    uploads = {}

    for dataset_type, upload in (status.get("uploads") or {}).items():
        uploads[dataset_type] = {
            "dataset_type": dataset_type,
            "original_filename": upload.get("original_filename", ""),
            "file_type": upload.get("file_type", ""),
            "status": upload.get("status", ""),
            "original_row_count": upload.get("original_row_count", 0),
            "valid_row_count": upload.get("valid_row_count", 0),
            "invalid_row_count": upload.get("invalid_row_count", 0),
            "validation_counts": upload.get("validation_counts") or {},
            "coverage_start": upload.get("coverage_start", ""),
            "coverage_end": upload.get("coverage_end", ""),
            "uploaded_at": upload.get("uploaded_at", ""),
        }

    return {
        "required_types": status.get("required_types") or [],
        "uploads": uploads,
        "completed_types": status.get("completed_types") or [],
        "missing_types": status.get("missing_types") or [],
        "all_required_uploaded": bool(status.get("all_required_uploaded")),
        "integration_status": status.get("integration_status") or {},
        "integration_readiness": status.get("integration_readiness"),
        "forecast_status": status.get("forecast_status") or {},
    }
