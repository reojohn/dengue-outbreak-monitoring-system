from collections import defaultdict
from math import cos, radians

import pandas as pd
from fastapi import HTTPException

from app.services.barangay_name_resolver import (
    build_barangay_reference,
    get_boundary_barangay_name,
    get_record_barangay_name,
    get_record_psgc,
    resolve_barangay_name,
)
from app.services.barangay_normalizer import normalize_barangay_key
from app.services.file_inspector import make_json_safe_records
from app.services.integration_state import (
    build_source_status_summary,
    get_all_integration_sources,
)
from app.services.database_integration import save_integration_result

MERGED_DATASET_COLUMNS = [
    "barangay",
    "barangay_key",
    "barangay_original",
    "barangay_original_key",
    "barangay_match_status",
    "barangay_match_confidence",
    "barangay_match_note",
    "period",
    "date",
    "year",
    "month",
    "week",
    "cases",
    "deaths",
    "rainfall",
    "temperature",
    "humidity",
    "population",
    "population_year",
    "density",
    "boundary_area_sqkm",
    "geometry_id",
    "boundary_match_status",
    "population_match_status",
    "weather_match_status",
]


BARANGAY_MATCHED_STATUSES = {
    "psgc_matched",
    "exact_matched",
    "auto_matched",
}


def _safe_text(value):
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    text = str(value).strip()

    if text.lower() in ["", "nan", "none", "nat", "null"]:
        return ""

    return text


def _to_number(value, fallback=0):
    if value is None:
        return fallback

    try:
        if pd.isna(value):
            return fallback
    except Exception:
        pass

    if isinstance(value, str):
        value = value.replace(",", "").strip()

        if value == "":
            return fallback

    try:
        number = float(value)
    except Exception:
        return fallback

    return number if pd.notna(number) else fallback


def _to_int_or_none(value):
    number = _to_number(value, fallback=None)

    if number is None:
        return None

    return int(number)


def _round_or_none(value, places=3):
    number = _to_number(value, fallback=None)

    if number is None:
        return None

    return round(number, places)


def _record_key(record):
    return normalize_barangay_key(
        record.get("barangay_key")
        or record.get("barangay")
        or record.get("barangay_raw")
        or record.get("barangay_name")
        or record.get("name")
        or ""
    )


def _resolve_cache_key(record):
    record = record or {}
    return (
        _safe_text(record.get("psgc") or record.get("PSGC") or record.get("adm4_pcode") or record.get("ADM4_PCODE")),
        normalize_barangay_key(record.get("barangay_key") or ""),
        normalize_barangay_key(
            record.get("barangay")
            or record.get("barangay_raw")
            or record.get("barangay_name")
            or record.get("name")
            or record.get("adm4_name")
            or record.get("adm4_ref_name")
            or record.get("BARANGAY")
            or record.get("ADM4_NAME")
            or record.get("ADM4_EN")
            or ""
        ),
    )


def _resolve_barangay_cached(record, barangay_reference, cache):
    cache_key = _resolve_cache_key(record)

    if cache_key in cache:
        return cache[cache_key]

    resolved = resolve_barangay_name(record, barangay_reference)
    cache[cache_key] = resolved
    return resolved


def _safe_date(value):
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    text = str(value).strip()
    return text if text.lower() not in ["", "nan", "none", "nat"] else ""


def _period_from_record(record):
    period = _safe_date(record.get("period"))

    if period:
        return period

    date = _safe_date(record.get("date"))

    if date:
        return date

    year = _to_int_or_none(record.get("year"))
    month = _to_int_or_none(record.get("month"))
    week = _to_int_or_none(record.get("week"))

    if year and month:
        return f"{year}-{month:02d}"

    if year and week:
        return f"{year}-W{week:02d}"

    return ""


def _extract_ring_coordinates(ring):
    coordinates = []

    if not isinstance(ring, list):
        return coordinates

    for point in ring:
        if not isinstance(point, list) or len(point) < 2:
            continue

        lon = _to_number(point[0], fallback=None)
        lat = _to_number(point[1], fallback=None)

        if lon is None or lat is None:
            continue

        coordinates.append((lon, lat))

    return coordinates


def _ring_area_sq_km(ring):
    coordinates = _extract_ring_coordinates(ring)

    if len(coordinates) < 3:
        return 0

    mean_latitude = sum(lat for _, lat in coordinates) / len(coordinates)
    km_per_degree_lon = 111.320 * cos(radians(mean_latitude))
    km_per_degree_lat = 110.574

    projected = [
        (lon * km_per_degree_lon, lat * km_per_degree_lat)
        for lon, lat in coordinates
    ]

    area = 0

    for index, (x1, y1) in enumerate(projected):
        x2, y2 = projected[(index + 1) % len(projected)]
        area += (x1 * y2) - (x2 * y1)

    return abs(area) / 2


def _polygon_area_sq_km(polygon_coordinates):
    if not isinstance(polygon_coordinates, list) or not polygon_coordinates:
        return 0

    outer_area = _ring_area_sq_km(polygon_coordinates[0])
    hole_area = sum(_ring_area_sq_km(ring) for ring in polygon_coordinates[1:])

    return max(outer_area - hole_area, 0)


