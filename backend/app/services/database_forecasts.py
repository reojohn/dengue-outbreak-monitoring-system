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


def _normalize_weather_value(value: Any, field: str):
    number = _to_float(value)

    if number is None:
        return None

    if field in {"rainfall", "temperature", "humidity"}:
        while number > 1000:
            number = number / 1000

    if field in {"temperature", "humidity"} and number > 100:
        number = number / 1000

    return round(number, 3)


def ensure_forecast_factor_columns() -> None:
    with engine.begin() as connection:
        connection.execute(text("alter table public.forecast_results add column if not exists combined_risk_score numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists environmental_score numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists environmental_suitability text"))
        connection.execute(text("alter table public.forecast_results add column if not exists rainfall_pressure text"))
        connection.execute(text("alter table public.forecast_results add column if not exists temperature_suitability text"))
        connection.execute(text("alter table public.forecast_results add column if not exists humidity_suitability text"))
        connection.execute(text("alter table public.forecast_results add column if not exists population_exposure text"))
        connection.execute(text("alter table public.forecast_results add column if not exists density_level text"))
        connection.execute(text("alter table public.forecast_results add column if not exists average_rainfall numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists average_temperature numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists average_humidity numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists population integer"))
        connection.execute(text("alter table public.forecast_results add column if not exists density numeric"))
        connection.execute(text("alter table public.forecast_results add column if not exists risk_components jsonb not null default '{}'::jsonb"))
        connection.execute(text("alter table public.forecast_results add column if not exists forecast_period_predictions jsonb not null default '[]'::jsonb"))
        connection.execute(text("alter table public.forecast_results add column if not exists forecast_strategy text"))

        connection.execute(text("create index if not exists idx_forecast_results_combined_risk_score on public.forecast_results (combined_risk_score desc)"))


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


def _get_integrated_profiles_by_barangay_key(connection, integration_run_id=None) -> dict:
    if not integration_run_id:
        return {}

    result = connection.execute(
        text("""
            select
                barangay_key,
                max(barangay) as barangay,
                avg(rainfall) as average_rainfall,
                avg(temperature) as average_temperature,
                avg(humidity) as average_humidity,
                max(population) as population,
                max(density) as density,
                max(boundary_area_sqkm) as boundary_area_sqkm
            from public.integrated_dataset_rows
            where integration_run_id = :integration_run_id
            group by barangay_key
        """),
        {"integration_run_id": integration_run_id},
    )

    profiles = {}

    for row in result.mappings().all():
        barangay_key = row["barangay_key"]

        if not barangay_key:
            continue

        population = _to_int(row["population"], 0)
        boundary_area_sqkm = _to_float(row["boundary_area_sqkm"], 0)
        density = _to_float(row["density"], 0)

        if (not density or density < 50) and population and boundary_area_sqkm:
            density = population / boundary_area_sqkm

        profiles[barangay_key] = {
            "barangay": row["barangay"],
            "average_rainfall": _normalize_weather_value(row["average_rainfall"], "rainfall"),
            "average_temperature": _normalize_weather_value(row["average_temperature"], "temperature"),
            "average_humidity": _normalize_weather_value(row["average_humidity"], "humidity"),
            "population": population,
            "density": round(float(density or 0), 3) if density else 0,
            "boundary_area_sqkm": boundary_area_sqkm,
        }

    return profiles


def _compact_key(value: Any) -> str:
    return str(value or "").replace(" ", "").replace(".", "").replace("-", "").lower().strip()


def _find_integrated_profile(barangay_key: str, profiles: dict) -> dict:
    if not barangay_key or not profiles:
        return {}

    exact_match = profiles.get(barangay_key)

    if exact_match:
        return exact_match

    compact_key = _compact_key(barangay_key)

    for profile_key, profile in profiles.items():
        compact_profile_key = _compact_key(profile_key)
        profile_barangay = _compact_key(profile.get("barangay"))

        if compact_key and compact_profile_key:
            if compact_key == compact_profile_key:
                return profile

            if len(compact_key) >= 4 and compact_key in compact_profile_key:
                return profile

            if len(compact_profile_key) >= 4 and compact_profile_key in compact_key:
                return profile

        if compact_key and profile_barangay:
            if compact_key == profile_barangay:
                return profile

            if len(compact_key) >= 4 and compact_key in profile_barangay:
                return profile

            if len(profile_barangay) >= 4 and profile_barangay in compact_key:
                return profile

    return {}


