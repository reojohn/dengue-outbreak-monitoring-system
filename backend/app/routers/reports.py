from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.database_reports import get_generated_reports, save_generated_report

router = APIRouter(
    prefix="/reports",
    tags=["reports"],
)


class GeneratedReportPayload(BaseModel):
    report_code: str | None = None
    report_type: str
    report_title: str = "Weekly Dengue Response Planning Report"
    generated_by: str = "CHO user"
    generated_role: str = "City Health Office / Barangay Dengue Response Team"
    generated_at: str | None = None
    forecast_run_id: str | None = None
    file_path: str | None = None
    export_status: str = "generated"
    metadata: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)


def _payload_to_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()

    return payload.dict()


@router.post("/generated")
async def create_generated_report(payload: GeneratedReportPayload):
    report = save_generated_report(_payload_to_dict(payload))

    return {
        "message": "Generated report record saved successfully.",
        "report": report,
    }


@router.get("/generated")
async def list_generated_reports(
    limit: int = Query(default=20, ge=1, le=100),
):
    return get_generated_reports(limit=limit)
