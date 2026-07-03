from fastapi import APIRouter

from app.services.alignment_checker import build_alignment_report
from app.services.database_integration import get_latest_integration_dataset
from app.services.integration_builder import build_model_ready_dataset
from app.services.integration_state import (
    build_source_status_summary,
    clear_integration_sources,
)

router = APIRouter(
    prefix="/integration",
    tags=["integration"],
)


@router.get("/status")
def get_integration_status():
    return build_source_status_summary()

@router.get("/latest-dataset")
def get_latest_saved_integration_dataset():
    return get_latest_integration_dataset()


@router.get("/alignment-report")
def get_alignment_report():
    return build_alignment_report()


@router.post("/build-dataset")
def build_integration_dataset():
    return build_model_ready_dataset()


@router.delete("/reset")
def reset_integration_workspace():
    clear_integration_sources()
    return {
        "message": "Backend integration workspace cleared.",
        "integration_status": build_source_status_summary(),
    }
