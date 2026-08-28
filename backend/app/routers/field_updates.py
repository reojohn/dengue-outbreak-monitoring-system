import json
import re
from datetime import date
from typing import Dict, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth_security import get_current_user
from app.database import engine, get_db
from app.services.notification_state import add_notification_event
from app.services.workflow_realtime import publish_workflow_event

router = APIRouter(prefix="/field-updates", tags=["barangay field updates"])

FIELD_UPDATE_STATUSES = {"Draft", "Submitted", "Reviewed", "Follow-up Required"}
REVIEW_STATUSES = {"Reviewed", "Follow-up Required"}
ENVIRONMENTAL_OBSERVATION_KEYS = {
    "standing_water",
    "uncovered_water_containers",
    "possible_breeding_sites",
    "flood_prone_area",
    "low_lying_area",
    "waste_accumulation",
    "clogged_drainage",
}


class FieldUpdatePayload(BaseModel):
    barangay: str = Field(min_length=1, max_length=180)
    reporting_date: date
    tasks: Dict[str, bool] = Field(default_factory=dict)
    total_tasks: int = Field(default=5, ge=1, le=50)
    observation_note: str = Field(default="", max_length=1200)
    environmental_observations: Dict[str, bool] = Field(default_factory=dict)
    risk_level: str = Field(default="Pending", max_length=40)
    predicted_cases: float = Field(default=0, ge=0)
    is_urgent: bool = False
    suspected_symptoms: bool = False
    supplies_needed: bool = False
    assistance_needed: bool = False


class FieldUpdateReviewPayload(BaseModel):
    status: Literal["Reviewed", "Follow-up Required"]
    supervisor_comment: str = Field(default="", max_length=1200)


def _barangay_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _json_value(value, fallback=None):
    if fallback is None:
        fallback = {}
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return fallback


def ensure_field_updates_table() -> None:
    with engine.begin() as connection:
        connection.execute(text("create extension if not exists pgcrypto"))
        connection.execute(
            text(
                """
                create table if not exists public.field_updates (
                    field_update_id uuid primary key default gen_random_uuid(),
                    barangay text not null,
                    barangay_key text not null,
                    reporting_date date not null,
                    submitted_by uuid not null references public.app_users(id) on delete cascade,
                    tasks jsonb not null default '{}'::jsonb,
                    completed_count integer not null default 0,
                    total_tasks integer not null default 5,
                    observation_note text not null default '',
                    environmental_observations jsonb not null default '{}'::jsonb,
                    risk_level text not null default 'Pending',
                    predicted_cases numeric not null default 0,
                    status text not null default 'Draft',
                    is_urgent boolean not null default false,
                    suspected_symptoms boolean not null default false,
                    supplies_needed boolean not null default false,
                    assistance_needed boolean not null default false,
                    saved_at timestamptz not null default now(),
                    submitted_at timestamptz,
                    reviewed_by uuid references public.app_users(id) on delete set null,
                    reviewed_at timestamptz,
                    supervisor_comment text not null default '',
                    updated_at timestamptz not null default now(),
                    constraint field_updates_status_check check (
                        status in ('Draft', 'Submitted', 'Reviewed', 'Follow-up Required')
                    ),
                    constraint field_updates_daily_unique unique (submitted_by, barangay_key, reporting_date)
                )
                """
            )
        )
        connection.execute(text("alter table public.field_updates add column if not exists environmental_observations jsonb not null default '{}'::jsonb"))
        connection.execute(text("alter table public.field_updates add column if not exists suspected_symptoms boolean not null default false"))
        connection.execute(text("alter table public.field_updates add column if not exists supplies_needed boolean not null default false"))
        connection.execute(text("alter table public.field_updates add column if not exists assistance_needed boolean not null default false"))
        connection.execute(text("alter table public.field_updates add column if not exists supervisor_comment text not null default ''"))
        connection.execute(text("alter table public.field_updates add column if not exists updated_at timestamptz not null default now()"))
        connection.execute(text("create index if not exists field_updates_reporting_date_idx on public.field_updates (reporting_date desc)"))
        connection.execute(text("create index if not exists field_updates_status_idx on public.field_updates (status, submitted_at desc)"))
        connection.execute(text("create index if not exists field_updates_barangay_idx on public.field_updates (barangay_key, reporting_date desc)"))