def _score_rainfall(value):
    rainfall = _normalize_weather_value(value, "rainfall")

    if rainfall is None or rainfall <= 0:
        return 0, "Rainfall data unavailable"

    if rainfall >= 80:
        return 10, "High rainfall pressure"

    if rainfall >= 20:
        return 7, "Moderate rainfall pressure"

    return 3, "Low rainfall pressure"


def _score_temperature(value):
    temperature = _normalize_weather_value(value, "temperature")

    if temperature is None or temperature <= 0:
        return 0, "Temperature data unavailable"

    if 24 <= temperature <= 32:
        return 10, "Temperature suitable for mosquito activity"

    if 20 <= temperature < 24 or 32 < temperature <= 35:
        return 6, "Temperature partly suitable for mosquito activity"

    return 2, "Temperature less suitable for mosquito activity"


def _score_humidity(value):
    humidity = _normalize_weather_value(value, "humidity")

    if humidity is None or humidity <= 0:
        return 0, "Humidity data unavailable"

    if humidity >= 80:
        return 10, "High humidity suitability"

    if humidity >= 60:
        return 7, "Moderate humidity suitability"

    return 3, "Low humidity suitability"


def _score_population(value):
    population = _to_int(value, 0)

    if population <= 0:
        return 0, "Population data unavailable"

    if population >= 15000:
        return 8, "High population exposure"

    if population >= 8000:
        return 5, "Moderate population exposure"

    return 2, "Lower population exposure"


def _score_density(value):
    density = _to_float(value, 0) or 0

    if density <= 0:
        return 0, "Density data unavailable"

    if density >= 5000:
        return 7, "Very dense barangay"

    if density >= 1500:
        return 5, "Dense barangay"

    if density >= 500:
        return 3, "Moderate density barangay"

    return 1, "Lower density barangay"


def _get_environmental_label(environmental_score):
    if environmental_score >= 24:
        return "Highly suitable dengue environment"

    if environmental_score >= 16:
        return "Moderately suitable dengue environment"

    if environmental_score > 0:
        return "Low dengue environmental suitability"

    return "Environmental data unavailable"


def _risk_priority_value(value: Any) -> int:
    risk = str(value or "").strip().lower()

    if risk == "high":
        return 3

    if risk == "moderate":
        return 2

    if risk == "low":
        return 1

    return 0


def _is_high_environment_for_priority(row: dict) -> bool:
    """Use the same environmental scoring bands that are persisted in forecast results."""
    rainfall_score, _ = _score_rainfall(row.get("average_rainfall"))
    temperature_score, _ = _score_temperature(row.get("average_temperature"))
    humidity_score, _ = _score_humidity(row.get("average_humidity"))
    environmental_score = rainfall_score + temperature_score + humidity_score

    if environmental_score > 0:
        return environmental_score >= 24

    environment = str(
        row.get("environmental_suitability")
        or row.get("environmentalSuitability")
        or ""
    ).strip().lower()
    return "highly suitable" in environment or "high environmental" in environment


def _canonical_response_priority_value(row: dict) -> int:
    risk = str(row.get("risk_level") or row.get("risk") or "").strip().lower()
    trend = str(row.get("trend_direction") or row.get("trend") or "").strip().lower()
    density_label = str(
        row.get("density_level") or row.get("densityLevel") or ""
    ).strip().lower()
    density = _to_float(row.get("density"), 0) or 0
    forecast = _to_float(row.get("forecast_next_4_periods"), 0) or 0

    is_increasing = "increasing" in trend
    is_high_environment = _is_high_environment_for_priority(row)
    density_score, _ = _score_density(density)
    is_dense = (
        density_score >= 5
        or "very dense" in density_label
        or "dense barangay" in density_label
        or "high density" in density_label
    )

    if risk == "high" and (
        is_increasing
        or is_high_environment
        or is_dense
        or forecast >= 90
    ):
        return 7

    if risk == "high":
        return 6

    if risk == "moderate" and is_increasing and (is_high_environment or is_dense):
        return 5

    if risk == "moderate" and (is_increasing or is_high_environment):
        return 4

    if risk == "moderate":
        return 3

    if risk == "low" and (is_increasing or is_high_environment):
        return 2

    if risk == "low":
        return 1

    return 0


