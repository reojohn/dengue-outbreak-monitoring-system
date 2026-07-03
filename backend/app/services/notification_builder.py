from datetime import datetime, timezone
import json

from sqlalchemy import text

from app.database import engine
from app.services.baseline_forecast import classify_forecast_risk
from app.services.notification_state import (
    get_notification_events,
    save_generated_notifications,
)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _json_value(value, fallback=None):
    if fallback is None:
        fallback = {}

    if value is None:
        return fallback

    if isinstance(value, (dict, list)):
        return value

    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return fallback

    return fallback


def _safe_number(value, fallback=0):
    try:
        if value is None or value == "":
            return fallback

        if isinstance(value, str):
            value = value.replace(",", "").strip()

            if value == "":
                return fallback

        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_int(value, fallback=0):
    return int(round(_safe_number(value, fallback)))


def _safe_text(value):
    if value is None:
        return ""
    return str(value).strip()


def _slug(value):
    text = _safe_text(value).lower()
    return "".join(char if char.isalnum() else "-" for char in text).strip("-")


def _notification(
    *,
    notification_id,
    title,
    message,
    severity="info",
    category="system",
    to="/dashboard",
    hash="dashboard-summary",
    timestamp=None,
    meta=None,
):
    return {
        "id": notification_id,
        "title": title,
        "message": message,
        "severity": severity,
        "type": severity,
        "category": category,
        "source": "backend",
        "timestamp": timestamp or _now_iso(),
        "to": to,
        "hash": hash,
        "read": False,
        "meta": meta or {},
    }


def _format_names(rows, key="barangay", limit=3):
    names = [_safe_text(row.get(key)) for row in rows if _safe_text(row.get(key))]
    visible = names[:limit]

    if not visible:
        return "Affected barangays"

    suffix = ", and others" if len(names) > limit else ""
    return ", ".join(visible) + suffix


def _get_latest_forecast_from_database():
    try:
        with engine.connect() as connection:
            run = connection.execute(
                text(
                    """
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
                    """
                )
            ).mappings().first()

            if not run:
                return None

            rows = connection.execute(
                text(
                    """
                    select
                        forecast_result_id,
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
                        priority_rank,
                        created_at
                    from public.forecast_results
                    where forecast_run_id = :forecast_run_id
                    order by priority_rank asc nulls last, forecast_next_4_periods desc
                    """
                ),
                {"forecast_run_id": run["forecast_run_id"]},
            ).mappings().all()
    except Exception:
        return None

    forecast_rows = []

    for row in rows:
        forecast_rows.append(
            {
                "forecast_result_id": str(row["forecast_result_id"]),
                "forecast_run_id": str(row["forecast_run_id"]),
                "barangay": row["barangay"],
                "barangay_key": row["barangay_key"],
                "latest_period": row["latest_period"],
                "record_count": row["record_count"],
                "historical_total_cases": _safe_int(row["historical_total_cases"], 0),
                "recent_average_cases": _safe_number(row["recent_average_cases"], 0),
                "previous_average_cases": _safe_number(row["previous_average_cases"], 0),
                "trend_direction": row["trend_direction"],
                "forecast_next_period": _safe_number(row["forecast_next_period"], 0),
                "forecast_next_4_periods": _safe_number(row["forecast_next_4_periods"], 0),
                "risk_level": row["risk_level"],
                "risk_score": _safe_number(row["risk_score"], 0),
                "recommendation": row["recommendation"],
                "priority_rank": row["priority_rank"],
                "created_at": str(row["created_at"]) if row["created_at"] else None,
            }
        )

    return {
        "filename": "latest_saved_forecast_from_database",
        "forecast_run_id": str(run["forecast_run_id"]),
        "integration_run_id": str(run["integration_run_id"]) if run["integration_run_id"] else None,
        "status": run["status"],
        "model_name": run["model_name"],
        "model_version": run["model_version"],
        "total_forecast_next_4_periods": _safe_number(run["total_forecast_next_4_periods"], 0),
        "risk_counts": _json_value(run["risk_counts"], {}),
        "validation_summary": _json_value(run["validation_summary"], {}),
        "started_at": str(run["started_at"]) if run["started_at"] else None,
        "updated_at": str(run["completed_at"] or run["started_at"]) if (run["completed_at"] or run["started_at"]) else _now_iso(),
        "forecast_results": forecast_rows,
    }