def _serialize_row(row):
    if not row:
        return None
    item = dict(row)
    tasks = _json_value(item.get("tasks"), {})
    environmental_observations = _json_value(item.get("environmental_observations"), {})
    return {
        "field_update_id": str(item.get("field_update_id")),
        "barangay": item.get("barangay") or "",
        "reporting_date": str(item.get("reporting_date") or ""),
        "submitted_by": str(item.get("submitted_by") or ""),
        "submitted_by_name": item.get("submitted_by_name") or "BHW account",
        "submitted_by_email": item.get("submitted_by_email") or "",
        "tasks": tasks,
        "completed_count": int(item.get("completed_count") or 0),
        "total_tasks": int(item.get("total_tasks") or 0),
        "observation_note": item.get("observation_note") or "",
        "environmental_observations": environmental_observations,
        "risk_level": item.get("risk_level") or "Pending",
        "predicted_cases": float(item.get("predicted_cases") or 0),
        "status": item.get("status") or "Draft",
        "is_urgent": bool(item.get("is_urgent")),
        "suspected_symptoms": bool(item.get("suspected_symptoms")),
        "supplies_needed": bool(item.get("supplies_needed")),
        "assistance_needed": bool(item.get("assistance_needed")),
        "saved_at": str(item.get("saved_at") or ""),
        "submitted_at": str(item.get("submitted_at") or "") if item.get("submitted_at") else None,
        "reviewed_by": str(item.get("reviewed_by") or "") if item.get("reviewed_by") else None,
        "reviewed_by_name": item.get("reviewed_by_name") or "",
        "reviewed_at": str(item.get("reviewed_at") or "") if item.get("reviewed_at") else None,
        "supervisor_comment": item.get("supervisor_comment") or "",
        "updated_at": str(item.get("updated_at") or ""),
    }


def _base_select():
    return """
        select
            fu.*,
            submitter.full_name as submitted_by_name,
            submitter.email as submitted_by_email,
            reviewer.full_name as reviewed_by_name
        from public.field_updates fu
        left join public.app_users submitter on submitter.id = fu.submitted_by
        left join public.app_users reviewer on reviewer.id = fu.reviewed_by
    """


def _require_bhw_barangay(current_user, barangay: str):
    if current_user.get("role") != "bhw":
        raise HTTPException(status_code=403, detail="Only BHW accounts can save or submit barangay field updates.")

    assigned = current_user.get("assigned_barangay") or ""
    if not assigned or _barangay_key(assigned) != _barangay_key(barangay):
        raise HTTPException(status_code=403, detail="You can only report for your assigned barangay.")


