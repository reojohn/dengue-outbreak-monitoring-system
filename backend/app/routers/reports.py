import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth_security import get_current_user, require_roles
from app.services.database_reports import get_generated_reports, save_generated_report

router = APIRouter(
    prefix="/reports",
    tags=["reports"],
)

MAX_REPORT_METADATA_BYTES = 256 * 1024


class GeneratedReportPayload(BaseModel):
    report_code: str | None = Field(default=None, max_length=100)
    report_type: str = Field(min_length=1, max_length=80)
    report_title: str = Field(default="Weekly Dengue Response Planning Report", max_length=240)
    generated_by: str = Field(default="CHO user", max_length=240)
    generated_role: str = Field(default="City Health Office / Barangay Dengue Response Team", max_length=160)
    generated_at: str | None = Field(default=None, max_length=80)
    forecast_run_id: str | None = Field(default=None, max_length=64)
    file_path: str | None = Field(default=None, max_length=500)
    export_status: str = Field(default="generated", max_length=40)
    metadata: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)


def _payload_to_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    return payload.dict()


def _validate_report_payload_size(payload: dict[str, Any]) -> None:
    encoded = json.dumps(
        {"metadata": payload.get("metadata") or {}, "summary": payload.get("summary") or {}},
        default=str,
        separators=(",", ":"),
    ).encode("utf-8")
    if len(encoded) > MAX_REPORT_METADATA_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Report metadata is too large to save.",
        )


@router.post("/generated")
async def create_generated_report(
    payload: GeneratedReportPayload,
    current_user=Depends(require_roles("admin", "cho", "supervisor")),
):
    report_payload = _payload_to_dict(payload)
    _validate_report_payload_size(report_payload)

    # Do not trust the browser to identify who generated an official report.
    report_payload["generated_by"] = current_user.get("full_name") or current_user.get("email") or "Authenticated user"
    report_payload["generated_role"] = current_user.get("role") or "user"
    metadata = dict(report_payload.get("metadata") or {})
    metadata["generated_by_user_id"] = str(current_user["id"])
    report_payload["metadata"] = metadata

    report = save_generated_report(report_payload)
    return {
        "message": "Generated report record saved successfully.",
        "report": report,
    }


@router.get("/generated")
async def list_generated_reports(
    limit: int = Query(default=20, ge=1, le=100),
    current_user=Depends(get_current_user),
):
    return get_generated_reports(limit=limit)