def _get_source_status_from_database():
    required_sources = ["dengue", "weather", "population", "boundary"]

    status = {
        "loaded_source_count": 0,
        "required_source_count": len(required_sources),
        "loaded_sources": [],
        "missing_sources": required_sources[:],
        "sources": {},
        "complete": False,
    }

    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    """
                    select distinct on (dataset_type)
                        upload_id,
                        dataset_type,
                        original_filename,
                        file_type,
                        uploaded_at,
                        status,
                        original_row_count,
                        valid_row_count,
                        invalid_row_count,
                        validation_summary,
                        detection_result,
                        error_message
                    from public.dataset_uploads
                    where dataset_type in ('dengue', 'weather', 'population', 'boundary')
                    order by dataset_type, uploaded_at desc
                    """
                )
            ).mappings().all()
    except Exception:
        return status

    for row in rows:
        source_key = row["dataset_type"]
        loaded = _safe_int(row["valid_row_count"], 0) > 0

        status["sources"][source_key] = {
            "upload_id": str(row["upload_id"]),
            "filename": row["original_filename"],
            "file_type": row["file_type"],
            "uploaded_at": str(row["uploaded_at"]) if row["uploaded_at"] else None,
            "updated_at": str(row["uploaded_at"]) if row["uploaded_at"] else None,
            "status": row["status"],
            "loaded": loaded,
            "record_count": _safe_int(row["original_row_count"], 0),
            "valid_count": _safe_int(row["valid_row_count"], 0),
            "invalid_count": _safe_int(row["invalid_row_count"], 0),
            "validation_summary": _json_value(row["validation_summary"], {}),
            "detection_result": _json_value(row["detection_result"], {}),
            "error_message": row["error_message"],
        }

    loaded_sources = [
        source_key
        for source_key in required_sources
        if status["sources"].get(source_key, {}).get("loaded")
    ]

    status["loaded_sources"] = loaded_sources
    status["missing_sources"] = [
        source_key
        for source_key in required_sources
        if source_key not in loaded_sources
    ]
    status["loaded_source_count"] = len(loaded_sources)
    status["complete"] = len(status["missing_sources"]) == 0

    return status


def _get_latest_integrated_dataset_summary():
    try:
        with engine.connect() as connection:
            integration_run = connection.execute(
                text(
                    """
                    select integration_run_id, status, row_count, summary, created_at
                    from public.integration_runs
                    order by created_at desc
                    limit 1
                    """
                )
            ).mappings().first()

            if not integration_run:
                return None

            counts = connection.execute(
                text(
                    """
                    select
                        count(*) as row_count,
                        count(*) filter (
                            where rainfall is not null
                               or temperature is not null
                               or humidity is not null
                        ) as weather_matched_rows,
                        count(*) filter (
                            where boundary_id is not null
                               or nullif(geometry_id, '') is not null
                               or coalesce(boundary_match_status, '') ilike 'found%'
                        ) as boundary_matched_rows,
                        count(*) filter (
                            where population is not null
                               and population > 0
                        ) as population_matched_rows
                    from public.integrated_dataset_rows
                    where integration_run_id = :integration_run_id
                    """
                ),
                {"integration_run_id": integration_run["integration_run_id"]},
            ).mappings().first()
    except Exception:
        return None

    summary = _json_value(integration_run["summary"], {})

    return {
        "integration_run_id": str(integration_run["integration_run_id"]),
        "status": integration_run["status"],
        "created_at": str(integration_run["created_at"]) if integration_run["created_at"] else None,
        "summary": summary,
        "row_count": _safe_int(counts["row_count"] if counts else integration_run["row_count"], 0),
        "weather_matched_rows": _safe_int(counts["weather_matched_rows"] if counts else summary.get("weather_matched_rows"), 0),
        "boundary_matched_rows": _safe_int(counts["boundary_matched_rows"] if counts else summary.get("boundary_matched_rows"), 0),
        "population_matched_rows": _safe_int(counts["population_matched_rows"] if counts else summary.get("population_matched_rows"), 0),
    }


