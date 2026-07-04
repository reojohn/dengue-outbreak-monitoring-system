import json
from datetime import date, datetime
from typing import Any

from sqlalchemy import text

from app.database import engine


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _to_int(value: Any, fallback=None):
    if value is None or value == "":
        return fallback

    try:
        return int(float(str(value).replace(",", "").strip()))
    except Exception:
        return fallback


def _to_float(value: Any, fallback=None):
    if value is None or value == "":
        return fallback

    try:
        return float(str(value).replace(",", "").strip())
    except Exception:
        return fallback


def _to_date(value: Any):
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    raw = str(value).strip()

    if raw.lower() in ["", "n/a", "na", "none", "null", "nan", "nat"]:
        return None

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except Exception:
        return None


def get_latest_dataset_upload_ids() -> dict:
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                select distinct on (dataset_type)
                    dataset_type,
                    upload_id
                from public.dataset_uploads
                where dataset_type in ('dengue', 'weather', 'population', 'boundary')
                order by dataset_type, uploaded_at desc
            """)
        )

        rows = result.mappings().all()

    return {
        row["dataset_type"]: row["upload_id"]
        for row in rows
    }


def save_integration_result(
    *,
    integration_status: dict,
    summary: dict,
    merged_rows: list[dict],
    created_by: str = "demo_user",
) -> dict:
    latest_uploads = get_latest_dataset_upload_ids()
    row_count = len(merged_rows or [])

    summary_payload = {
        "match_summary": summary or {},
        "integration_status": integration_status or {},
    }

    with engine.begin() as connection:
        integration_result = connection.execute(
            text("""
                insert into public.integration_runs (
                    dengue_upload_id,
                    weather_upload_id,
                    population_upload_id,
                    boundary_upload_id,
                    status,
                    row_count,
                    summary,
                    created_by
                )
                values (
                    :dengue_upload_id,
                    :weather_upload_id,
                    :population_upload_id,
                    :boundary_upload_id,
                    :status,
                    :row_count,
                    cast(:summary as jsonb),
                    :created_by
                )
                returning integration_run_id
            """),
            {
                "dengue_upload_id": latest_uploads.get("dengue"),
                "weather_upload_id": latest_uploads.get("weather"),
                "population_upload_id": latest_uploads.get("population"),
                "boundary_upload_id": latest_uploads.get("boundary"),
                "status": "completed",
                "row_count": row_count,
                "summary": _to_json(summary_payload),
                "created_by": created_by,
            },
        )

        integration_run_id = integration_result.scalar_one()

        if merged_rows:
            row_payloads = []

            for row in merged_rows:
                row_payloads.append(
                    {
                        "integration_run_id": integration_run_id,
                        "barangay": row.get("barangay"),
                        "barangay_key": row.get("barangay_key"),
                        "barangay_original": row.get("barangay_original"),
                        "barangay_original_key": row.get("barangay_original_key"),
                        "barangay_match_status": row.get("barangay_match_status"),
                        "barangay_match_confidence": _to_float(row.get("barangay_match_confidence")),
                        "barangay_match_note": row.get("barangay_match_note"),
                        "period": row.get("period"),
                        "report_date": _to_date(row.get("date")),
                        "year": _to_int(row.get("year")),
                        "month": _to_int(row.get("month")),
                        "week": _to_int(row.get("week")),
                        "cases": _to_int(row.get("cases"), 0),
                        "deaths": _to_int(row.get("deaths"), 0),
                        "rainfall": _to_float(row.get("rainfall")),
                        "temperature": _to_float(row.get("temperature")),
                        "humidity": _to_float(row.get("humidity")),
                        "population": _to_int(row.get("population")),
                        "population_year": _to_int(row.get("population_year")),
                        "density": _to_float(row.get("density")),
                        "boundary_area_sqkm": _to_float(row.get("boundary_area_sqkm")),
                        "geometry_id": row.get("geometry_id"),
                        "boundary_match_status": row.get("boundary_match_status"),
                        "population_match_status": row.get("population_match_status"),
                        "weather_match_status": row.get("weather_match_status"),
                    }
                )

            connection.execute(
                text("""
                    insert into public.integrated_dataset_rows (
                        integration_run_id,
                        barangay,
                        barangay_key,
                        barangay_original,
                        barangay_original_key,
                        barangay_match_status,
                        barangay_match_confidence,
                        barangay_match_note,
                        period,
                        report_date,
                        year,
                        month,
                        week,
                        cases,
                        deaths,
                        rainfall,
                        temperature,
                        humidity,
                        population,
                        population_year,
                        density,
                        boundary_area_sqkm,
                        geometry_id,
                        boundary_match_status,
                        population_match_status,
                        weather_match_status
                    )
                    values (
                        :integration_run_id,
                        :barangay,
                        :barangay_key,
                        :barangay_original,
                        :barangay_original_key,
                        :barangay_match_status,
                        :barangay_match_confidence,
                        :barangay_match_note,
                        :period,
                        :report_date,
                        :year,
                        :month,
                        :week,
                        :cases,
                        :deaths,
                        :rainfall,
                        :temperature,
                        :humidity,
                        :population,
                        :population_year,
                        :density,
                        :boundary_area_sqkm,
                        :geometry_id,
                        :boundary_match_status,
                        :population_match_status,
                        :weather_match_status
                    )
                """),
                row_payloads,
            )

    return {
        "integration_run_id": str(integration_run_id),
        "saved_row_count": row_count,
        "latest_upload_ids": {
            key: str(value)
            for key, value in latest_uploads.items()
            if value
        },
    }

def get_latest_integration_dataset() -> dict:
    with engine.connect() as connection:
        latest_run_result = connection.execute(
            text("""
                select
                    integration_run_id,
                    status,
                    row_count,
                    summary,
                    created_by,
                    created_at
                from public.integration_runs
                order by created_at desc
                limit 1
            """)
        )

        latest_run = latest_run_result.mappings().first()

        if not latest_run:
            return {
                "message": "No saved integrated dataset found.",
                "has_saved_dataset": False,
                "integration_run": None,
                "row_count": 0,
                "summary": {},
                "merged_dataset": [],
                "merged_preview": [],
            }

        rows_result = connection.execute(
            text("""
                select
                    barangay,
                    barangay_key,
                    barangay_original,
                    barangay_original_key,
                    barangay_match_status,
                    barangay_match_confidence,
                    barangay_match_note,
                    period,
                    report_date,
                    year,
                    month,
                    week,
                    cases,
                    deaths,
                    rainfall,
                    temperature,
                    humidity,
                    population,
                    population_year,
                    density,
                    boundary_area_sqkm,
                    geometry_id,
                    boundary_match_status,
                    population_match_status,
                    weather_match_status
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
               order by period, barangay