def _upsert_update(db: Session, payload: FieldUpdatePayload, current_user, status: str):
    _require_bhw_barangay(current_user, payload.barangay)
    tasks = {str(key): bool(value) for key, value in (payload.tasks or {}).items()}
    environmental_observations = {
        str(key): bool(value)
        for key, value in (payload.environmental_observations or {}).items()
        if str(key) in ENVIRONMENTAL_OBSERVATION_KEYS
    }
    completed_count = sum(1 for value in tasks.values() if value)
    total_tasks = max(int(payload.total_tasks or 1), len(tasks), 1)

    existing = db.execute(
        text(
            """
            select field_update_id, status
            from public.field_updates
            where submitted_by = :submitted_by
              and barangay_key = :barangay_key
              and reporting_date = :reporting_date
            limit 1
            """
        ),
        {
            "submitted_by": str(current_user["id"]),
            "barangay_key": _barangay_key(payload.barangay),
            "reporting_date": payload.reporting_date,
        },
    ).mappings().first()

    if existing and existing["status"] == "Reviewed":
        raise HTTPException(status_code=409, detail="This field update has already been reviewed and can no longer be changed.")
    if existing and existing["status"] == "Submitted" and status == "Draft":
        raise HTTPException(status_code=409, detail="A submitted field update cannot be changed back to a draft.")

    # Keep a requested follow-up visibly open while the BHW saves additional work.
    effective_status = status
    if existing and existing["status"] == "Follow-up Required" and status == "Draft":
        effective_status = "Follow-up Required"

    row = db.execute(
        text(
            f"""
            insert into public.field_updates (
                barangay,
                barangay_key,
                reporting_date,
                submitted_by,
                tasks,
                completed_count,
                total_tasks,
                observation_note,
                environmental_observations,
                risk_level,
                predicted_cases,
                status,
                is_urgent,
                suspected_symptoms,
                supplies_needed,
                assistance_needed,
                saved_at,
                submitted_at,
                reviewed_by,
                reviewed_at,
                supervisor_comment,
                updated_at
            )
            values (
                :barangay,
                :barangay_key,
                :reporting_date,
                :submitted_by,
                cast(:tasks as jsonb),
                :completed_count,
                :total_tasks,
                :observation_note,
                cast(:environmental_observations as jsonb),
                :risk_level,
                :predicted_cases,
                :status,
                :is_urgent,
                :suspected_symptoms,
                :supplies_needed,
                :assistance_needed,
                now(),
                {"now()" if effective_status == "Submitted" else "null"},
                null,
                null,
                '',
                now()
            )
            on conflict (submitted_by, barangay_key, reporting_date)
            do update set
                barangay = excluded.barangay,
                tasks = excluded.tasks,
                completed_count = excluded.completed_count,
                total_tasks = excluded.total_tasks,
                observation_note = excluded.observation_note,
                environmental_observations = excluded.environmental_observations,
                risk_level = excluded.risk_level,
                predicted_cases = excluded.predicted_cases,
                status = excluded.status,
                is_urgent = excluded.is_urgent,
                suspected_symptoms = excluded.suspected_symptoms,
                supplies_needed = excluded.supplies_needed,
                assistance_needed = excluded.assistance_needed,
                saved_at = now(),
                submitted_at = case
                    when excluded.status = 'Submitted' then now()
                    else public.field_updates.submitted_at
                end,
                reviewed_by = case
                    when excluded.status = 'Submitted' then null
                    else public.field_updates.reviewed_by
                end,
                reviewed_at = case
                    when excluded.status = 'Submitted' then null
                    else public.field_updates.reviewed_at
                end,
                supervisor_comment = case
                    when excluded.status = 'Submitted' then ''
                    else public.field_updates.supervisor_comment
                end,
                updated_at = now()
            returning field_update_id
            """
        ),
        {
            "barangay": payload.barangay.strip(),
            "barangay_key": _barangay_key(payload.barangay),
            "reporting_date": payload.reporting_date,
            "submitted_by": str(current_user["id"]),
            "tasks": json.dumps(tasks),
            "completed_count": completed_count,
            "total_tasks": total_tasks,
            "observation_note": payload.observation_note.strip(),
            "environmental_observations": json.dumps(environmental_observations),
            "risk_level": payload.risk_level.strip() or "Pending",
            "predicted_cases": float(payload.predicted_cases or 0),
            "status": effective_status,
            "is_urgent": bool(payload.is_urgent),
            "suspected_symptoms": bool(payload.suspected_symptoms),
            "supplies_needed": bool(payload.supplies_needed),
            "assistance_needed": bool(payload.assistance_needed),
        },
    ).mappings().first()
    db.commit()

    saved = db.execute(
        text(_base_select() + " where fu.field_update_id = :field_update_id limit 1"),
        {"field_update_id": str(row["field_update_id"])},
    ).mappings().first()
    return _serialize_row(saved)