def _forecast_notifications(forecast_result):
    if not forecast_result:
        return []

    rows = forecast_result.get("forecast_results") or []
    risk_counts = forecast_result.get("risk_counts") or {}
    timestamp = forecast_result.get("updated_at") or _now_iso()
    notifications = []

    total_rows = len(rows)
    total_forecast = _safe_int(forecast_result.get("total_forecast_next_4_periods"), 0)
    forecast_run_id = forecast_result.get("forecast_run_id")

    if total_rows > 0:
        notifications.append(
            _notification(
                notification_id=f"forecast-completed-{forecast_run_id}-{total_rows}-{total_forecast}",
                title="Forecast run completed",
                message=(
                    f"Backend forecast completed for {total_rows} barangay"
                    f"{'y' if total_rows == 1 else 'ies'} with {total_forecast} projected case"
                    f"{'s' if total_forecast != 1 else ''} for the next four periods."
                ),
                severity="success",
                category="forecast_completed",
                to="/forecast",
                hash="forecast-model",
                timestamp=timestamp,
                meta={
                    "forecast_run_id": forecast_run_id,
                    "barangay_count": total_rows,
                    "total_forecast_next_4_periods": total_forecast,
                    "data_source": "supabase_forecast_results",
                },
            )
        )

    high_rows = [row for row in rows if row.get("risk_level") == "High"]
    high_count = _safe_int(risk_counts.get("High"), len(high_rows))

    if high_count > 0:
        notifications.append(
            _notification(
                notification_id=f"backend-high-risk-{forecast_run_id}-{high_count}-{_slug(_format_names(high_rows))}",
                title="High-risk barangay detected",
                message=(
                    f"{_format_names(high_rows)} classified as High risk in the latest saved forecast. "
                    "Review the priority ranking and response recommendations."
                ),
                severity="danger",
                category="high_risk_detected",
                to="/forecast",
                hash="top-barangays",
                timestamp=timestamp,
                meta={
                    "forecast_run_id": forecast_run_id,
                    "high_risk_count": high_count,
                    "barangays": [row.get("barangay") for row in high_rows],
                    "data_source": "supabase_forecast_results",
                },
            )
        )

    moderate_rows = [row for row in rows if row.get("risk_level") == "Moderate"]

    if moderate_rows:
        notifications.append(
            _notification(
                notification_id=f"backend-moderate-risk-{forecast_run_id}-{len(moderate_rows)}-{_slug(_format_names(moderate_rows))}",
                title="Moderate-risk barangay needs monitoring",
                message=(
                    f"{_format_names(moderate_rows)} classified as Moderate risk. "
                    "Include these barangays in close monitoring and prevention activities."
                ),
                severity="warning",
                category="moderate_risk_detected",
                to="/forecast",
                hash="top-barangays",
                timestamp=timestamp,
                meta={
                    "forecast_run_id": forecast_run_id,
                    "moderate_risk_count": len(moderate_rows),
                    "barangays": [row.get("barangay") for row in moderate_rows],
                    "data_source": "supabase_forecast_results",
                },
            )
        )

    escalated_rows = []

    for row in rows:
        current_risk = row.get("risk_level")
        previous_average = _safe_number(row.get("previous_average_cases"), 0)
        previous_projection = int(round(previous_average * 4))
        previous_risk = classify_forecast_risk(previous_projection)

        if previous_risk == "Moderate" and current_risk == "High":
            escalated_rows.append(
                {
                    **row,
                    "previous_projection": previous_projection,
                    "previous_risk": previous_risk,
                }
            )

    if escalated_rows:
        notifications.append(
            _notification(
                notification_id=f"moderate-to-high-{forecast_run_id}-{len(escalated_rows)}-{_slug(_format_names(escalated_rows))}",
                title="Forecast increased from Moderate to High",
                message=(
                    f"{_format_names(escalated_rows)} moved from a Moderate baseline level to High in the latest forecast. "
                    "Check case trends before field response scheduling."
                ),
                severity="danger",
                category="risk_escalation",
                to="/forecast",
                hash="top-barangays",
                timestamp=timestamp,
                meta={
                    "forecast_run_id": forecast_run_id,
                    "escalated_count": len(escalated_rows),
                    "barangays": [row.get("barangay") for row in escalated_rows],
                    "data_source": "supabase_forecast_results",
                },
            )
        )

    invalid_count = _safe_int(forecast_result.get("invalid_row_count"), 0)

    if invalid_count > 0:
        notifications.append(
            _notification(
                notification_id=f"forecast-invalid-rows-{forecast_run_id}-{invalid_count}",
                title="Dengue upload has invalid rows",
                message=(
                    f"The dengue file contains {invalid_count} invalid row"
                    f"{'s' if invalid_count != 1 else ''}. Review the cleaned records before using the output for reporting."
                ),
                severity="warning",
                category="invalid_rows",
                to="/upload",
                hash="data-upload",
                timestamp=timestamp,
                meta={
                    "source": "dengue",
                    "invalid_count": invalid_count,
                    "forecast_run_id": forecast_run_id,
                },
            )
        )

    return notifications


