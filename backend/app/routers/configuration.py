from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth_security import get_current_user
from app.services.hotspot_configuration import (
    public_hotspot_configuration,
    reset_hotspot_configuration,
    save_hotspot_configuration,
)
from app.services.risk_configuration import (
    public_risk_configuration,
    reset_risk_configuration,
    save_risk_configuration,
)

router = APIRouter(prefix="/configuration", tags=["configuration"])


class RiskThresholdUpdate(BaseModel):
    moderate_threshold: int
    high_threshold: int


def _actor(current_user):
    return (
        current_user.get("full_name")
        or current_user.get("name")
        or current_user.get("email")
        or current_user.get("username")
        or "CHO/Admin"
    )


@router.get("/risk-thresholds")
def get_risk_thresholds(current_user=Depends(get_current_user)):
    return public_risk_configuration()


@router.put("/risk-thresholds")
def update_risk_thresholds(payload: RiskThresholdUpdate, current_user=Depends(get_current_user)):
    role = str(current_user.get("role") or "").lower()
    if role not in {"cho", "admin"}:
        raise HTTPException(status_code=403, detail="Only CHO/Admin can change risk thresholds.")
    try:
        return save_risk_configuration(payload.moderate_threshold, payload.high_threshold, _actor(current_user))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/risk-thresholds/reset")
def reset_risk_thresholds(current_user=Depends(get_current_user)):
    role = str(current_user.get("role") or "").lower()
    if role not in {"cho", "admin"}:
        raise HTTPException(status_code=403, detail="Only CHO/Admin can reset risk thresholds.")
    return reset_risk_configuration(_actor(current_user))


class HotspotConfigurationUpdate(BaseModel):
    local_weight: int
    nearby_weight: int
    spatial_weight: int
    radius_km: float
    watch_threshold: int
    emerging_threshold: int
    confirmed_threshold: int


@router.get("/hotspot-analysis")
def get_hotspot_analysis_configuration(current_user=Depends(get_current_user)):
    return public_hotspot_configuration()


@router.put("/hotspot-analysis")
def update_hotspot_analysis_configuration(payload: HotspotConfigurationUpdate, current_user=Depends(get_current_user)):
    role = str(current_user.get("role") or "").lower()
    if role not in {"cho", "admin"}:
        raise HTTPException(status_code=403, detail="Only CHO/Admin can change hotspot settings.")
    try:
        return save_hotspot_configuration(
            payload.local_weight, payload.nearby_weight, payload.spatial_weight, payload.radius_km,
            payload.watch_threshold, payload.emerging_threshold, payload.confirmed_threshold, _actor(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/hotspot-analysis/reset")
def reset_hotspot_analysis_configuration(current_user=Depends(get_current_user)):
    role = str(current_user.get("role") or "").lower()
    if role not in {"cho", "admin"}:
        raise HTTPException(status_code=403, detail="Only CHO/Admin can reset hotspot settings.")
    return reset_hotspot_configuration(_actor(current_user))