def _canonical_priority_sort_key(row: dict):
    return (
        -_risk_priority_value(row.get("risk_level") or row.get("risk")),
        -(_to_float(row.get("combined_risk_score"), 0) or 0),
        -_canonical_response_priority_value(row),
        -(_to_float(row.get("forecast_next_4_periods"), 0) or 0),
        str(row.get("barangay") or "").strip().lower(),
    )


def _apply_canonical_priority_ranks(rows: list[dict]) -> list[dict]:
    ranked_rows = sorted(rows, key=_canonical_priority_sort_key)

    for index, row in enumerate(ranked_rows, start=1):
        row["priority_rank"] = index

    return ranked_rows


def _build_combined_risk_profile(row: dict, integrated_profile: dict | None = None) -> dict:
    integrated_profile = integrated_profile or {}

    risk_level = row.get("risk_level") or row.get("risk") or "Low"
    trend_direction = row.get("trend_direction") or "Stable"
    forecast_next_4_periods = _to_float(row.get("forecast_next_4_periods"), 0) or 0

    average_rainfall = integrated_profile.get("average_rainfall")
    average_temperature = integrated_profile.get("average_temperature")
    average_humidity = integrated_profile.get("average_humidity")
    population = integrated_profile.get("population") or 0
    density = integrated_profile.get("density") or 0

    rainfall_score, rainfall_pressure = _score_rainfall(average_rainfall)
    temperature_score, temperature_suitability = _score_temperature(average_temperature)
    humidity_score, humidity_suitability = _score_humidity(average_humidity)
    population_score, population_exposure = _score_population(population)
    density_score, density_level = _score_density(density)

    risk_level_component = {
        "High": 40,
        "Moderate": 25,
        "Low": 10,
    }.get(risk_level, 10)

    forecast_volume_component = min(15, round(forecast_next_4_periods / 8, 2))

    trend_component = 0
    trend_value = str(trend_direction or "").lower()

    if "increasing" in trend_value:
        trend_component = 10
    elif "stable" in trend_value:
        trend_component = 5
    elif "decreasing" in trend_value:
        trend_component = 1

    environmental_score = rainfall_score + temperature_score + humidity_score
    environmental_suitability = _get_environmental_label(environmental_score)

    combined_score = round(
        min(
            100,
            risk_level_component
            + forecast_volume_component
            + trend_component
            + environmental_score
            + population_score
            + density_score,
        )
    )

    risk_components = {
        "risk_level_component": risk_level_component,
        "forecast_volume_component": forecast_volume_component,
        "trend_component": trend_component,
        "rainfall_component": rainfall_score,
        "temperature_component": temperature_score,
        "humidity_component": humidity_score,
        "population_component": population_score,
        "density_component": density_score,
        "environmental_score": environmental_score,
    }

    return {
        "combined_risk_score": combined_score,
        "environmental_score": environmental_score,
        "environmental_suitability": environmental_suitability,
        "rainfall_pressure": rainfall_pressure,
        "temperature_suitability": temperature_suitability,
        "humidity_suitability": humidity_suitability,
        "population_exposure": population_exposure,
        "density_level": density_level,
        "average_rainfall": average_rainfall,
        "average_temperature": average_temperature,
        "average_humidity": average_humidity,
        "population": population,
        "density": density,
        "risk_components": risk_components,
    }