def _geometry_area_sq_km(geometry):
    if not isinstance(geometry, dict):
        return 0

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if geometry_type == "Polygon":
        return _polygon_area_sq_km(coordinates)

    if geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        return sum(_polygon_area_sq_km(polygon) for polygon in coordinates)

    return 0


def _build_population_lookup(population_records, barangay_reference, resolve_cache=None):
    lookup = {}
    resolve_cache = resolve_cache if resolve_cache is not None else {}

    for record in population_records:
        resolved = _resolve_barangay_cached(record, barangay_reference, resolve_cache)
        key = resolved.get("barangay_key") or _record_key(record)

        if not key:
            continue

        candidate = {
            "barangay": resolved.get("barangay") or get_record_barangay_name(record),
            "barangay_original": get_record_barangay_name(record),
            "barangay_match_status": resolved.get("match_status"),
            "barangay_match_confidence": resolved.get("match_confidence"),
            "population": _to_int_or_none(record.get("population")),
            "population_year": _to_int_or_none(record.get("year")),
            "psgc": get_record_psgc(record),
        }

        current = lookup.get(key)

        if not current:
            lookup[key] = candidate
            continue

        current_year = current.get("population_year") or 0
        candidate_year = candidate.get("population_year") or 0

        if candidate_year >= current_year:
            lookup[key] = candidate

    return lookup


def _build_boundary_lookup(boundary_geojson):
    lookup = {}

    features = []

    if isinstance(boundary_geojson, dict):
        features = boundary_geojson.get("features") or []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties") or {}
        barangay_name = get_boundary_barangay_name(properties)
        key = normalize_barangay_key(
            properties.get("barangay_key")
            or barangay_name
            or ""
        )

        if not key:
            continue

        geometry = feature.get("geometry") or {}
        area_sqkm = _geometry_area_sq_km(geometry)
        geometry_id = (
            feature.get("id")
            or properties.get("psgc")
            or properties.get("PSGC")
            or properties.get("adm4_pcode")
            or properties.get("ADM4_PCODE")
            or f"boundary-{index}"
        )

        lookup[key] = {
            "geometry_id": str(geometry_id),
            "barangay": barangay_name,
            "psgc": properties.get("psgc") or properties.get("PSGC") or "",
            "boundary_area_sqkm": round(area_sqkm, 4) if area_sqkm else None,
            "geometry_type": geometry.get("type") or "",
        }

    return lookup


def _build_weather_context(weather_records):
    by_date = {}
    by_month_values = defaultdict(lambda: {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    })
    overall_values = {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    }

    for record in weather_records:
        date = _safe_date(
            record.get("reporting_date")
            or record.get("reportingDate")
            or record.get("date")
        )
        year = _to_int_or_none(record.get("year"))
        month = _to_int_or_none(record.get("month"))
        rainfall = _round_or_none(record.get("rainfall"))
        temperature = _round_or_none(record.get("temperature"))
        humidity = _round_or_none(record.get("humidity"))

        weather_row = {
            "rainfall": rainfall,
            "temperature": temperature,
            "humidity": humidity,
        }

        if date:
            by_date[date] = weather_row

        if year and month:
            month_key = (year, month)

            for field in ["rainfall", "temperature", "humidity"]:
                if weather_row[field] is not None:
                    by_month_values[month_key][field].append(weather_row[field])

        for field in ["rainfall", "temperature", "humidity"]:
            if weather_row[field] is not None:
                overall_values[field].append(weather_row[field])

    by_month = {}

    for month_key, values in by_month_values.items():
        by_month[month_key] = {
            field: round(sum(field_values) / len(field_values), 3) if field_values else None
            for field, field_values in values.items()
        }

    overall = {
        field: round(sum(field_values) / len(field_values), 3) if field_values else None
        for field, field_values in overall_values.items()
    }

    return {
        "by_date": by_date,
        "by_month": by_month,
        "overall": overall,
    }


def _select_weather_for_dengue_record(record, weather_context):
    date = _safe_date(record.get("date"))
    year = _to_int_or_none(record.get("year"))
    month = _to_int_or_none(record.get("month"))

    if date and date in weather_context["by_date"]:
        return {
            **weather_context["by_date"][date],
            "weather_match_status": "exact_date",
        }

    if year and month and (year, month) in weather_context["by_month"]:
        return {
            **weather_context["by_month"][(year, month)],
            "weather_match_status": "monthly_average",
        }

    if any(value is not None for value in weather_context["overall"].values()):
        return {
            **weather_context["overall"],
            "weather_match_status": "overall_average",
        }

    return {
        "rainfall": None,
        "temperature": None,
        "humidity": None,
        "weather_match_status": "unavailable",
    }