def _source_quality_notifications(status):
    notifications = []
    sources = status.get("sources") or {}

    for source_key, source in sources.items():
        invalid_count = _safe_int(source.get("invalid_count"), 0)

        if invalid_count <= 0:
            continue

        source_label = {
            "dengue": "Dengue",
            "weather": "Weather",
            "population": "Population",
            "boundary": "Boundary",
        }.get(source_key, source_key.title())

        notifications.append(
            _notification(
                notification_id=f"{source_key}-invalid-rows-{source.get('upload_id')}-{invalid_count}",
                title="Data upload has invalid rows",
                message=(
                    f"{source_label} upload has {invalid_count} invalid row"
                    f"{'s' if invalid_count != 1 else ''}. Open Upload to review validation details."
                ),
                severity="warning",
                category="invalid_rows",
                to="/upload",
                hash="data-upload" if source_key != "boundary" else "boundary-upload",
                timestamp=source.get("updated_at") or _now_iso(),
                meta={
                    "source": source_key,
                    "invalid_count": invalid_count,
                    "filename": source.get("filename", ""),
                    "upload_id": source.get("upload_id"),
                    "data_source": "supabase_dataset_uploads",
                },
            )
        )

    missing_sources = status.get("missing_sources") or []

    if missing_sources:
        notifications.append(
            _notification(
                notification_id=f"missing-upload-sources-{'-'.join(missing_sources)}",
                title="Required dataset missing",
                message=(
                    f"The system is missing {', '.join(missing_sources)} dataset"
                    f"{'s' if len(missing_sources) != 1 else ''}. Upload all required files for complete analysis."
                ),
                severity="warning",
                category="required_dataset_missing",
                to="/upload",
                hash="data-upload",
                meta={
                    "missing_sources": missing_sources,
                    "data_source": "supabase_dataset_uploads",
                },
            )
        )

    return notifications


