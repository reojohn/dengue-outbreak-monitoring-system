from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_security import require_roles
from app.services.barangay_normalizer import normalize_barangay_key
from app.services.database_analytics import (
    get_barangay_trend_analytics,
    get_city_trend_analytics,
    get_trend_barangays,
)

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
)

ALLOWED_ANALYTICS_ROLES = ("cho", "supervisor", "bhw", "admin", "viewer")


def _scope_barangay_for_user(current_user: dict) -> str | None:
    if str(current_user.get("role") or "").strip().lower() != "bhw":
        return None
    return str(current_user.get("assigned_barangay") or "").strip() or None


@router.get("/barangays")
def list_barangays_for_trend_analytics(
    current_user=Depends(require_roles(*ALLOWED_ANALYTICS_ROLES)),
):
    return get_trend_barangays(scope_barangay=_scope_barangay_for_user(current_user))


@router.get("/city-trends")
def get_citywide_trends(
    year: int | None = Query(default=None, ge=1900, le=2200),
    quarter: int | None = Query(default=None, ge=1, le=4),
    month: int | None = Query(default=None, ge=1, le=12),
    include_classification: bool = Query(default=False),
    include_barangay_breakdown: bool = Query(default=False),
    current_user=Depends(require_roles("cho", "supervisor", "admin", "viewer")),
):
    if quarter is not None and month is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose either a quarter or a month filter, not both.",
        )

    return get_city_trend_analytics(
        year=year,
        quarter=quarter,
        month=month,
        include_classification=include_classification,
        include_barangay_breakdown=include_barangay_breakdown,
    )


@router.get("/barangay-trends")
def get_barangay_trends(
    barangay: str = Query(min_length=1, max_length=160),
    year: int | None = Query(default=None, ge=1900, le=2200),
    quarter: int | None = Query(default=None, ge=1, le=4),
    month: int | None = Query(default=None, ge=1, le=12),
    current_user=Depends(require_roles(*ALLOWED_ANALYTICS_ROLES)),
):
    if quarter is not None and month is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose either a quarter or a month filter, not both.",
        )

    assigned_barangay = _scope_barangay_for_user(current_user)
    if assigned_barangay:
        if normalize_barangay_key(barangay) != normalize_barangay_key(assigned_barangay):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="BHW accounts can only view trend analytics for their assigned barangay.",
            )
        barangay = assigned_barangay

    return get_barangay_trend_analytics(
        barangay=barangay,
        year=year,
        quarter=quarter,
        month=month,
    )
