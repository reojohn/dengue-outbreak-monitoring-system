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
):
    return build_geospatial_hotspots(
        radius_km=radius_km,
        fallback_nearest_count=fallback_nearest_count,
    )