def _merged_dataset_notifications(summary):
    if not summary:
        return []

    row_count = _safe_int(summary.get("row_count"), 0)
    weather_matched = _safe_int(summary.get("weather_matched_rows"), 0)
    boundary_matched = _safe_int(summary.get("boundary_matched_rows"), 0)
    population_matched = _safe_int(summary.get("population_matched_rows"), 0)
    integration_run_id = summary.get("integration_run_id")
    notifications = []

    if row_count <= 0:
        return notifications

    notifications.append(
        _notification(
            notification_id=f"integration-dataset-ready-{integration_run_id}-{row_count}",
            title="Combined dataset ready",
            message=(
                f"The latest saved combined dataset has {row_count} model-ready row"
                f"{'s' if row_count != 1 else ''} for forecast, map, report, and DSS modules."
            ),
            severity="success",
            category="integration_ready",
            to="/upload",
            hash="automatic-data-preparation",
            timestamp=summary.get("created_at") or _now_iso(),
            meta={
                "integration_run_id": integration_run_id,
                "row_count": row_count,
                "data_source": "supabase_integrated_dataset_rows",
            },
        )
    )

    if weather_matched < row_count:
        missing_count = row_count - weather_matched
        notifications.append(
            _notification(
                notification_id=f"weather-missing-rows-{integration_run_id}-{missing_count}-{row_count}",
                title="Weather data missing for selected period",
                message=(
                    f"{missing_count} of {row_count} dengue row"
                    f"{'s' if row_count != 1 else ''} could not be matched to weather data."
                ),
                severity="warning",
                category="weather_missing",
                to="/upload",
                hash="data-upload",
                meta={
                    "integration_run_id": integration_run_id,
                    "row_count": row_count,
                    "weather_matched_rows": weather_matched,
                    "missing_weather_rows": missing_count,
                    "data_source": "supabase_integrated_dataset_rows",
                },
            )
        )

    if boundary_matched < row_count:
        missing_count = row_count - boundary_matched
        notifications.append(
            _notification(
                notification_id=f"boundary-missing-rows-{integration_run_id}-{missing_count}-{row_count}",
                title="Boundary file has unmatched barangays",
                message=(
                    f"{missing_count} of {row_count} dengue row"
                    f"{'s' if row_count != 1 else ''} does not have a matched barangay boundary. "
                    "Map-based hotspot interpretation may need review."
                ),
                severity="warning",
                category="boundary_unmatched",
                to="/upload",
                hash="boundary-upload",
                meta={
                    "integration_run_id": integration_run_id,
                    "row_count": row_count,
                    "boundary_matched_rows": boundary_matched,
                    "missing_boundary_rows": missing_count,
                    "data_source": "supabase_integrated_dataset_rows",
                },
            )
        )

    if population_matched < row_count:
        missing_count = row_count - population_matched
        notifications.append(
            _notification(
                notification_id=f"population-missing-rows-{integration_run_id}-{missing_count}-{row_count}",
                title="Population data missing for some barangays",
                message=(
                    f"{missing_count} of {row_count} dengue row"
                    f"{'s' if row_count != 1 else ''} could not be matched to population data."
                ),
                severity="warning",
                category="population_missing",
                to="/upload",
                hash="population-upload",
                meta={
                    "integration_run_id": integration_run_id,
                    "row_count": row_count,
                    "population_matched_rows": population_matched,
                    "missing_population_rows": missing_count,
                    "data_source": "supabase_integrated_dataset_rows",
                },
            )
        )

    return notifications


