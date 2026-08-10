import json
from threading import Lock
from typing import Any

from sqlalchemy import text

from app.database import engine


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _json_object(value: Any) -> dict:
    """Normalize a JSON/JSONB value into a dictionary."""
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    return {}


def _build_validation_counts(
    dataset_type: str,
    summary: dict | str | None,
    invalid_row_count: int,
    detection: dict | str | None = None,
    original_filename: str = "",
) -> dict:
    """Return tiny, non-overlapping issue counts for the upload workspace.

    The latest upload metadata can span validation_summary and detection_result.
    Older persisted DOH rows sometimes have the source-format / unknown-location
    metadata only in detection_result, so use both sources when rebuilding the
    lightweight status payload. This keeps the 22 unresolved DOH location rows
    in the unresolved bucket instead of reclassifying them as generic invalid
    values after login or refresh.
    """
    summary = _json_object(summary)
    detection = _json_object(detection)

    invalid_total = max(0, _safe_int(invalid_row_count))

    if dataset_type == "dengue":
        explicit_unresolved = max(
            _safe_int(summary.get("invalid_barangay_rows")),
            _safe_int(summary.get("unknown_location_record_count")),
            _safe_int(detection.get("invalid_barangay_rows")),
            _safe_int(detection.get("unknown_location_record_count")),
        )

        source_format = str(
            summary.get("source_format")
            or detection.get("source_format")
            or ""
        ).strip().lower()
        detection_method = str(
            summary.get("detection_method")
            or detection.get("detection_method")
            or ""
        ).strip().lower()
        source_agency = str(
            summary.get("source_agency")
            or detection.get("source_agency")
            or ""
        ).strip().lower()
        filename_key = str(original_filename or "").strip().lower()

        known_other_invalid = (
            max(
                _safe_int(summary.get("invalid_time_rows")),
                _safe_int(detection.get("invalid_time_rows")),
            )
            + max(
                _safe_int(summary.get("invalid_cases_rows")),
                _safe_int(detection.get("invalid_cases_rows")),
            )
            + max(
                _safe_int(summary.get("invalid_deaths_rows")),
                _safe_int(detection.get("invalid_deaths_rows")),
            )
        )

        # Current uploads persist source_format and invalid_barangay_rows.
        # Some older Supabase rows were saved before those metadata fields were
        # persisted, even though the same official DOH FOI workbook had already
        # been validated locally as having unresolved barangay/location rows.
        # Recognize those legacy DOH rows from the remaining stable metadata
        # (or the official FOI filename) so refresh/login does not move the
        # unresolved rows into the generic "Invalid values" bucket.
        looks_like_doh_monthly = any((
            source_format == "doh_monthly_summary",
            detection_method == "doh_monthly_report_parser",
            source_agency == "department of health",
            "foi doh" in filename_key,
        ))

        if explicit_unresolved <= 0 and looks_like_doh_monthly:
            explicit_unresolved = max(0, invalid_total - known_other_invalid)

        unresolved = min(invalid_total, explicit_unresolved)
        duplicate = 0
        other_invalid = max(0, invalid_total - unresolved - duplicate)
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": other_invalid,
            "duplicates": duplicate,
            "source_discrepancies": max(
                _safe_int(summary.get("monthly_total_discrepancy_count")),
                _safe_int(detection.get("monthly_total_discrepancy_count")),
            ),
            "unknown_location_records": max(
                _safe_int(summary.get("unknown_location_record_count")),
                _safe_int(detection.get("unknown_location_record_count")),
            ),
            "unknown_location_cases": max(
                _safe_int(summary.get("unknown_location_case_count")),
                _safe_int(detection.get("unknown_location_case_count")),
            ),
        }

    if dataset_type == "weather":
        duplicates = min(invalid_total, _safe_int(summary.get("duplicate_weather_rows")))
        return {
            "unresolved_or_missing": 0,
            "other_invalid": max(0, invalid_total - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    if dataset_type == "population":
        unresolved = min(invalid_total, _safe_int(summary.get("invalid_barangay_rows")))
        duplicates = min(max(0, invalid_total - unresolved), _safe_int(summary.get("duplicate_barangay_rows")))
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": max(0, invalid_total - unresolved - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    if dataset_type == "boundary":
        unresolved = min(invalid_total, _safe_int(summary.get("missing_barangay_name_rows")))
        duplicates = min(max(0, invalid_total - unresolved), _safe_int(summary.get("duplicate_boundary_rows")))
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": max(0, invalid_total - unresolved - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    return {
        "unresolved_or_missing": 0,
        "other_invalid": invalid_total,
        "duplicates": 0,
        "source_discrepancies": 0,
        "unknown_location_cases": 0,
    }


_DATASET_UPLOADS_SCHEMA_READY = False
_DATASET_UPLOADS_SCHEMA_LOCK = Lock()


def ensure_dataset_uploads_schema() -> None:
    """Create or repair the upload metadata table used by every file type."""
    global _DATASET_UPLOADS_SCHEMA_READY

    if _DATASET_UPLOADS_SCHEMA_READY:
        return

    with _DATASET_UPLOADS_SCHEMA_LOCK:
        if _DATASET_UPLOADS_SCHEMA_READY:
            return

        with engine.begin() as connection:
            connection.execute(
                text("""
                    create table if not exists public.dataset_uploads (
                        upload_id uuid primary key default gen_random_uuid(),
                        dataset_type text not null,
                        original_filename text not null,
                        file_type text not null default '',
                        uploaded_by text not null default 'demo_user',
                        status text not null default 'validated',
                        original_row_count integer not null default 0,
                        valid_row_count integer not null default 0,
                        invalid_row_count integer not null default 0,
                        validation_summary jsonb not null default '{}'::jsonb,
                        detection_result jsonb not null default '{}'::jsonb,
                        error_message text,
                        uploaded_at timestamptz not null default now()
                    )
                """)
            )

            column_statements = [
                "alter table public.dataset_uploads add column if not exists file_type text not null default ''",
                "alter table public.dataset_uploads add column if not exists uploaded_by text not null default 'demo_user'",
                "alter table public.dataset_uploads add column if not exists status text not null default 'validated'",
                "alter table public.dataset_uploads add column if not exists original_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists valid_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists invalid_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists validation_summary jsonb not null default '{}'::jsonb",
                "alter table public.dataset_uploads add column if not exists detection_result jsonb not null default '{}'::jsonb",
                "alter table public.dataset_uploads add column if not exists error_message text",
                "alter table public.dataset_uploads add column if not exists uploaded_at timestamptz not null default now()",
            ]

            for statement in column_statements:
                connection.execute(text(statement))

            connection.execute(
                text("""
                    create index if not exists idx_dataset_uploads_type_uploaded_at
                    on public.dataset_uploads (dataset_type, uploaded_at desc)
                """)
            )

        _DATASET_UPLOADS_SCHEMA_READY = True


def save_dataset_upload(
    *,
    dataset_type: str,
    original_filename: str,
    file_type: str = "",
    uploaded_by: str = "demo_user",
    status: str = "validated",
    original_row_count: int = 0,
    valid_row_count: int = 0,
    invalid_row_count: int = 0,
    validation_summary: dict | None = None,
    detection_result: dict | None = None,
    error_message: str | None = None,
) -> str:
    ensure_dataset_uploads_schema()

    with engine.begin() as connection:
        result = connection.execute(
            text("""
                insert into public.dataset_uploads (
                    dataset_type,
                    original_filename,
                    file_type,
                    uploaded_by,
                    status,
                    original_row_count,
                    valid_row_count,
                    invalid_row_count,
                    validation_summary,
                    detection_result,
                    error_message
                )
                values (
                    :dataset_type,
                    :original_filename,
                    :file_type,
                    :uploaded_by,
                    :status,
                    :original_row_count,
                    :valid_row_count,
                    :invalid_row_count,
                    cast(:validation_summary as jsonb),
                    cast(:detection_result as jsonb),
                    :error_message
                )
                returning upload_id
            """),
            {
                "dataset_type": dataset_type,
                "original_filename": original_filename,
                "file_type": file_type,
                "uploaded_by": uploaded_by,
                "status": status,
                "original_row_count": int(original_row_count or 0),
                "valid_row_count": int(valid_row_count or 0),
                "invalid_row_count": int(invalid_row_count or 0),
                "validation_summary": _to_json(validation_summary),
                "detection_result": _to_json(detection_result),
                "error_message": error_message,
            },
        )

        upload_id = result.scalar_one()

    return str(upload_id)


def get_latest_dataset_uploads() -> dict:
    ensure_dataset_uploads_schema()

    with engine.connect() as connection:
        result = connection.execute(
            text("""
                select distinct on (dataset_type)
                    upload_id,
                    dataset_type,
                    original_filename,
                    file_type,
                    status,
                    original_row_count,
                    valid_row_count,
                    invalid_row_count,
                    validation_summary,
                    detection_result,
                    coalesce(
                        nullif(detection_result->>'coverage_start', ''),
                        nullif(validation_summary->>'coverage_start', '')
                    ) as coverage_start,
                    coalesce(
                        nullif(detection_result->>'coverage_end', ''),
                        nullif(validation_summary->>'coverage_end', '')
                    ) as coverage_end,
                    uploaded_at
                from public.dataset_uploads
                order by dataset_type, uploaded_at desc
            """)
        )

        rows = result.mappings().all()

        # Keep forecast readiness lightweight. The Upload page already calls this
        # endpoint when it opens, so include only a tiny persisted-forecast status
        # instead of making the browser download the full forecast just to decide
        # whether the workflow checklist is ready.
        forecast_result = connection.execute(
            text("""
                select
                    runs.forecast_run_id,
                    runs.integration_run_id,
                    runs.dengue_upload_id,
                    runs.completed_at,
                    integration.dengue_upload_id as integration_dengue_upload_id,
                    integration.weather_upload_id as integration_weather_upload_id,
                    integration.population_upload_id as integration_population_upload_id,
                    integration.boundary_upload_id as integration_boundary_upload_id,
                    (
                        select count(*)
                        from public.forecast_results results
                        where results.forecast_run_id = runs.forecast_run_id
                    ) as result_count
                from public.forecast_runs runs
                left join public.integration_runs integration
                    on integration.integration_run_id = runs.integration_run_id
                where runs.status = 'completed'
                order by
                    runs.completed_at desc nulls last,
                    runs.started_at desc nulls last,
                    runs.forecast_run_id desc
                limit 1
            """)
        )

        latest_forecast = forecast_result.mappings().first()

        integration_result = connection.execute(
            text("""
                select
                    integration_run_id, dengue_upload_id, weather_upload_id,
                    population_upload_id, boundary_upload_id, row_count, summary, created_at
                from public.integration_runs
                where status = 'completed'
                order by created_at desc, integration_run_id desc
                limit 1
            """)
        )
        latest_integration = integration_result.mappings().first()
        integration_counts = None
        if latest_integration:
            integration_counts = connection.execute(
                text("""
                    select
                        count(*) as integrated_row_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_barangay_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and population_match_status in ('matched', 'psgc_matched')
                        ) as dengue_population_matched_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and boundary_match_status in ('matched', 'psgc_matched')
                        ) as dengue_boundary_matched_count,
                        count(distinct barangay_key) filter (
                            where population_match_status in ('matched', 'psgc_matched')
                        ) as population_barangay_count,
                        count(distinct barangay_key) filter (
                            where boundary_match_status in ('matched', 'psgc_matched')
                        ) as boundary_barangay_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and population_match_status in ('matched', 'psgc_matched')
                              and boundary_match_status in ('matched', 'psgc_matched')
                        ) as shared_barangay_count,
                        count(*) filter (where weather_match_status <> 'unavailable') as weather_matched_rows,
                        min(report_date) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_coverage_start,
                        max(report_date) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_coverage_end
                    from public.integrated_dataset_rows
                    where integration_run_id = :integration_run_id
                """),
                {"integration_run_id": latest_integration["integration_run_id"]},
            ).mappings().first()

    uploads = {}

    for row in rows:
        dataset_type = row["dataset_type"]

        uploads[dataset_type] = {
            "upload_id": str(row["upload_id"]),
            "dataset_type": row["dataset_type"],
            "original_filename": row["original_filename"],
            "file_type": row["file_type"],
            "status": row["status"],
            "original_row_count": row["original_row_count"],
            "valid_row_count": row["valid_row_count"],
            "invalid_row_count": row["invalid_row_count"],
            "validation_counts": _build_validation_counts(
                dataset_type,
                row["validation_summary"],
                row["invalid_row_count"],
                row["detection_result"],
                row["original_filename"],
            ),
            # Only expose the two tiny coverage values needed by the header.
            # This reuses the existing database-status request and avoids
            # downloading dengue rows just to calculate the displayed range.
            "coverage_start": row["coverage_start"] or "",
            "coverage_end": row["coverage_end"] or "",
            "uploaded_at": str(row["uploaded_at"]),
        }

    required_types = ["dengue", "weather", "population", "boundary"]
    forecast_result_count = int(latest_forecast["result_count"] or 0) if latest_forecast else 0

    forecast_matches_current_uploads = False
    integration_matches_current_uploads = False

    if latest_integration and all(item in uploads for item in required_types):
        integration_matches_current_uploads = all(
            str(latest_integration[f"{dataset_type}_upload_id"] or "")
            == str(uploads[dataset_type].get("upload_id") or "")
            for dataset_type in required_types
        )

    if latest_forecast and all(item in uploads for item in required_types):
        forecast_matches_current_uploads = all(
            str(latest_forecast[f"integration_{dataset_type}_upload_id"] or "")
            == str(uploads[dataset_type].get("upload_id") or "")
            for dataset_type in required_types
        )

    integration_readiness = None
    if latest_integration and integration_counts and integration_matches_current_uploads:
        total_integrated = _safe_int(integration_counts["integrated_row_count"])
        dengue_barangays = _safe_int(integration_counts["dengue_barangay_count"])
        dengue_population = _safe_int(integration_counts["dengue_population_matched_count"])
        dengue_boundary = _safe_int(integration_counts["dengue_boundary_matched_count"])
        population_barangays = _safe_int(integration_counts["population_barangay_count"])
        boundary_barangays = _safe_int(integration_counts["boundary_barangay_count"])
        shared_barangays = _safe_int(integration_counts["shared_barangay_count"])
        weather_matched = _safe_int(integration_counts["weather_matched_rows"])
        weather_ready = total_integrated > 0 and weather_matched == total_integrated
        forecast_ready = forecast_result_count > 0 and forecast_matches_current_uploads

        checks = [
            {
                "id": "dengue-population-match",
                "label": "Dengue barangays matched with population",
                "ready": dengue_barangays > 0 and dengue_population == dengue_barangays,
                "value": f"{dengue_population}/{dengue_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "dengue-boundary-match",
                "label": "Dengue barangays matched with boundary layer",
                "ready": dengue_barangays > 0 and dengue_boundary == dengue_barangays,
                "value": f"{dengue_boundary}/{dengue_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "population-boundary-match",
                "label": "Population barangays matched with boundary layer",
                "ready": population_barangays > 0 and shared_barangays == population_barangays,
                "value": f"{shared_barangays}/{population_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "weather-coverage",
                "label": "Weather context available for integrated rows",
                "ready": weather_ready,
                "value": f"{weather_matched}/{total_integrated}",
                "detail": "Weather-match status is summarized in the database; no full dataset download is required.",
                "missingPreview": [],
            },
            {
                "id": "forecast-rows-ready",
                "label": "Forecast and DSS rows generated",
                "ready": forecast_ready,
                "value": f"{forecast_result_count} barangay rows",
                "detail": "Saved forecast results match the current four uploaded sources." if forecast_ready else "A matching saved forecast has not been generated yet.",
                "missingPreview": [],
            },
        ]
        ready_count = sum(1 for check in checks if check["ready"])
        integration_readiness = {
            "status": "Ready" if ready_count == len(checks) else "Needs Review",
            "score": round((ready_count / len(checks)) * 100) if checks else 0,
            "readyCount": ready_count,
            "checkCount": len(checks),
            "allSourcesLoaded": True,
            "checks": checks,
            "summary": {
                "dengueBarangayCount": dengue_barangays,
                "populationBarangayCount": population_barangays,
                "boundaryBarangayCount": boundary_barangays,
                "sharedBarangayCount": shared_barangays,
                "forecastAreaCount": forecast_result_count,
                "integratedRowCount": total_integrated,
                "weatherMatchedRowCount": weather_matched,
                "dengueDateCoverage": f"{integration_counts['dengue_coverage_start'] or ''} to {integration_counts['dengue_coverage_end'] or ''}",
                "weatherDateCoverage": uploads.get("weather", {}).get("coverage_start", "") + " to " + uploads.get("weather", {}).get("coverage_end", ""),
                "riskRowCount": forecast_result_count,
            },
        }

    return {
        "required_types": required_types,
        "uploads": uploads,
        "completed_types": [item for item in required_types if item in uploads],
        "missing_types": [item for item in required_types if item not in uploads],
        "all_required_uploaded": all(item in uploads for item in required_types),
        "integration_status": {
            "ready": bool(integration_matches_current_uploads),
            "matches_current_uploads": integration_matches_current_uploads,
            "integration_run_id": str(latest_integration["integration_run_id"]) if latest_integration else None,
            "row_count": _safe_int(latest_integration["row_count"]) if latest_integration else 0,
        },
        "integration_readiness": integration_readiness,
        "forecast_status": {
            "ready": forecast_result_count > 0 and forecast_matches_current_uploads,
            "result_count": forecast_result_count,
            "matches_current_uploads": forecast_matches_current_uploads,
            "forecast_run_id": str(latest_forecast["forecast_run_id"]) if latest_forecast else None,
            "completed_at": (
                str(latest_forecast["completed_at"])
                if latest_forecast and latest_forecast["completed_at"]
                else None
            ),
        },
    }


def get_latest_dataset_previews(limit: int = 300) -> dict:
    safe_limit = max(1, min(int(limit or 300), 1000))

    with engine.connect() as connection:
        latest_run_result = connection.execute(
            text("""
                select integration_run_id, row_count, created_at
                from public.integration_runs
                where status = 'completed'
                order by created_at desc, integration_run_id desc
                limit 1
            """)
        )

        latest_run = latest_run_result.mappings().first()

        if not latest_run:
            return {
                "message": "No saved integrated dataset preview found.",
                "has_saved_preview": False,
                "limit": safe_limit,
                "previews": {
                    "dengue": [],
                    "weather": [],
                    "population": [],
                },
            }

        dengue_rows = connection.execute(
            text("""
                select
                    barangay,
                    period,
                    report_date,
                    year,
                    month,
                    week,
                    cases,
                    deaths
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                order by period, barangay
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

        weather_rows = connection.execute(
            text("""
                select distinct on (period)
                    period,
                    report_date,
                    rainfall,
                    temperature,
                    humidity,
                    weather_match_status
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                order by period, barangay
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

        population_rows = connection.execute(
            text("""
                select distinct on (barangay_key)
                    barangay,
                    barangay_key,
                    population,
                    population_year,
                    density,
                    geometry_id,
                    population_match_status
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                  and barangay_key is not null
                order by barangay_key, period
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

    def as_date(value):
        return str(value) if value else ""

    return {
        "message": "Saved dataset preview rows loaded from Supabase.",
        "has_saved_preview": True,
        "limit": safe_limit,
        "integration_run": {
            "integration_run_id": str(latest_run["integration_run_id"]),
            "row_count": latest_run["row_count"],
            "created_at": str(latest_run["created_at"]),
        },
        "previews": {
            "dengue": [
                {
                    "barangay": row["barangay"],
                    "period": row["period"],
                    "date": as_date(row["report_date"]),
                    "year": row["year"],
                    "month": row["month"],
                    "week": row["week"],
                    "cases": row["cases"],
                    "deaths": row["deaths"],
                }
                for row in dengue_rows
            ],
            "weather": [
                {
                    "period": row["period"],
                    "reporting_date": as_date(row["report_date"]) or row["period"],
                    "rainfall": row["rainfall"],
                    "temperature": row["temperature"],
                    "humidity": row["humidity"],
                    "status": row["weather_match_status"],
                }
                for row in weather_rows
            ],
            "population": [
                {
                    "barangay": row["barangay"],
                    "barangay_key": row["barangay_key"],
                    "population": row["population"],
                    "population_year": row["population_year"],
                    "density": row["density"],
                    "geometry_id": row["geometry_id"],
                    "status": row["population_match_status"],
                }
                for row in population_rows
            ],
        },
    }
