import json
from typing import Any

from sqlalchemy import text

from app.database import engine
from app.services.barangay_normalizer import normalize_barangay_key


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _to_int(value: Any, fallback=0):
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


def get_latest_dengue_upload_id():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                select upload_id
                from public.dataset_uploads
                where dataset_type = 'dengue'
                order by uploaded_at desc
                limit 1
            """)
        )

        return result.scalar_one_or_none()


def get_latest_integration_run_id():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                select integration_run_id
                from public.integration_runs
                order by created_at desc
                limit 1
            """)
        )

        return result.scalar_one_or_none()


def save_forecast_result(
    *,
    forecast_result: dict,
    dengue_upload_id=None,
    integration_run_id=None,
    created_by: str = "demo_user",
) -> dict:
    forecast_rows = forecast_result.get("forecast_results") or []

    if dengue_upload_id is None:
        dengue_upload_id = get_latest_dengue_upload_id()

    if integration_run_id is None:
        integration_run_id = get_latest_integration_run_id()

    with engine.begin() as connection:
        run_result = connection.execute(
            text("""
                insert into public.forecast_runs (
                    integration_run_id,
                    dengue_upload_id,
                    model_name,
                    model_version,
                    is_machine_learning,
                    status,
                    total_forecast_next_4_periods,
                    risk_counts,
                    validation_summary,
                    completed_at,
                    created_by
                )
                values (
                    :integration_run_id,
                    :dengue_upload_id,
                    :model_name,
                    :model_version,
                    :is_machine_learning,
                    :status,
                    :total_forecast_next_4_periods,
                    cast(:risk_counts as jsonb),
                    cast(:validation_summary as jsonb),
                    now(),
                    :created_by
                )
                returning forecast_run_id
            """),
            {
                "integration_run_id": integration_run_id,
                "dengue_upload_id": dengue_upload_id,
                "model_name": "baseline_rule_forecast",
                "model_version": "v1",
                "is_machine_learning": False,
                "status": "completed",
                "total_forecast_next_4_periods": _to_float(
                    forecast_result.get("total_forecast_next_4_periods"),
                    0,
                ),
                "risk_counts": _to_json(forecast_result.get("risk_counts", {})),
                "validation_summary": _to_json(
                    forecast_result.get("validation_summary", {})
                ),
                "created_by": created_by,
            },
        )

        forecast_run_id = run_result.scalar_one()

        if forecast_rows:
            payloads = []

            for row in forecast_rows:
                barangay = row.get("barangay") or ""

                payloads.append(
                    {
                        "forecast_run_id": forecast_run_id,
                        "barangay": barangay,
                        "barangay_key": normalize_barangay_key(barangay),
                        "latest_period": row.get("latest_period"),
                        "record_count": _to_int(row.get("record_count"), 0),
                        "historical_total_cases": _to_int(
                            row.get("historical_total_cases"),
                            0,
                        ),
                        "recent_average_cases": _to_float(
                            row.get("recent_average_cases"),
                            0,
                        ),
                        "previous_average_cases": _to_float(
                            row.get("previous_average_cases"),
                            0,
                        ),
                        "trend_direction": row.get("trend_direction"),
                        "forecast_next_period": _to_float(
                            row.get("forecast_next_period"),
                            0,
                        ),
                        "forecast_next_4_periods": _to_float(
                            row.get("forecast_next_4_periods"),
                            0,
                        ),
                        "risk_level": row.get("risk_level"),
                        "risk_score": _to_float(
                            row.get("forecast_next_4_periods"),
                            0,
                        ),
                        "recommendation": row.get("recommendation"),
                        "priority_rank": _to_int(row.get("priority_rank"), 0),
                    }
                )

            connection.execute(
                text("""
                    insert into public.forecast_results (
                        forecast_run_id,
                        barangay,
                        barangay_key,
                        latest_period,
                        record_count,
                        historical_total_cases,
                        recent_average_cases,
                        previous_average_cases,
                        trend_direction,
                        forecast_next_period,
                        forecast_next_4_periods,
                        risk_level,
                        risk_score,
                        recommendation,
                        priority_rank
                    )
                    values (
                        :forecast_run_id,
                        :barangay,
                        :barangay_key,
                        :latest_period,
                        :record_count,
                        :historical_total_cases,
                        :recent_average_cases,
                        :previous_average_cases,
                        :trend_direction,
                        :forecast_next_period,
                        :forecast_next_4_periods,
                        :risk_level,
                        :risk_score,
                        :recommendation,
                        :priority_rank
                    )
                """),
                payloads,
            )

    return {
        "forecast_run_id": str(forecast_run_id),
        "saved_result_count": len(forecast_rows),
        "dengue_upload_id": str(dengue_upload_id) if dengue_upload_id else None,
        "integration_run_id": str(integration_run_id) if integration_run_id else None,
    }


