from fastapi import APIRouter, Query

from app.services.geospatial_hotspot import build_geospatial_hotspots

router = APIRouter(
    prefix="/geospatial",
    tags=["geospatial"],
)


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
):
    return build_geospatial_hotspots(
        radius_km=radius_km,
        fallback_nearest_count=fallback_nearest_count,
        force_refresh=force_refresh,
        cached_only=cached_only,
    )