limit 300
"""),
            {
                "integration_run_id": latest_run["integration_run_id"],
            },
        )

        rows = rows_result.mappings().all()

    merged_dataset = []

    for row in rows:
        report_date = row["report_date"]

        merged_dataset.append(
            {
                "barangay": row["barangay"],
                "barangay_key": row["barangay_key"],
                "barangay_original": row["barangay_original"],
                "barangay_original_key": row["barangay_original_key"],
                "barangay_match_status": row["barangay_match_status"],
                "barangay_match_confidence": row["barangay_match_confidence"],
                "barangay_match_note": row["barangay_match_note"],
                "period": row["period"],
                "date": str(report_date) if report_date else "",
                "year": row["year"],
                "month": row["month"],
                "week": row["week"],
                "cases": row["cases"],
                "deaths": row["deaths"],
                "rainfall": row["rainfall"],
                "temperature": row["temperature"],
                "humidity": row["humidity"],
                "population": row["population"],
                "population_year": row["population_year"],
                "density": row["density"],
                "boundary_area_sqkm": row["boundary_area_sqkm"],
                "geometry_id": row["geometry_id"],
                "boundary_match_status": row["boundary_match_status"],
                "population_match_status": row["population_match_status"],
                "weather_match_status": row["weather_match_status"],
            }
        )

    summary = latest_run["summary"] or {}

    return {
        "message": "Latest saved integrated dataset loaded from Supabase.",
        "has_saved_dataset": True,
        "integration_run": {
            "integration_run_id": str(latest_run["integration_run_id"]),
            "status": latest_run["status"],
            "row_count": latest_run["row_count"],
            "created_by": latest_run["created_by"],
            "created_at": str(latest_run["created_at"]),
        },
        "row_count": latest_run["row_count"] or len(merged_dataset),
        "summary": summary.get("match_summary", summary) if isinstance(summary, dict) else {},
        # Only return a small preview to the browser. The complete combined dataset
        # remains saved in public.integrated_dataset_rows.
        "merged_dataset": merged_dataset,
        "merged_preview": merged_dataset[:25],
    }