from math import asin, cos, radians, sin, sqrt

from fastapi import HTTPException
from sqlalchemy import text

from app.database import engine
from app.services.barangay_normalizer import normalize_barangay_key


def _safe_text(value):
    if value is None:
        return ""

    text_value = str(value).strip()

    if text_value.lower() in ["", "none", "nan", "null", "nat"]:
        return ""

    return text_value


def _to_number(value, fallback=0):
    if value is None:
        return fallback

    if isinstance(value, str):
        value = value.replace(",", "").strip()

        if value == "":
            return fallback

    try:
        number = float(value)
    except Exception:
        return fallback

    return number


def _average(values):
    clean_values = [
        _to_number(value, fallback=None)
        for value in values
        if value is not None and value != ""
    ]

    clean_values = [
        value
        for value in clean_values
        if value is not None
    ]

    if not clean_values:
        return 0

    return sum(clean_values) / len(clean_values)


def _clamp(value, minimum=0, maximum=100):
    return max(minimum, min(maximum, value))


def _haversine_km(lat1, lng1, lat2, lng2):
    radius_km = 6371.0

    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlng / 2) ** 2
    )

    c = 2 * asin(sqrt(a))

    return radius_km * c


def _load_latest_database_merged_rows():
    """
    Load the latest saved combined dataset from Supabase.

    This makes hotspot analysis survive backend restarts because it no longer
    depends on temporary backend memory.
    """

    with engine.connect() as connection:
        run_result = connection.execute(
            text(
                """
                select integration_run_id
                from public.integration_runs
                where status = 'completed'
                   or row_count > 0
                order by created_at desc
                limit 1
                """
            )
        )

        integration_run_id = run_result.scalar_one_or_none()

        if not integration_run_id:
            return {
                "integration_run_id": None,
                "rows": [],
            }

        rows_result = connection.execute(
            text(
                """
                select
                    integrated_row_id,
                    integration_run_id,
                    barangay,
                    barangay_key,
                    barangay_original,
                    barangay_original_key,
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
                order by barangay, year, month, week, period
                """
            ),
            {
                "integration_run_id": integration_run_id,
            },
        )

        rows = [dict(row) for row in rows_result.mappings().all()]

    return {
        "integration_run_id": str(integration_run_id),
        "rows": rows,
    }


def _load_latest_database_boundary_lookup():
    """
    Load latest saved barangay boundary centroids from Supabase/PostGIS.
    """

    with engine.connect() as connection:
        upload_result = connection.execute(
            text(
                """
                select du.upload_id
                from public.dataset_uploads du
                where du.dataset_type = 'boundary'
                  and exists (
                    select 1
                    from public.barangay_boundaries b
                    where b.upload_id = du.upload_id
                  )
                order by du.uploaded_at desc
                limit 1
                """
            )
        )

        upload_id = upload_result.scalar_one_or_none()

        if not upload_id:
            return {
                "upload_id": None,
                "lookup": {},
            }

        rows_result = connection.execute(
            text(
                """
                select
                    boundary_id,
                    upload_id,
                    barangay,
                    barangay_key,
                    map_area_id,
                    psgc_code,
                    ST_GeometryType(geometry) as geometry_type,
                    ST_Y(ST_PointOnSurface(geometry)) as centroid_lat,
                    ST_X(ST_PointOnSurface(geometry)) as centroid_lng
                from public.barangay_boundaries
                where upload_id = :upload_id
                """
            ),
            {
                "upload_id": upload_id,
            },
        )

        rows = rows_result.mappings().all()

    lookup = {}

    for row in rows:
        barangay = _safe_text(row["barangay"])
        barangay_key = normalize_barangay_key(row["barangay_key"] or barangay)
        centroid_lat = _to_number(row["centroid_lat"], None)
        centroid_lng = _to_number(row["centroid_lng"], None)

        if not barangay_key:
            continue

        centroid = None

        if centroid_lat is not None and centroid_lng is not None:
            centroid = {
                "lat": centroid_lat,
                "lng": centroid_lng,
            }

        lookup[barangay_key] = {
            "barangay": barangay,
            "barangay_key": barangay_key,
            "geometry_id": (
                _safe_text(row["map_area_id"])
                or _safe_text(row["psgc_code"])
                or str(row["boundary_id"])
            ),
            "geometry_type": _safe_text(row["geometry_type"]).replace("ST_", ""),
            "centroid": centroid,
        }

    return {
        "upload_id": str(upload_id),
        "lookup": lookup,
    }