def _send_submission_notifications(update):
    progress = f"{update['completed_count']} of {update['total_tasks']} activities were completed"
    submission_version = re.sub(r"[^0-9A-Za-z]+", "", update.get("submitted_at") or update.get("updated_at") or "submission")
    add_notification_event(
        {
            "id": f"field-update-supervisor-{update['field_update_id']}-{submission_version}",
            "title": "New barangay field update",
            "message": f"{update['barangay']} BHW submitted the {update['reporting_date']} monitoring update. {progress}.",
            "severity": "danger" if update["is_urgent"] or update["risk_level"] == "High" else "activity",
            "category": "barangay_field_update",
            "to": "/supervisor",
            "hash": "barangay-field-updates",
            "recipient_role": "supervisor",
            "meta": {
                "field_update_id": update["field_update_id"],
                "barangay": update["barangay"],
                "status": update["status"],
                "completed_count": update["completed_count"],
                "total_tasks": update["total_tasks"],
            },
        }
    )

    admin_reasons = []
    if update["risk_level"] == "High":
        admin_reasons.append("high dengue risk")
    if update["suspected_symptoms"]:
        admin_reasons.append("suspected dengue symptoms")
    if update["supplies_needed"]:
        admin_reasons.append("supplies requested")
    if update["assistance_needed"]:
        admin_reasons.append("immediate assistance requested")
    if update["is_urgent"]:
        admin_reasons.append("marked urgent")
    if update["completed_count"] < update["total_tasks"] and update["reporting_date"] < date.today().isoformat():
        admin_reasons.append("incomplete beyond the reporting date")

    if admin_reasons:
        add_notification_event(
            {
                "id": f"field-update-admin-{update['field_update_id']}-{submission_version}",
                "title": "Field update needs administrative attention",
                "message": f"{update['barangay']} requires attention: {', '.join(admin_reasons)}.",
                "severity": "danger",
                "category": "barangay_field_update_escalation",
                "to": "/supervisor",
                "hash": "barangay-field-updates",
                "recipient_role": "admin",
                "meta": {
                    "field_update_id": update["field_update_id"],
                    "barangay": update["barangay"],
                    "reasons": admin_reasons,
                },
            }
        )