def _summarize_matches(rows):
    total = len(rows)

    def count_match(field, matched_values):
        return sum(1 for row in rows if row.get(field) in matched_values)

    return {
        "row_count": total,
        "weather_matched_rows": count_match(
            "weather_match_status",
            {"exact_date", "monthly_average", "overall_average"},
        ),
        "population_matched_rows": count_match(
            "population_match_status",
            {"matched"},
        ),
        "boundary_matched_rows": count_match(
            "boundary_match_status",
            {"matched"},
        ),
        "barangay_exact_matched_rows": count_match(
            "barangay_match_status",
            {"psgc_matched", "exact_matched"},
        ),
        "barangay_auto_matched_rows": count_match(
            "barangay_match_status",
            {"auto_matched"},
        ),
        "barangay_needs_review_rows": count_match(
            "barangay_match_status",
            {"needs_review", "unmatched"},
        ),
        "unique_barangay_count": len({row.get("barangay_key") for row in rows if row.get("barangay_key")}),
    }


def build_model_ready_dataset():
    sources = get_all_integration_sources()
    status = build_source_status_summary()

    dengue_source = sources.get("dengue")

    if not dengue_source or not dengue_source.get("records"):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "A backend-cleaned dengue dataset is required before building the model-ready dataset.",
                "integration_status": status,
            },
        )

    dengue_records = dengue_source.get("records") or []
    weather_records = (sources.get("weather") or {}).get("records") or []
    population_records = (sources.get("population") or {}).get("records") or []
    boundary_geojson = (sources.get("boundary") or {}).get("geojson") or {}

    barangay_reference = build_barangay_reference(
        boundary_geojson=boundary_geojson,
        population_records=population_records,
    )
    resolve_cache = {}
    population_lookup = _build_population_lookup(population_records, barangay_reference, resolve_cache)
    boundary_lookup = _build_boundary_lookup(boundary_geojson)
    weather_context = _build_weather_context(weather_records)

    merged_rows = []

    for record in dengue_records:
        resolved_barangay = _resolve_barangay_cached(record, barangay_reference, resolve_cache)
        barangay = resolved_barangay.get("barangay") or get_record_barangay_name(record)
        barangay_key = resolved_barangay.get("barangay_key") or _record_key(record)
        period = _period_from_record(record)

        population_match = population_lookup.get(barangay_key)
        boundary_match = boundary_lookup.get(barangay_key)
        weather_match = _select_weather_for_dengue_record(record, weather_context)

        population = population_match.get("population") if population_match else None
        boundary_area = boundary_match.get("boundary_area_sqkm") if boundary_match else None
        density = None

        if population and boundary_area:
            density = round(population / boundary_area, 3)

        row = {
            "barangay": barangay,
            "barangay_key": barangay_key,
            "barangay_original": resolved_barangay.get("original_barangay") or get_record_barangay_name(record),
            "barangay_original_key": resolved_barangay.get("original_barangay_key") or _record_key(record),
            "barangay_match_status": resolved_barangay.get("match_status"),
            "barangay_match_confidence": round(_to_number(resolved_barangay.get("match_confidence"), 0), 3),
            "barangay_match_note": resolved_barangay.get("match_note"),
            "period": period,
            "date": _safe_date(record.get("date")),
            "year": _to_int_or_none(record.get("year")),
            "month": _to_int_or_none(record.get("month")),
            "week": _to_int_or_none(record.get("week")),
            "cases": _to_int_or_none(record.get("cases")) or 0,
            "deaths": _to_int_or_none(record.get("deaths")) or 0,
            "rainfall": weather_match.get("rainfall"),
            "temperature": weather_match.get("temperature"),
            "humidity": weather_match.get("humidity"),
            "population": population,
            "population_year": population_match.get("population_year") if population_match else None,
            "density": density,
            "boundary_area_sqkm": boundary_area,
            "geometry_id": boundary_match.get("geometry_id") if boundary_match else None,
            "boundary_match_status": "matched" if boundary_match else "unmatched",
            "population_match_status": "matched" if population_match else "unmatched",
            "weather_match_status": weather_match.get("weather_match_status"),
        }

        merged_rows.append(row)

    merged_df = pd.DataFrame(merged_rows, columns=MERGED_DATASET_COLUMNS)
    merged_dataset = make_json_safe_records(merged_df)
    merged_preview = make_json_safe_records(merged_df.head(25))
    summary = _summarize_matches(merged_rows)

    database_result = save_integration_result(
        integration_status=status,
        summary=summary,
        merged_rows=merged_dataset,
    )

    return {
        "message": "Model-ready multi-source dataset built successfully and saved to Supabase.",
        "integration_status": status,
        "standard_columns": MERGED_DATASET_COLUMNS,
        "row_count": int(len(merged_df)),
        "summary": summary,
        "barangay_reference_count": len(barangay_reference.get("items", [])),
        # Keep the full dataset saved in Supabase, but avoid sending thousands of rows
        # back to the browser. This makes the Upload page much faster and prevents
        # crashes on large historical files.
      "merged_dataset": merged_preview,
"merged_preview": merged_preview,
        "database_integration": database_result,
        "database_integration_run_id": database_result.get("integration_run_id"),
        "database_saved_row_count": database_result.get("saved_row_count"),
    }