def _get_boundary_lookup():
    database_boundary = _load_latest_database_boundary_lookup()

    return {
        "source": "supabase_postgis",
        "upload_id": database_boundary["upload_id"],
        "lookup": database_boundary["lookup"],
    }


def _get_merged_rows():
    database_result = _load_latest_database_merged_rows()

    return {
        "source": "supabase_integrated_dataset_rows",
        "integration_run_id": database_result["integration_run_id"],
        "rows": database_result["rows"],
    }


def _aggregate_merged_rows(merged_rows):
    grouped = {}

    for row in merged_rows:
        barangay = _safe_text(row.get("barangay")) or _safe_text(row.get("barangay_original"))
        barangay_key = normalize_barangay_key(
            row.get("barangay_key") or row.get("barangay_original_key") or barangay
        )

        if not barangay_key:
            continue

        if barangay_key not in grouped:
            grouped[barangay_key] = {
                "barangay": barangay,
                "barangay_key": barangay_key,
                "rows": [],
            }

        grouped[barangay_key]["rows"].append(row)

    barangays = []

    for barangay_key, item in grouped.items():
        rows = item["rows"]

        cases = sum(_to_number(row.get("cases"), 0) for row in rows)
        deaths = sum(_to_number(row.get("deaths"), 0) for row in rows)

        rainfall = _average(row.get("rainfall") for row in rows)
        temperature = _average(row.get("temperature") for row in rows)
        humidity = _average(row.get("humidity") for row in rows)

        population = max(_to_number(row.get("population"), 0) for row in rows)
        density = max(_to_number(row.get("density"), 0) for row in rows)
        boundary_area = max(_to_number(row.get("boundary_area_sqkm"), 0) for row in rows)

        barangays.append(
            {
                "barangay": item["barangay"],
                "barangay_key": barangay_key,
                "record_count": len(rows),
                "total_cases": round(cases, 3),
                "total_deaths": round(deaths, 3),
                "average_rainfall": round(rainfall, 3),
                "average_temperature": round(temperature, 3),
                "average_humidity": round(humidity, 3),
                "population": population,
                "density": density,
                "boundary_area_sqkm": boundary_area,
            }
        )

    return barangays


def _rainfall_pressure(rainfall):
    if rainfall <= 0:
        return 0

    return _clamp((rainfall / 30) * 100)


def _temperature_suitability(temperature):
    if temperature <= 0:
        return 0

    if 25 <= temperature <= 32:
        return 100

    if 22 <= temperature < 25:
        return 70

    if 32 < temperature <= 35:
        return 75

    if 20 <= temperature < 22:
        return 45

    if 35 < temperature <= 38:
        return 45

    return 20


def _humidity_pressure(humidity):
    if humidity <= 0:
        return 0

    if 70 <= humidity <= 95:
        return 100

    if 60 <= humidity < 70:
        return 75

    if humidity > 95:
        return 80

    if 50 <= humidity < 60:
        return 45

    return 20