@router.post("/draft")
def save_field_update_draft(
    payload: FieldUpdatePayload,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update = _upsert_update(db, payload, current_user, "Draft")
    return {"message": "Field update draft saved to Supabase.", "field_update": update}


@router.post("/submit")
def submit_field_update(
    payload: FieldUpdatePayload,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update = _upsert_update(db, payload, current_user, "Submitted")
    _send_submission_notifications(update)
    publish_workflow_event(
        topic="field_updates",
        event="submitted",
        barangay=update.get("barangay", ""),
        target_user_id=update.get("submitted_by", ""),
        origin_client_id=request.headers.get("x-workflow-client-id", ""),
        data={
            "field_update_id": update.get("field_update_id"),
            "status": update.get("status"),
            "reporting_date": update.get("reporting_date"),
        },
    )
    return {"message": "Field update submitted to the supervisor.", "field_update": update}


@router.get("/current")
def get_current_field_update(
    barangay: str = Query(min_length=1),
    reporting_date: date = Query(),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    params = {
        "barangay_key": _barangay_key(barangay),
        "reporting_date": reporting_date,
    }
    where = ["fu.barangay_key = :barangay_key", "fu.reporting_date = :reporting_date"]

    if current_user.get("role") == "bhw":
        where.append("fu.submitted_by = :submitted_by")
        params["submitted_by"] = str(current_user["id"])

    row = db.execute(
        text(_base_select() + f" where {' and '.join(where)} order by fu.updated_at desc limit 1"),
        params,
    ).mappings().first()

    return {"field_update": _serialize_row(row)}


@router.get("")
def list_field_updates(
    status: Optional[str] = None,
    barangay: Optional[str] = None,
    reporting_date: Optional[date] = None,
    limit: int = Query(default=100, ge=1, le=300),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if status and status not in FIELD_UPDATE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid field update status.")

    where = []
    params = {"limit": limit}
    role = current_user.get("role")

    if role == "bhw":
        where.append("fu.submitted_by = :submitted_by")
        params["submitted_by"] = str(current_user["id"])
    elif role not in {"supervisor", "cho", "admin"}:
        raise HTTPException(status_code=403, detail="Your account cannot view barangay field updates.")

    if status:
        where.append("fu.status = :status")
        params["status"] = status
    if barangay:
        where.append("fu.barangay_key = :barangay_key")
        params["barangay_key"] = _barangay_key(barangay)
    if reporting_date:
        where.append("fu.reporting_date = :reporting_date")
        params["reporting_date"] = reporting_date

    where_sql = f" where {' and '.join(where)}" if where else ""
    rows = db.execute(
        text(
            _base_select()
            + where_sql
            + " order by coalesce(fu.submitted_at, fu.saved_at) desc, fu.updated_at desc limit :limit"
        ),
        params,
    ).mappings().all()

    updates = [_serialize_row(row) for row in rows]
    return {
        "field_updates": updates,
        "count": len(updates),
        "summary": {
            "submitted": sum(1 for item in updates if item["status"] == "Submitted"),
            "reviewed": sum(1 for item in updates if item["status"] == "Reviewed"),
            "follow_up_required": sum(1 for item in updates if item["status"] == "Follow-up Required"),
            "urgent": sum(1 for item in updates if item["is_urgent"]),
        },
    }


@router.get("/{field_update_id}")
def get_field_update(
    field_update_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(_base_select() + " where fu.field_update_id = :field_update_id limit 1"),
        {"field_update_id": str(field_update_id)},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Field update was not found.")

    if current_user.get("role") == "bhw" and str(row["submitted_by"]) != str(current_user["id"]):
        raise HTTPException(status_code=403, detail="You cannot view another BHW account's field update.")
    if current_user.get("role") not in {"bhw", "supervisor", "cho", "admin"}:
        raise HTTPException(status_code=403, detail="Your account cannot view this field update.")

    return {"field_update": _serialize_row(row)}


@router.patch("/{field_update_id}/review")
def review_field_update(
    field_update_id: UUID,
    payload: FieldUpdateReviewPayload,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.get("role") not in {"supervisor", "cho", "admin"}:
        raise HTTPException(status_code=403, detail="Only supervisors, CHO, or administrators can review field updates.")

    row = db.execute(
        text(
            """
            update public.field_updates
            set status = :status,
                supervisor_comment = :supervisor_comment,
                reviewed_by = :reviewed_by,
                reviewed_at = now(),
                updated_at = now()
            where field_update_id = :field_update_id
              and status <> 'Draft'
            returning submitted_by
            """
        ),
        {
            "field_update_id": str(field_update_id),
            "status": payload.status,
            "supervisor_comment": payload.supervisor_comment.strip(),
            "reviewed_by": str(current_user["id"]),
        },
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="A submitted field update was not found.")

    db.commit()
    saved = db.execute(
        text(_base_select() + " where fu.field_update_id = :field_update_id limit 1"),
        {"field_update_id": str(field_update_id)},
    ).mappings().first()
    update = _serialize_row(saved)

    review_version = re.sub(r"[^0-9A-Za-z]+", "", update.get("reviewed_at") or update.get("updated_at") or "review")
    add_notification_event(
        {
            "id": f"field-update-review-{update['field_update_id']}-{payload.status.lower().replace(' ', '-')}-{review_version}",
            "title": "Barangay field update reviewed" if payload.status == "Reviewed" else "Field update follow-up requested",
            "message": (
                f"Your {update['reporting_date']} {update['barangay']} field update was marked as {payload.status}."
                + (f" Supervisor comment: {payload.supervisor_comment.strip()}" if payload.supervisor_comment.strip() else "")
            ),
            "severity": "success" if payload.status == "Reviewed" else "warning",
            "category": "barangay_field_update_review",
            "to": "/bhw",
            "hash": "field-checklist",
            "recipient_role": "bhw",
            "recipient_user_id": update["submitted_by"],
            "meta": {
                "field_update_id": update["field_update_id"],
                "status": payload.status,
            },
        }
    )

    publish_workflow_event(
        topic="field_updates",
        event="reviewed" if payload.status == "Reviewed" else "follow_up_required",
        barangay=update.get("barangay", ""),
        target_user_id=update.get("submitted_by", ""),
        origin_client_id=request.headers.get("x-workflow-client-id", ""),
        data={
            "field_update_id": update.get("field_update_id"),
            "status": update.get("status"),
            "reporting_date": update.get("reporting_date"),
        },
    )

    return {"message": f"Field update marked as {payload.status}.", "field_update": update}