def _hotspot_notifications():
    try:
        from app.services.geospatial_hotspot import build_geospatial_hotspots

        result = build_geospatial_hotspots(radius_km=3.0, fallback_nearest_count=3)
    except Exception:
        return []

    hotspots = result.get("hotspots") or []
    summary = result.get("summary") or {}
    level_counts = summary.get("level_counts") or {}
    notifications = []

    confirmed_rows = [
        row
        for row in hotspots
        if row.get("hotspot_level") == "Confirmed Hotspot"
    ]
    emerging_rows = [
        row
        for row in hotspots
        if row.get("hotspot_level") == "Emerging Hotspot"
    ]
    review_rows = [
        row
        for row in hotspots
        if row.get("hotspot_level") == "Needs Map Review"
    ]

    if confirmed_rows:
        notifications.append(
            _notification(
                notification_id=f"confirmed-hotspot-{_slug(_format_names(confirmed_rows))}-{len(confirmed_rows)}",
                title="Confirmed hotspot detected",
                message=(
                    f"{_format_names(confirmed_rows)} classified as Confirmed hotspot from the latest database-backed spatial analysis. "
                    "Prioritize field validation and response coordination."
                ),
                severity="danger",
                category="confirmed_hotspot_detected",
                to="/map",
                hash="hotspot-map",
                meta={
                    "confirmed_hotspot_count": len(confirmed_rows),
                    "barangays": [row.get("barangay") for row in confirmed_rows],
                    "level_counts": level_counts,
                    "data_source": result.get("data_source", "supabase_integrated_dataset_rows"),
                    "boundary_source": result.get("boundary_source", "supabase_postgis"),
                },
            )
        )

    if emerging_rows:
        notifications.append(
            _notification(
                notification_id=f"emerging-hotspot-{_slug(_format_names(emerging_rows))}-{len(emerging_rows)}",
                title="Emerging hotspot detected",
                message=(
                    f"{_format_names(emerging_rows)} classified as Emerging hotspot. "
                    "Schedule close monitoring and prevention activities."
                ),
                severity="warning",
                category="emerging_hotspot_detected",
                to="/map",
                hash="hotspot-map",
                meta={
                    "emerging_hotspot_count": len(emerging_rows),
                    "barangays": [row.get("barangay") for row in emerging_rows],
                    "level_counts": level_counts,
                    "data_source": result.get("data_source", "supabase_integrated_dataset_rows"),
                    "boundary_source": result.get("boundary_source", "supabase_postgis"),
                },
            )
        )

    if review_rows:
        notifications.append(
            _notification(
                notification_id=f"map-review-needed-{_slug(_format_names(review_rows))}-{len(review_rows)}",
                title="Map boundary review needed",
                message=(
                    f"{len(review_rows)} barangay"
                    f"{'s' if len(review_rows) != 1 else ''} need map boundary review before spatial hotspot scoring can be finalized."
                ),
                severity="warning",
                category="map_review_needed",
                to="/map",
                hash="hotspot-map",
                meta={
                    "review_count": len(review_rows),
                    "barangays": [row.get("barangay") for row in review_rows],
                    "data_source": result.get("data_source", "supabase_integrated_dataset_rows"),
                    "boundary_source": result.get("boundary_source", "supabase_postgis"),
                },
            )
        )

    return notifications


def build_backend_notifications():
    status = _get_source_status_from_database()
    forecast_result = _get_latest_forecast_from_database()
    integration_summary = _get_latest_integrated_dataset_summary()

    notifications = []
    notifications.extend(_forecast_notifications(forecast_result))
    notifications.extend(_hotspot_notifications())
    notifications.extend(_source_quality_notifications(status))
    notifications.extend(_merged_dataset_notifications(integration_summary))

    save_generated_notifications(notifications)

    notifications.extend(get_notification_events(limit=10))

    if not notifications:
        notifications.append(
            _notification(
                notification_id="backend-no-active-alerts",
                title="No active backend alerts",
                message="No backend forecast, upload, weather, boundary, or hotspot alerts are active at this time.",
                severity="success",
                category="system_clear",
                to="/dashboard",
                hash="dashboard-summary",
            )
        )

    deduped = []
    seen = set()

    for item in notifications:
        item_id = item.get("id") or f"{item.get('category')}-{item.get('title')}"
        if item_id in seen:
            continue
        seen.add(item_id)
        deduped.append(item)

    severity_order = {
        "danger": 0,
        "warning": 1,
        "activity": 2,
        "info": 3,
        "success": 4,
    }

    deduped.sort(
        key=lambda item: (
            severity_order.get(item.get("severity"), 3),
            item.get("timestamp") or "",
        )
    )

    return {
        "message": "Backend notifications generated successfully.",
        "generated_at": _now_iso(),
        "status": status,
        "data_sources": {
            "uploads": "supabase_dataset_uploads",
            "forecast": "supabase_forecast_runs_and_results",
            "integration": "supabase_integrated_dataset_rows",
            "hotspots": "supabase_integrated_dataset_rows_and_postgis_boundaries",
            "events": "supabase_notifications",
        },
        "notification_count": len(deduped),
        "unread_count": len([item for item in deduped if not item.get("read")]),
        "persistence": "database-backed alerts generated from Supabase data and saved notification events",
        "notifications": deduped[:30],
    }