def _compute_base_risk_scores(barangays):
    max_cases = max([item["total_cases"] for item in barangays] or [1])
    max_density = max([item["density"] for item in barangays] or [1])

    if max_cases <= 0:
        max_cases = 1

    if max_density <= 0:
        max_density = 1

    scored = []

    for item in barangays:
        cases_score = _clamp((item["total_cases"] / max_cases) * 100)
        density_score = _clamp((item["density"] / max_density) * 100)
        rainfall_score = _rainfall_pressure(item["average_rainfall"])
        temperature_score = _temperature_suitability(item["average_temperature"])
        humidity_score = _humidity_pressure(item["average_humidity"])

        base_score = (
            cases_score * 0.35
            + rainfall_score * 0.20
            + temperature_score * 0.15
            + humidity_score * 0.10
            + density_score * 0.20
        )

        scored.append(
            {
                **item,
                "base_risk_score": round(base_score, 2),
                "base_score_breakdown": {
                    "case_pressure": round(cases_score, 2),
                    "rainfall_pressure": round(rainfall_score, 2),
                    "temperature_suitability": round(temperature_score, 2),
                    "humidity_pressure": round(humidity_score, 2),
                    "population_density_pressure": round(density_score, 2),
                },
            }
        )

    return scored


def _weighted_neighbor_average(neighbors):
    if not neighbors:
        return 0

    total_weight = 0
    total_score = 0

    for neighbor in neighbors:
        distance = max(_to_number(neighbor.get("distance_km"), 0.1), 0.1)
        weight = 1 / distance

        total_weight += weight
        total_score += neighbor["base_risk_score"] * weight

    if total_weight <= 0:
        return 0

    return total_score / total_weight


def _classify_hotspot(score, has_centroid):
    if not has_centroid:
        return "Needs Map Review"

    if score >= 75:
        return "Confirmed Hotspot"

    if score >= 60:
        return "Emerging Hotspot"

    if score >= 45:
        return "Watch Area"

    return "Low Spatial Concern"


def _build_reason(item, influence_barangays, hotspot_score, has_centroid, influence_source="within_radius"):
    if not has_centroid:
        return (
            "This barangay has dengue records, but it could not be matched to a map boundary. "
            "Fix the barangay name first so the system can calculate spatial hotspot influence."
        )

    high_influence_barangays = [
        barangay
        for barangay in influence_barangays
        if barangay.get("base_risk_score", 0) >= 60
    ]

    if influence_source == "nearest_fallback":
        if hotspot_score >= 75:
            return (
                "This barangay has high local risk. No barangay was found inside the selected radius, "
                "so the system used the closest available barangay or barangays only as fallback spatial context."
            )

        if hotspot_score >= 60:
            return (
                "This barangay shows elevated local risk. No barangay was found inside the selected radius, "
                "so the closest available barangay or barangays were used only as fallback spatial context."
            )

        if high_influence_barangays:
            return (
                "This barangay has at least one high-risk closest available barangay, but it is outside the selected radius. "
                "Review the distance before treating it as a direct neighboring hotspot influence."
            )

        return (
            "This barangay has lower spatial hotspot pressure based on current uploaded data. "
            "No barangay was found inside the selected radius, so nearest fallback context was used."
        )

    if hotspot_score >= 75:
        return (
            "This barangay has high local risk and has elevated-risk barangay influence within the selected radius. "
            "It should be treated as a priority hotspot for immediate field response."
        )

    if hotspot_score >= 60:
        return (
            "This barangay shows elevated risk and spatial influence from barangays within the selected radius. "
            "It should be monitored closely and included in targeted prevention activities."
        )

    if high_influence_barangays:
        return (
            "This barangay is not the highest-risk area by itself, but it has elevated-risk barangays within the selected radius. "
            "Monitor it because local spatial transmission pressure may affect it."
        )

    return (
        "This barangay has lower spatial hotspot pressure based on current uploaded data. "
        "Continue routine surveillance and update the analysis when new dengue records arrive."
    )