def save_forecast_result(
    *,
    forecast_result: dict,
    dengue_upload_id=None,
    integration_run_id=None,
    created_by: str = "demo_user",
    resolve_latest_integration_if_missing: bool = True,
) -> dict:
    ensure_forecast_factor_columns()

    forecast_rows = forecast_result.get("forecast_results") or []

    if dengue_upload_id is None:
        dengue_upload_id = get_latest_dengue_upload_id()

    if integration_run_id is None and resolve_latest_integration_if_missing:
        integration_run_id = get_latest_integration_run_id()

    with engine.begin() as connection:
        integrated_profiles = _get_integrated_profiles_by_barangay_key(
            connection,
            integration_run_id,
        )

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
                "model_name": forecast_result.get("model_name", "baseline_rule_forecast"),
                "model_version": forecast_result.get("model_version", "v1"),
                "is_machine_learning": bool(forecast_result.get("is_machine_learning", False)),
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
            enriched_forecast_rows = []

            for row in forecast_rows:
                barangay = row.get("barangay") or ""
                barangay_key = normalize_barangay_key(barangay)
                integrated_profile = _find_integrated_profile(barangay_key, integrated_profiles)
                combined_profile = _build_combined_risk_profile(row, integrated_profile)

                payloads.append(
                    {
                        "forecast_run_id": forecast_run_id,
                        "barangay": barangay,
                        "barangay_key": barangay_key,
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
                        "forecast_period_predictions": _to_json(
                            row.get("forecast_period_predictions") or []
                        ),
                        "forecast_strategy": row.get("forecast_strategy") or forecast_result.get("forecast_strategy"),
                        "risk_level": row.get("risk_level"),
                        "risk_score": _to_float(
                            row.get("forecast_next_4_periods"),
                            0,
                        ),
                        "recommendation": row.get("recommendation"),
                        "priority_rank": 0,
                        "combined_risk_score": combined_profile["combined_risk_score"],
                        "environmental_score": combined_profile["environmental_score"],
                        "environmental_suitability": combined_profile["environmental_suitability"],
                        "rainfall_pressure": combined_profile["rainfall_pressure"],
                        "temperature_suitability": combined_profile["temperature_suitability"],
                        "humidity_suitability": combined_profile["humidity_suitability"],
                        "population_exposure": combined_profile["population_exposure"],
                        "density_level": combined_profile["density_level"],
                        "average_rainfall": combined_profile["average_rainfall"],
                        "average_temperature": combined_profile["average_temperature"],
                        "average_humidity": combined_profile["average_humidity"],
                        "population": combined_profile["population"],
                        "density": combined_profile["density"],
                        "risk_components": _to_json(combined_profile["risk_components"]),
                    }
                )

                enriched_forecast_rows.append(
                    {
                        **row,
                        "barangay_key": barangay_key,
                        "priority_rank": 0,
                        "combined_risk_score": combined_profile["combined_risk_score"],
                        "multi_source_risk_score": combined_profile["combined_risk_score"],
                        "environmental_score": combined_profile["environmental_score"],
                        "environmental_suitability": combined_profile["environmental_suitability"],
                        "rainfall_pressure": combined_profile["rainfall_pressure"],
                        "temperature_suitability": combined_profile["temperature_suitability"],
                        "humidity_suitability": combined_profile["humidity_suitability"],
                        "population_exposure": combined_profile["population_exposure"],
                        "density_level": combined_profile["density_level"],
                        "average_rainfall": combined_profile["average_rainfall"],
                        "average_temperature": combined_profile["average_temperature"],
                        "average_humidity": combined_profile["average_humidity"],
                        "population": combined_profile["population"],
                        "density": combined_profile["density"],
                        "risk_components": combined_profile["risk_components"],
                    }
                )

            payloads = _apply_canonical_priority_ranks(payloads)
            enriched_forecast_rows = _apply_canonical_priority_ranks(enriched_forecast_rows)

            # Return the same canonical, database-backed scores immediately to the
            # frontend. Without this, the browser calculates a temporary fallback
            # score before refresh, while Supabase returns a different saved score
            # after refresh, causing the top barangay to appear to change.
            forecast_result["forecast_results"] = enriched_forecast_rows
            forecast_result["barangay_count"] = len(enriched_forecast_rows)

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
                        forecast_period_predictions,
                        forecast_strategy,
                        risk_level,
                        risk_score,
                        recommendation,
                        priority_rank,
                        combined_risk_score,
                        environmental_score,
                        environmental_suitability,
                        rainfall_pressure,
                        temperature_suitability,
                        humidity_suitability,
                        population_exposure,
                        density_level,
                        average_rainfall,
                        average_temperature,
                        average_humidity,
                        population,
                        density,
                        risk_components
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
                        cast(:forecast_period_predictions as jsonb),
                        :forecast_strategy,
                        :risk_level,
                        :risk_score,
                        :recommendation,
                        :priority_rank,
                        :combined_risk_score,
                        :environmental_score,
                        :environmental_suitability,
                        :rainfall_pressure,
                        :temperature_suitability,
                        :humidity_suitability,
                        :population_exposure,
                        :density_level,
                        :average_rainfall,
                        :average_temperature,
                        :average_humidity,
                        :population,
                        :density,
                        cast(:risk_components as jsonb)
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


