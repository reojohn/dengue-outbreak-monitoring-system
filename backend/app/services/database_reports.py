import json
import uuid
from typing import Any

from sqlalchemy import text

from app.database import engine


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _clean_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback

    text_value = str(value).strip()
    return text_value or fallback


def _valid_uuid_or_none(value: Any) -> str | None:
    if value in (None, "", "null", "None"):
        return None

    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return None


def ensure_reports_table() -> None:
    """Create or upgrade the report metadata table used by the prototype."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                create table if not exists public.reports (
                    report_id uuid primary key,
                    title text not null default 'Generated Dengue Report',
                    description text,
                    report_code text,
                    report_type text not null default 'Report',
                    report_title text,
                    generated_by text,
                    generated_role text,
                    generated_at timestamptz not null default now(),
                    forecast_run_id uuid null,
                    file_path text,
                    export_status text not null default 'generated',
                    metadata jsonb not null default '{}'::jsonb,
                    summary jsonb not null default '{}'::jsonb,
                    created_at timestamptz not null default now()
                )
                """
            )
        )

        connection.execute(text("alter table public.reports add column if not exists title text"))
        connection.execute(text("alter table public.reports add column if not exists description text"))
        connection.execute(text("alter table public.reports add column if not exists report_code text"))
        connection.execute(text("alter table public.reports add column if not exists report_type text"))
        connection.execute(text("alter table public.reports add column if not exists report_title text"))
        connection.execute(text("alter table public.reports add column if not exists generated_by text"))
        connection.execute(text("alter table public.reports add column if not exists generated_role text"))
        connection.execute(text("alter table public.reports add column if not exists generated_at timestamptz not null default now()"))
        connection.execute(text("alter table public.reports add column if not exists forecast_run_id uuid null"))
        connection.execute(text("alter table public.reports add column if not exists file_path text"))
        connection.execute(text("alter table public.reports add column if not exists export_status text not null default 'generated'"))
        connection.execute(text("alter table public.reports add column if not exists metadata jsonb not null default '{}'::jsonb"))
        connection.execute(text("alter table public.reports add column if not exists summary jsonb not null default '{}'::jsonb"))
        connection.execute(text("alter table public.reports add column if not exists created_at timestamptz not null default now()"))

        connection.execute(text("alter table public.reports alter column title set default 'Generated Dengue Report'"))
        connection.execute(text("alter table public.reports alter column report_type set default 'Report'"))
        connection.execute(text("alter table public.reports alter column export_status set default 'generated'"))
        connection.execute(text("alter table public.reports alter column metadata set default '{}'::jsonb"))
        connection.execute(text("alter table public.reports alter column summary set default '{}'::jsonb"))
        connection.execute(text("alter table public.reports alter column created_at set default now()"))
        connection.execute(text("alter table public.reports alter column generated_at set default now()"))

        connection.execute(
            text(
                """
                update public.reports
                set title = coalesce(report_title, report_code, title, 'Generated Dengue Report')
                where title is null
                """
            )
        )

        connection.execute(
            text(
                """
                update public.reports
                set report_type = coalesce(report_type, 'Report')
                where report_type is null
                """
            )
        )

        connection.execute(
            text(
                """
                update public.reports
                set export_status = coalesce(export_status, 'generated')
                where export_status is null
                """
            )
        )

        connection.execute(text("alter table public.reports alter column title set not null"))

        connection.execute(text("create index if not exists idx_reports_generated_at on public.reports (generated_at desc)"))
        connection.execute(text("create index if not exists idx_reports_report_type on public.reports (report_type)"))
        connection.execute(text("create index if not exists idx_reports_forecast_run_id on public.reports (forecast_run_id)"))