def _recommended_action(level):
    if level == "Confirmed Hotspot":
        return "Prioritize larval source reduction, field validation, community advisories, and focused surveillance."

    if level == "Emerging Hotspot":
        return "Schedule targeted inspection, monitor nearby barangays, and prepare prevention activities."

    if level == "Watch Area":
        return "Keep under observation and review new case reports, especially in nearby barangays."

    if level == "Needs Map Review":
        return "Correct the barangay name or boundary match before using this area in map-based hotspot decisions."

    return "Continue routine monitoring."


def build_geospatial_hotspots(radius_km=3.0, fallback_nearest_count=3):
    radius_km = _clamp(_to_number(radius_km, 3.0), 0.5, 15)
    fallback_nearest_count = int(_clamp(_to_number(fallback_nearest_count, 3), 1, 8))

    merged_source = _get_merged_rows()
    merged_rows = merged_source["rows"]

    if not merged_rows:
        raise HTTPException(
            status_code=400,
            detail="No saved combined dataset rows are available. Upload and combine the source datasets first.",
        )

    boundary_source = _get_boundary_lookup()
    boundary_lookup = boundary_source["lookup"]

    if not boundary_lookup:
        raise HTTPException(
            status_code=400,
            detail="No saved barangay boundary map is available. Upload the boundary GeoJSON first.",
        )

    barangays = _aggregate_merged_rows(merged_rows)

    if not barangays:
        raise HTTPException(
            status_code=400,
            detail="No barangay rows are available for hotspot analysis. Check the saved combined dataset.",
        )

    barangays = _compute_base_risk_scores(barangays)

    for item in barangays:
        boundary_match = boundary_lookup.get(item["barangay_key"])
        centroid = boundary_match.get("centroid") if boundary_match else None

        item["geometry_id"] = boundary_match.get("geometry_id") if boundary_match else None
        item["geometry_type"] = boundary_match.get("geometry_type") if boundary_match else None
        item["centroid_lat"] = round(centroid["lat"], 6) if centroid else None
        item["centroid_lng"] = round(centroid["lng"], 6) if centroid else None
        item["has_map_boundary"] = bool(centroid)

    spatial_barangays = [
        item
        for item in barangays
        if item.get("has_map_boundary")
    ]

    for item in barangays:
        if not item.get("has_map_boundary"):
            item["within_radius_barangays"] = []
            item["nearest_barangays_used"] = []
            item["spatial_influence_barangays"] = []
            item["spatial_influence_source"] = "no_map_boundary"
            item["spatial_influence_note"] = (
                "No map boundary match is available, so spatial hotspot influence cannot be calculated."
            )

            item["nearby_barangays"] = []
            item["nearby_high_risk_barangays"] = []

            item["neighbor_influence_score"] = 0
            item["spatial_concentration_score"] = 0
            item["hotspot_score"] = round(item["base_risk_score"] * 0.60, 2)
            item["hotspot_level"] = _classify_hotspot(item["hotspot_score"], False)
            item["reason"] = _build_reason(
                item,
                [],
                item["hotspot_score"],
                False,
                "no_map_boundary",
            )
            item["recommended_map_action"] = _recommended_action(item["hotspot_level"])
            continue

        distances = []

        for other in spatial_barangays:
            if other["barangay_key"] == item["barangay_key"]:
                continue

            distance = _haversine_km(
                item["centroid_lat"],
                item["centroid_lng"],
                other["centroid_lat"],
                other["centroid_lng"],
            )

            distances.append(
                {
                    "barangay": other["barangay"],
                    "barangay_key": other["barangay_key"],
                    "distance_km": round(distance, 3),
                    "base_risk_score": other["base_risk_score"],
                    "total_cases": other["total_cases"],
                }
            )

        distances.sort(key=lambda row: row["distance_km"])

        within_radius = [
            row
            for row in distances
            if row["distance_km"] <= radius_km
        ]

        nearest_fallback = []
        influence_source = "within_radius"

        if within_radius:
            influence_barangays = within_radius
            influence_note = (
                f"Spatial influence was calculated using barangays within {radius_km:g} km."
            )
        else:
            nearest_fallback = distances[:fallback_nearest_count]
            influence_barangays = nearest_fallback
            influence_source = "nearest_fallback"
            influence_note = (
                f"No barangay was found within {radius_km:g} km. "
                f"The closest {len(nearest_fallback)} barangay or barangays were used only as fallback spatial context."
            )

        neighbor_score = _weighted_neighbor_average(influence_barangays)

        high_risk_within_radius = [
            row
            for row in within_radius
            if row["base_risk_score"] >= 60
        ]

        high_risk_influence_barangays = [
            row
            for row in influence_barangays
            if row["base_risk_score"] >= 60
        ]

        spatial_concentration = 0

        if influence_barangays:
            high_neighbor_ratio = len(high_risk_influence_barangays) / len(influence_barangays)
            spatial_concentration = (
                high_neighbor_ratio * 60
                + neighbor_score * 0.40
            )

        hotspot_score = (
            item["base_risk_score"] * 0.60
            + neighbor_score * 0.25
            + spatial_concentration * 0.15
        )

        hotspot_score = round(_clamp(hotspot_score), 2)
        hotspot_level = _classify_hotspot(hotspot_score, True)

        item["within_radius_barangays"] = within_radius
        item["nearest_barangays_used"] = nearest_fallback
        item["spatial_influence_barangays"] = influence_barangays
        item["spatial_influence_source"] = influence_source
        item["spatial_influence_note"] = influence_note

        item["nearby_barangays"] = within_radius
        item["nearby_high_risk_barangays"] = high_risk_within_radius

        item["neighbor_influence_score"] = round(neighbor_score, 2)
        item["spatial_concentration_score"] = round(_clamp(spatial_concentration), 2)
        item["hotspot_score"] = hotspot_score
        item["hotspot_level"] = hotspot_level
        item["reason"] = _build_reason(
            item,
            influence_barangays,
            hotspot_score,
            True,
            influence_source,
        )
        item["recommended_map_action"] = _recommended_action(item["hotspot_level"])

    barangays.sort(
        key=lambda row: (
            row.get("hotspot_score", 0),
            row.get("base_risk_score", 0),
            row.get("total_cases", 0),
        ),
        reverse=True,
    )

    level_counts = {}

    for item in barangays:
        level = item.get("hotspot_level", "Unknown")
        level_counts[level] = level_counts.get(level, 0) + 1

    return {
        "message": "Geospatial hotspot analysis completed successfully.",
        "method": "Database-backed neighborhood-based spatial hotspot scoring",
        "data_source": merged_source["source"],
        "integration_run_id": merged_source["integration_run_id"],
        "boundary_source": boundary_source["source"],
        "boundary_upload_id": boundary_source["upload_id"],
        "formula": {
            "hotspot_score": "60% barangay risk + 25% spatial influence + 15% spatial concentration",
            "spatial_influence_rule": (
                "Use barangays within the selected radius. If none are found, use the nearest barangays only as fallback spatial context and label them separately."
            ),
            "barangay_risk_inputs": [
                "dengue cases",
                "rainfall",
                "temperature",
                "humidity",
                "population density",
            ],
        },
        "parameters": {
            "neighbor_radius_km": radius_km,
            "fallback_nearest_count": fallback_nearest_count,
        },
        "summary": {
            "barangay_count": len(barangays),
            "barangays_with_map_boundary": len(spatial_barangays),
            "barangays_needing_map_review": len(barangays) - len(spatial_barangays),
            "barangays_within_radius_matches": len(
                [
                    item
                    for item in barangays
                    if len(item.get("within_radius_barangays", [])) > 0
                ]
            ),
            "barangays_using_nearest_fallback": len(
                [
                    item
                    for item in barangays
                    if item.get("spatial_influence_source") == "nearest_fallback"
                ]
            ),
            "level_counts": level_counts,
        },
        "hotspots": barangays,
    }