def get_latest_forecast_result_from_database() -> dict:
    with engine.connect() as connection:
        run_result = connection.execute(
            text("""
                select
                    forecast_run_id,
                    integration_run_id,
                    dengue_upload_id,
                    model_name,
                    model_version,
                    is_machine_learning,
                    status,
                    total_forecast_next_4_periods,
                    risk_counts,
                    validation_summary,
                    started_at,
                    completed_at,
                    created_by
                from public.forecast_runs
                order by started_at desc
                limit 1
            """)
        )

        forecast_run = run_result.mappings().first()

        if not forecast_run:
            return {
                "message": "No saved forecast result found.",
                "has_saved_forecast": False,
                "forecast_run": None,
                "forecast_results": [],
                "risk_counts": {},
                "total_forecast_next_4_periods": 0,
            }

        rows_result = connection.execute(
            text("""
                select
                    barangay,
                    barangay_key,
                    latest_period,
                    record_count,
                    historical_total_cases,
                    recent_average_cases,
                    previous_average_cases,
                    trend_direction,
                    forecast_next_period,
                    forecast_next_4_periods,
                    risk_level,
                    risk_score,
                    recommendation,
                    priority_rank,
                    created_at
                from public.forecast_results
                where forecast_run_id = :forecast_run_id
                order by priority_rank asc
            """),
            {
                "forecast_run_id": forecast_run["forecast_run_id"],
            },
        )

        rows = rows_result.mappings().all()

    forecast_results = []

    for row in rows:
        forecast_results.append(
            {
                "barangay": row["barangay"],
                "barangay_key": row["barangay_key"],
                "latest_period": row["latest_period"],
                "record_count": row["record_count"],
                "historical_total_cases": row["historical_total_cases"],
                "recent_average_cases": float(row["recent_average_cases"] or 0),
                "previous_average_cases": float(row["previous_average_cases"] or 0),
                "trend_direction": row["trend_direction"],
                "forecast_next_period": int(row["forecast_next_period"] or 0),
                "forecast_next_4_periods": int(row["forecast_next_4_periods"] or 0),
                "risk_level": row["risk_level"],
                "risk_score": float(row["risk_score"] or 0),
                "recommendation": row["recommendation"],
                "priority_rank": row["priority_rank"],
                "created_at": str(row["created_at"]) if row["created_at"] else None,
            }
        )

    return {
        "message": "Latest saved forecast loaded from Supabase.",
        "has_saved_forecast": True,
        "forecast_run": {
            "forecast_run_id": str(forecast_run["forecast_run_id"]),
            "integration_run_id": str(forecast_run["integration_run_id"]) if forecast_run["integration_run_id"] else None,
            "dengue_upload_id": str(forecast_run["dengue_upload_id"]) if forecast_run["dengue_upload_id"] else None,
            "model_name": forecast_run["model_name"],
            "model_version": forecast_run["model_version"],
            "is_machine_learning": forecast_run["is_machine_learning"],
            "status": forecast_run["status"],
            "started_at": str(forecast_run["started_at"]) if forecast_run["started_at"] else None,
            "completed_at": str(forecast_run["completed_at"]) if forecast_run["completed_at"] else None,
            "created_by": forecast_run["created_by"],
        },
        "total_forecast_next_4_periods": int(forecast_run["total_forecast_next_4_periods"] or 0),
        "risk_counts": forecast_run["risk_counts"] or {},
        "validation_summary": forecast_run["validation_summary"] or {},
        "forecast_results": forecast_results,
        "barangay_count": len(forecast_results),
    }