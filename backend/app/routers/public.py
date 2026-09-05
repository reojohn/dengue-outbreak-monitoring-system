from fastapi import APIRouter, Response

from app.services.public_summary import get_public_system_summary

router = APIRouter(
    prefix="/public",
    tags=["public"],
)


@router.get("/system-summary")
def get_system_summary(response: Response):
    # The public landing page should reflect the latest completed integration
    # whenever it is loaded instead of being served a stale browser/proxy copy.
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return get_public_system_summary()