def _first_available(saved_value, derived_value):
    if saved_value is None or saved_value == "":
        return derived_value

    return saved_value


def get_latest_forecast_result_from_database() -> dict:
    ensure_forecast_factor_columns()

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
                where status = 'completed'
                order by
                    completed_at desc nulls last,
                    started_at desc nulls last,
                    forecast_run_id desc
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

        integrated_profiles = _get_integrated_profiles_by_barangay_key(
            connection,
            forecast_run["integration_run_id"],
        )

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
                    forecast_period_predictions,
                    forecast_strategy,
                    risk_level,
                    risk_score,
                    recommendation,
                    priority_rank,
                    combined_risk_score,
                    environmental_score,
                    environmental_suitability,
                    rainfall_pressure,
                    temperature_suitability,
                    humidity_suitability,
                    population_exposure,
                    density_level,
                    average_rainfall,
                    average_temperature,
                    average_humidity,
                    population,
                    density,
                    risk_components,
                    created_at
                from public.forecast_results
                where forecast_run_id = :forecast_run_id
                order by
                    case risk_level
                        when 'High' then 3
                        when 'Moderate' then 2
                        when 'Low' then 1
                        else 0
                    end desc,
                    combined_risk_score desc nulls last,
                    forecast_next_4_periods desc,
                    barangay asc
            """),
            {
                "forecast_run_id": forecast_run["forecast_run_id"],
            },
        )

        rows = rows_result.mappings().all()

    validation_summary = forecast_run["validation_summary"] or {}
    forecast_period_unit = validation_summary.get("forecast_period_unit", "period")
    forecast_horizon_periods = int(validation_summary.get("forecast_horizon_periods", 4) or 4)
    forecast_horizon_label = validation_summary.get("forecast_horizon_label") or "4-period forecast after latest available data"
    temporal_granularity = validation_summary.get("temporal_granularity", "reporting_period")

    forecast_results = []

    for row in rows:
        row_dict = dict(row)
        integrated_profile = _find_integrated_profile(row["barangay_key"], integrated_profiles)
        derived_profile = _build_combined_risk_profile(row_dict, integrated_profile)

        combined_risk_score = _first_available(
            row["combined_risk_score"],
            derived_profile["combined_risk_score"],
        )

        environmental_score = _first_available(
            row["environmental_score"],
            derived_profile["environmental_score"],
        )

        environmental_suitability = _first_available(
            row["environmental_suitability"],
            derived_profile["environmental_suitability"],
        )

        rainfall_pressure = _first_available(
            row["rainfall_pressure"],
            derived_profile["rainfall_pressure"],
        )

        temperature_suitability = _first_available(
            row["temperature_suitability"],
            derived_profile["temperature_suitability"],
        )

        humidity_suitability = _first_available(
            row["humidity_suitability"],
            derived_profile["humidity_suitability"],
        )

        population_exposure = _first_available(
            row["population_exposure"],
            derived_profile["population_exposure"],
        )

        density_level = _first_available(
            row["density_level"],
            derived_profile["density_level"],
        )

        average_rainfall = _first_available(
            row["average_rainfall"],
            derived_profile["average_rainfall"],
        )

        average_temperature = _first_available(
            row["average_temperature"],
            derived_profile["average_temperature"],
        )

        average_humidity = _first_available(
            row["average_humidity"],
            derived_profile["average_humidity"],
        )

        population = _first_available(
            row["population"],
            derived_profile["population"],
        )

        density = _first_available(
            row["density"],
            derived_profile["density"],
        )

        risk_components = row["risk_components"] or derived_profile["risk_components"]

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
                "forecast_period_predictions": row["forecast_period_predictions"] or [],
                "forecast_strategy": row["forecast_strategy"] or validation_summary.get("forecast_strategy"),
                "forecast_period_unit": forecast_period_unit,
                "forecast_horizon_periods": forecast_horizon_periods,
                "forecast_horizon_label": forecast_horizon_label,
                "risk_level": row["risk_level"],
                "risk_score": float(row["risk_score"] or 0),
                "combined_risk_score": float(combined_risk_score or 0),
                "multi_source_risk_score": float(combined_risk_score or 0),
                "environmental_score": float(environmental_score or 0),
                "environmental_suitability": environmental_suitability,
                "rainfall_pressure": rainfall_pressure,
                "temperature_suitability": temperature_suitability,
                "humidity_suitability": humidity_suitability,
                "population_exposure": population_exposure,
                "density_level": density_level,
                "average_rainfall": float(average_rainfall or 0),
                "average_temperature": float(average_temperature or 0),
                "average_humidity": float(average_humidity or 0),
                "population": int(population or 0),
                "density": float(density or 0),
                "risk_components": risk_components,
                "recommendation": row["recommendation"],
                "priority_rank": row["priority_rank"],
                "created_at": str(row["created_at"]) if row["created_at"] else None,
            }
        )

    forecast_results = _apply_canonical_priority_ranks(forecast_results)

    forecast_scope = validation_summary.get("forecast_scope") or (
        "multi_source_integrated" if forecast_run["integration_run_id"] else "historical_dengue_only"
    )
    forecast_stage = validation_summary.get("forecast_stage") or (
        "final" if forecast_run["integration_run_id"] else "preliminary"
    )
    is_preliminary = forecast_stage == "preliminary" or forecast_scope == "historical_dengue_only"

    return {
        "message": (
            "Latest preliminary historical dengue forecast loaded from Supabase."
            if is_preliminary
            else "Latest saved forecast loaded from Supabase."
        ),
        "has_saved_forecast": True,
        "forecast_scope": forecast_scope,
        "forecast_stage": forecast_stage,
        "is_preliminary_forecast": is_preliminary,
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
        "forecast_method": (
            "Preliminary historical-only dengue forecast using direct multi-step machine learning on dengue case history. Weather, population, and boundary context are added after the four-source workflow completes."
            if validation_summary.get("forecast_scope") == "historical_dengue_only"
            else "Four horizon-specific direct models generate Periods 1 through 4 separately; their predictions are summed for cumulative risk classification."
            if validation_summary.get("forecast_strategy") == "direct_multi_step"
            else "Saved forecast using uploaded dengue, weather, population, and barangay map records."
        ),
        "forecast_strategy": validation_summary.get("forecast_strategy"),
        "model_version": forecast_run["model_version"] or "v1",
        "risk_thresholds": "Forecast case-risk thresholds for the cumulative four-period prediction: High = 60 or more predicted cases; Moderate = 25 to 59; Low = fewer than 25. The 0-100 combined prioritization score is a separate multi-source decision-support measure.",
        "forecast_window": forecast_horizon_label,
        "temporal_granularity": temporal_granularity,
        "forecast_period_unit": forecast_period_unit,
        "forecast_horizon_periods": forecast_horizon_periods,
        "forecast_horizon_label": forecast_horizon_label,
        "total_forecast_next_4_periods": int(forecast_run["total_forecast_next_4_periods"] or 0),
        "risk_counts": forecast_run["risk_counts"] or {},
        "validation_summary": validation_summary,
        "model_metrics": validation_summary.get("preliminary_model_metrics") or {},
        "model_comparison": validation_summary.get("preliminary_model_comparison") or [],
        "training_summary": validation_summary.get("preliminary_training_summary") or {},
        "selection_confidence": validation_summary.get("preliminary_selection_confidence") or {},
        "selection_explanation": validation_summary.get("preliminary_selection_explanation") or {},
        "feature_importance": validation_summary.get("preliminary_feature_importance") or [],
        "forecast_results": forecast_results,
        "barangay_count": len(forecast_results),
    }