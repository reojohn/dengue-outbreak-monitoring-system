from fastapi import APIRouter, Depends, Query

from app.auth_security import get_current_user
from app.services.barangay_normalizer import normalize_barangay_key
from app.services.database_boundaries import get_latest_boundary_geojson
from app.services.geospatial_hotspot import build_geospatial_hotspots

router = APIRouter(
    prefix="/geospatial",
    tags=["geospatial"],
)


@router.get("/boundary")
def get_shared_boundary_geojson(current_user=Depends(get_current_user)):
    role = str(current_user.get("role") or "").strip().lower()
    assigned_barangay = str(current_user.get("assigned_barangay") or "").strip()

    # BHW accounts receive only their assigned polygon. Other authorized roles
    # receive the city boundary layer when they actually open a map/report view.
    scope_barangay = assigned_barangay if role == "bhw" else None
    return get_latest_boundary_geojson(barangay=scope_barangay)


@router.get("/hotspots")
def get_geospatial_hotspots(
    radius_km: float = Query(
        3.0,
        ge=0.5,
        le=15,
        description="Distance radius in kilometers used to check nearby barangay influence.",
    ),
    fallback_nearest_count: int = Query(
        3,
        ge=1,
        le=8,
        description="Number of nearest barangays used when no barangay is inside the selected radius.",
    ),
    force_refresh: bool = Query(
        False,
        description="Recalculate and replace the saved result for the latest integration run.",
    ),
    cached_only: bool = Query(
        False,
        description="Return only a saved hotspot result and never run the heavy calculation.",
    ),
    current_user=Depends(get_current_user),
):
    role = str(current_user.get("role") or "").strip().lower()

    # BHW accounts can read the latest saved hotspot context but cannot trigger
    # the heavier city-wide spatial recalculation. CHO/Admin/Supervisor keep the
    # existing controls; Viewer remains read-only through the UI.
    result = build_geospatial_hotspots(
        radius_km=radius_km,
        fallback_nearest_count=fallback_nearest_count,
        force_refresh=False if role in {"bhw", "viewer"} else force_refresh,
        cached_only=True if role in {"bhw", "viewer"} else cached_only,
    )

    if role != "bhw":
        return result

    assigned_barangay = str(current_user.get("assigned_barangay") or "").strip()
    assigned_key = normalize_barangay_key(assigned_barangay)
    scoped_hotspots = [
        row
        for row in (result.get("hotspots") or [])
        if normalize_barangay_key(row.get("barangay") or row.get("barangay_key") or "") == assigned_key
    ]

    return {
        **result,
        "hotspots": scoped_hotspots,
        "scope": "assigned_barangay",
        "scope_barangay": assigned_barangay,
    }