def save_generated_report(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_reports_table()

    report_id = str(uuid.uuid4())
    report_code = _clean_text(payload.get("report_code"), f"DR-{report_id[:8].upper()}")
    report_type = _clean_text(payload.get("report_type"), "Report")
    report_title = _clean_text(payload.get("report_title"), "Weekly Dengue Response Planning Report")
    title = report_title
    description = _clean_text(
        payload.get("description"),
        "Generated report record from the Dengue Response Planning System.",
    )
    generated_by = _clean_text(payload.get("generated_by"), "CHO user")
    generated_role = _clean_text(
        payload.get("generated_role"),
        "City Health Office / Barangay Dengue Response Team",
    )
    generated_at = payload.get("generated_at") or None
    forecast_run_id = _valid_uuid_or_none(payload.get("forecast_run_id"))
    file_path = _clean_text(payload.get("file_path"), "export_record")
    export_status = _clean_text(payload.get("export_status"), "generated")
    metadata = payload.get("metadata") or {}
    summary = payload.get("summary") or {}

    with engine.begin() as connection:
        result = connection.execute(
            text(
                """
                insert into public.reports (
                    report_id,
                    title,
                    description,
                    report_code,
                    report_type,
                    report_title,
                    generated_by,
                    generated_role,
                    generated_at,
                    forecast_run_id,
                    file_path,
                    export_status,
                    metadata,
                    summary
                )
                values (
                    cast(:report_id as uuid),
                    :title,
                    :description,
                    :report_code,
                    :report_type,
                    :report_title,
                    :generated_by,
                    :generated_role,
                    coalesce(cast(:generated_at as timestamptz), now()),
                    cast(:forecast_run_id as uuid),
                    :file_path,
                    :export_status,
                    cast(:metadata as jsonb),
                    cast(:summary as jsonb)
                )
                returning
                    report_id,
                    title,
                    description,
                    report_code,
                    report_type,
                    report_title,
                    generated_by,
                    generated_role,
                    generated_at,
                    forecast_run_id,
                    file_path,
                    export_status,
                    metadata,
                    summary,
                    created_at
                """
            ),
            {
                "report_id": report_id,
                "title": title,
                "description": description,
                "report_code": report_code,
                "report_type": report_type,
                "report_title": report_title,
                "generated_by": generated_by,
                "generated_role": generated_role,
                "generated_at": generated_at,
                "forecast_run_id": forecast_run_id,
                "file_path": file_path,
                "export_status": export_status,
                "metadata": _to_json(metadata),
                "summary": _to_json(summary),
            },
        )

        row = result.mappings().one()

    return _format_report_row(row)


def get_generated_reports(limit: int = 20) -> dict[str, Any]:
    ensure_reports_table()

    safe_limit = max(1, min(int(limit or 20), 100))

    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                select
                    report_id,
                    title,
                    description,
                    report_code,
                    report_type,
                    report_title,
                    generated_by,
                    generated_role,
                    generated_at,
                    forecast_run_id,
                    file_path,
                    export_status,
                    metadata,
                    summary,
                    created_at
                from public.reports
                order by generated_at desc, created_at desc
                limit :limit
                """
            ),
            {"limit": safe_limit},
        )

        rows = result.mappings().all()

    reports = [_format_report_row(row) for row in rows]

    return {
        "message": "Generated report records loaded successfully.",
        "count": len(reports),
        "reports": reports,
    }


def _format_report_row(row: Any) -> dict[str, Any]:
    return {
        "report_id": str(row["report_id"]),
        "title": row.get("title"),
        "description": row.get("description"),
        "report_code": row.get("report_code"),
        "report_type": row.get("report_type"),
        "report_title": row.get("report_title"),
        "generated_by": row.get("generated_by"),
        "generated_role": row.get("generated_role"),
        "generated_at": str(row.get("generated_at")) if row.get("generated_at") else None,
        "forecast_run_id": str(row.get("forecast_run_id")) if row.get("forecast_run_id") else None,
        "file_path": row.get("file_path"),
        "export_status": row.get("export_status"),
        "metadata": row.get("metadata") or {},
        "summary": row.get("summary") or {},
        "created_at": str(row.get("created_at")) if row.get("created_at") else None,
    }