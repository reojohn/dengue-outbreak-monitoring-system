from fastapi import APIRouter, Depends, Query

from app.auth_security import get_current_user
from app.services.barangay_normalizer import normalize_barangay_key
from app.services.database_boundaries import get_latest_boundary_geojson, get_local_boundary_geojson
from app.services.geospatial_hotspot import (
    build_geospatial_hotspots,
    get_latest_cached_hotspot_levels,
)
from app.services.database_forecasts import get_latest_forecast_risk_levels

router = APIRouter(
    prefix="/geospatial",
    tags=["geospatial"],
)


@router.get("/boundary")
def get_shared_boundary_geojson(
    scope: str = Query(
        "",
        description=(
            "Use 'city' when the map needs all Butuan barangay boundaries for geographic context, "
            "or 'local' for a BHW assigned barangay plus immediate neighboring polygons."
        ),
    ),
    current_user=Depends(get_current_user),
):
    role = str(current_user.get("role") or "").strip().lower()
    assigned_barangay = str(current_user.get("assigned_barangay") or "").strip()
    requested_scope = str(scope or "").strip().lower()

    # Keep the lightweight assigned-polygon response as the BHW default so
    # sign-in/BHW workspace loading stays small. The dedicated Map page may
    # explicitly request the complete city boundary layer for geographic
    # context. The BHW Map page can request the smaller ``local`` scope,
    # which includes only the assigned polygon and directly neighboring
    # polygons. Neighbor properties are enriched only with compact forecast
    # risk and saved hotspot classification so the worker gets spatial
    # awareness without receiving city-wide records.
    if role == "bhw" and requested_scope == "local":
        result = get_local_boundary_geojson(assigned_barangay)
        forecast_rows = get_latest_forecast_risk_levels()
        forecast_by_key = {
            normalize_barangay_key(row.get("barangay") or row.get("barangay_key") or ""): row
            for row in forecast_rows
        }

        # Reuse the newest saved GIS classifications when they exist. The BHW
        # local map must not assume the hotspot check used the default radius
        # and fallback parameters, because a saved run with different GIS
        # settings is still the authoritative latest result. This helper reads
        # only compact labels and never triggers the heavy city-wide analysis.
        hotspot_rows = get_latest_cached_hotspot_levels()

        hotspot_by_key = {
            normalize_barangay_key(row.get("barangay") or row.get("barangay_key") or ""): row
            for row in hotspot_rows
        }

        for feature in (result.get("boundary_geojson") or {}).get("features") or []:
            properties = feature.setdefault("properties", {})
            feature_key = normalize_barangay_key(
                properties.get("barangay")
                or properties.get("barangay_key")
                or properties.get("adm4_name")
                or properties.get("adm4_ref_name")
                or ""
            )
            forecast_row = forecast_by_key.get(feature_key) or {}
            hotspot_row = hotspot_by_key.get(feature_key) or {}

            # Expose only the compact map labels needed by the BHW. Neighbor
            # forecast totals, scores, historical counts, and detailed decision
            # records remain private to their own barangay/city-level roles.
            properties["risk_level"] = forecast_row.get("risk_level") or ""
            properties["hotspot_level"] = hotspot_row.get("hotspot_level") or ""

        return {
            **result,
            "boundary_scope": "local_context",
            "scope_barangay": assigned_barangay,
        }

    scope_barangay = (
        None
        if role != "bhw" or requested_scope == "city"
        else assigned_barangay
    )

    result = get_latest_boundary_geojson(barangay=scope_barangay)
    return {
        **result,
        "boundary_scope": "city_context" if scope_barangay is None else "assigned_barangay",
    }


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
