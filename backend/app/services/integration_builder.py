from collections import Counter, defaultdict
from datetime import date, datetime
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

WEATHER_MATCHED_STATUSES = {
    "exact_date",
    "weekly_average",
    "monthly_average",
    "calendar_month_average",
    "overall_average",
}


TEXT_MISSING_VALUES = {"", "nan", "none", "nat", "null", "n/a", "na", "-"}


def _normalize_field_name(value=""):
    return "".join(char for char in str(value).lower() if char.isalnum())


def _normalized_lookup(source):
    source = source or {}
    if not isinstance(source, dict):
        return {}

    return {
        _normalize_field_name(key): value
        for key, value in source.items()
    }


def _read_value(source, keys=None, fallback=None):
    source = source or {}
    keys = keys or []

    if not isinstance(source, dict):
        return fallback

    for key in keys:
        if key in source and source[key] not in [None, ""]:
            return source[key]

    lookup = _normalized_lookup(source)

    for key in keys:
        normalized_key = _normalize_field_name(key)
        if normalized_key in lookup and lookup[normalized_key] not in [None, ""]:
            return lookup[normalized_key]

    return fallback


def _safe_text(value):
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    text = str(value).strip()

    if text.lower() in TEXT_MISSING_VALUES:
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

        if value.lower() in TEXT_MISSING_VALUES:
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

    return int(round(number))


def _round_or_none(value, places=3):
    number = _to_number(value, fallback=None)

    if number is None:
        return None

    return round(number, places)


def _record_key(record):
    return normalize_barangay_key(
        _read_value(
            record,
            [
                "barangay_key",
                "barangay",
                "barangay_raw",
                "barangay_name",
                "barangayName",
                "brgy",
                "brgy_name",
                "location",
                "area",
                "name",
            ],
            "",
        )
    )


def _resolve_cache_key(record):
    record = record or {}
    return (
        _safe_text(
            _read_value(
                record,
                [
                    "psgc",
                    "PSGC",
                    "code",
                    "barangay_code",
                    "barangayCode",
                    "adm4_pcode",
                    "ADM4_PCODE",
                    "pcode",
                    "PCODE",
                    "geocode",
                    "geo_code",
                ],
            )
        ),
        normalize_barangay_key(_read_value(record, ["barangay_key", "barangayKey"], "")),
        normalize_barangay_key(
            _read_value(
                record,
                [
                    "barangay",
                    "barangay_raw",
                    "barangay_name",
                    "barangayName",
                    "brgy",
                    "brgy_name",
                    "location",
                    "area",
                    "name",
                    "adm4_name",
                    "adm4_ref_name",
                    "BARANGAY",
                    "ADM4_NAME",
                    "ADM4_EN",
                ],
                "",
            )
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
    text = _safe_text(value)
    return text


def _parse_datetime(value):
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)

    text = _safe_text(value)

    if not text:
        return None

    # Treat epidemiological week labels separately; pandas may parse them oddly.
    if "W" in text.upper() and any(char.isdigit() for char in text):
        return None

    for kwargs in ({}, {"dayfirst": True}):
        try:
            parsed = pd.to_datetime(text, errors="coerce", **kwargs)
        except Exception:
            parsed = None

        if parsed is not None and not pd.isna(parsed):
            return parsed.to_pydatetime()

    return None


def _date_key(value):
    parsed = _parse_datetime(value)

    if not parsed:
        return ""

    return parsed.date().isoformat()


def _extract_year_month_week_from_date(value):
    parsed = _parse_datetime(value)

    if not parsed:
        return None, None, None

    iso_calendar = parsed.isocalendar()

    return parsed.year, parsed.month, int(iso_calendar.week)


def _read_year_month_week(record):
    date_value = _read_value(
        record,
        [
            "date",
            "reporting_date",
            "reportingDate",
            "case_date",
            "caseDate",
            "period",
            "observation_date",
            "observationDate",
        ],
    )

    date_year, date_month, date_week = _extract_year_month_week_from_date(date_value)

    year = _to_int_or_none(
        _read_value(
            record,
            [
                "year",
                "reportingYear",
                "reporting_year",
                "morbidity_year",
                "morbidityYear",
                "case_year",
            ],
        )
    ) or date_year

    month = _to_int_or_none(
        _read_value(
            record,
            [
                "month",
                "reportingMonth",
                "reporting_month",
                "morbidity_month",
                "morbidityMonth",
                "case_month",
            ],
        )
    ) or date_month

    week = _to_int_or_none(
        _read_value(
            record,
            [
                "week",
                "epi_week",
                "epiWeek",
                "epidemiological_week",
                "epidemiologicalWeek",
                "morbidity_week",
                "morbidityWeek",
                "week_number",
                "weekNumber",
            ],
        )
    ) or date_week

    return year, month, week


def _period_from_record(record):
    period = _safe_date(_read_value(record, ["period", "reporting_period", "reportingPeriod"]))

    if period:
        return period

    date_text = _safe_date(
        _read_value(
            record,
            ["date", "reporting_date", "reportingDate", "case_date", "caseDate"],
        )
    )

    date_key = _date_key(date_text)

    if date_key:
        return date_key

    if date_text:
        return date_text

    year, month, week = _read_year_month_week(record)

    if year and week:
        return f"{year}-W{week:02d}"

    if year and month:
        return f"{year}-{month:02d}"

    return ""


def _extract_ring_coordinates(ring):
    coordinates = []

    if not isinstance(ring, list):
        return coordinates

    for point in ring:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
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


def _get_population_value(record):
    return _to_int_or_none(
        _read_value(
            record,
            [
                "population",
                "total_population",
                "totalPopulation",
                "population_count",
                "populationCount",
                "pop",
                "total_pop",
                "totalPop",
                "residents",
                "household_population",
                "householdPopulation",
            ],
        )
    )


def _get_area_value(source):
    return _round_or_none(
        _read_value(
            source,
            [
                "area_sqkm",
                "areaSqKm",
                "area_sq_km",
                "area",
                "areaKm2",
                "area_km2",
                "sqkm",
                "boundary_area_sqkm",
                "boundaryAreaSqKm",
                "land_area",
                "landArea",
            ],
        ),
        4,
    )


def _get_psgc_value(record):
    return _safe_text(
        _read_value(
            record,
            [
                "psgc",
                "PSGC",
                "code",
                "barangay_code",
                "barangayCode",
                "adm4_pcode",
                "ADM4_PCODE",
                "pcode",
                "PCODE",
                "geocode",
                "geo_code",
            ],
        )
    ) or get_record_psgc(record)


def _build_population_lookup(population_records, barangay_reference, resolve_cache=None):
    by_key = {}
    by_psgc = {}
    resolve_cache = resolve_cache if resolve_cache is not None else {}

    for record in population_records:
        resolved = _resolve_barangay_cached(record, barangay_reference, resolve_cache)
        key = resolved.get("barangay_key") or _record_key(record)
        raw_key = _record_key(record)
        psgc = _get_psgc_value(record)

        if not key and not psgc:
            continue

        candidate = {
            "barangay": resolved.get("barangay") or get_record_barangay_name(record),
            "barangay_original": get_record_barangay_name(record),
            "barangay_key": key,
            "barangay_original_key": raw_key,
            "barangay_match_status": resolved.get("match_status"),
            "barangay_match_confidence": resolved.get("match_confidence"),
            "population": _get_population_value(record),
            "population_year": _to_int_or_none(_read_value(record, ["year", "census_year", "censusYear", "population_year", "populationYear"])),
            "psgc": psgc,
        }

        def keep_newer(existing):
            if not existing:
                return True
            return (candidate.get("population_year") or 0) >= (existing.get("population_year") or 0)

        for lookup_key in {key, raw_key}:
            if lookup_key and keep_newer(by_key.get(lookup_key)):
                by_key[lookup_key] = candidate

        if psgc and keep_newer(by_psgc.get(psgc)):
            by_psgc[psgc] = candidate

    return {
        "by_key": by_key,
        "by_psgc": by_psgc,
    }


def _select_population_match(record, barangay_key, population_lookup):
    population_lookup = population_lookup or {"by_key": {}, "by_psgc": {}}
    by_key = population_lookup.get("by_key") or {}
    by_psgc = population_lookup.get("by_psgc") or {}

    psgc = _get_psgc_value(record)

    if psgc and psgc in by_psgc:
        return {
            **by_psgc[psgc],
            "population_match_status": "psgc_matched",
        }

    for key in [barangay_key, _record_key(record)]:
        if key and key in by_key:
            return {
                **by_key[key],
                "population_match_status": "matched",
            }

    return None


def _build_boundary_lookup(boundary_geojson):
    by_key = {}
    by_psgc = {}
    features = []

    if isinstance(boundary_geojson, dict):
        features = boundary_geojson.get("features") or []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties") or {}
        barangay_name = get_boundary_barangay_name(properties) or _safe_text(
            _read_value(
                properties,
                [
                    "barangay",
                    "barangay_raw",
                    "barangay_name",
                    "barangayName",
                    "brgy",
                    "brgy_name",
                    "name",
                    "adm4_name",
                    "adm4_ref_name",
                    "BARANGAY",
                    "ADM4_NAME",
                    "ADM4_EN",
                ],
            )
        )
        key = normalize_barangay_key(
            _read_value(properties, ["barangay_key", "barangayKey"], "")
            or barangay_name
            or ""
        )

        if not key:
            continue

        geometry = feature.get("geometry") or {}
        area_sqkm = _get_area_value(properties) or _geometry_area_sq_km(geometry)
        psgc = _get_psgc_value(properties)
        geometry_id = (
            feature.get("id")
            or psgc
            or _read_value(properties, ["id", "ID", "objectid", "OBJECTID"])
            or f"boundary-{index}"
        )

        candidate = {
            "geometry_id": str(geometry_id),
            "barangay": barangay_name,
            "barangay_key": key,
            "psgc": psgc,
            "boundary_area_sqkm": round(area_sqkm, 4) if area_sqkm else None,
            "geometry_type": geometry.get("type") or "",
        }

        by_key[key] = candidate

        if psgc:
            by_psgc[psgc] = candidate

    return {
        "by_key": by_key,
        "by_psgc": by_psgc,
    }


def _select_boundary_match(record, barangay_key, boundary_lookup):
    boundary_lookup = boundary_lookup or {"by_key": {}, "by_psgc": {}}
    by_key = boundary_lookup.get("by_key") or {}
    by_psgc = boundary_lookup.get("by_psgc") or {}
    psgc = _get_psgc_value(record)

    if psgc and psgc in by_psgc:
        return {
            **by_psgc[psgc],
            "boundary_match_status": "psgc_matched",
        }

    for key in [barangay_key, _record_key(record)]:
        if key and key in by_key:
            return {
                **by_key[key],
                "boundary_match_status": "matched",
            }

    return None


def _average_field_rows(rows):
    rows = rows or []
    result = {}

    for field in ["rainfall", "temperature", "humidity"]:
        values = [row.get(field) for row in rows if row.get(field) is not None]
        result[field] = round(sum(values) / len(values), 3) if values else None

    return result


def _append_weather_values(target, key, weather_row):
    if key is None:
        return

    for field in ["rainfall", "temperature", "humidity"]:
        value = weather_row.get(field)
        if value is not None:
            target[key][field].append(value)


def _build_weather_context(weather_records):
    by_date_values = defaultdict(lambda: {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    })
    by_week_values = defaultdict(lambda: {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    })
    by_month_values = defaultdict(lambda: {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    })
    by_calendar_month_values = defaultdict(lambda: {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    })
    overall_values = {
        "rainfall": [],
        "temperature": [],
        "humidity": [],
    }

    date_keys = []

    for record in weather_records:
        raw_date = _read_value(
            record,
            [
                "reporting_date",
                "reportingDate",
                "date",
                "weather_date",
                "weatherDate",
                "observation_date",
                "observationDate",
            ],
        )
        date_key = _date_key(raw_date)
        year, month, week = _read_year_month_week(record)

        if date_key and (not year or not month or not week):
            date_year, date_month, date_week = _extract_year_month_week_from_date(date_key)
            year = year or date_year
            month = month or date_month
            week = week or date_week

        rainfall = _round_or_none(
            _read_value(
                record,
                [
                    "rainfall",
                    "rainfall_mm",
                    "rainfallMm",
                    "rain",
                    "rain_mm",
                    "precipitation",
                    "precipitation_mm",
                    "precip",
                    "prectotcorr",
                ],
            )
        )
        temperature = _round_or_none(
            _read_value(
                record,
                [
                    "temperature",
                    "temperature_c",
                    "temperatureC",
                    "temp",
                    "temp_c",
                    "air_temperature",
                    "airTemperature",
                    "t2m",
                ],
            )
        )
        humidity = _round_or_none(
            _read_value(
                record,
                [
                    "humidity",
                    "relative_humidity",
                    "relativeHumidity",
                    "humidity_percent",
                    "rh",
                    "rh2m",
                ],
            )
        )

        weather_row = {
            "rainfall": rainfall,
            "temperature": temperature,
            "humidity": humidity,
        }

        if not any(value is not None for value in weather_row.values()):
            continue

        if date_key:
            _append_weather_values(by_date_values, date_key, weather_row)
            date_keys.append(date_key)

        if year and week:
            _append_weather_values(by_week_values, (year, week), weather_row)

        if year and month:
            _append_weather_values(by_month_values, (year, month), weather_row)

        if month:
            _append_weather_values(by_calendar_month_values, month, weather_row)

        for field in ["rainfall", "temperature", "humidity"]:
            if weather_row[field] is not None:
                overall_values[field].append(weather_row[field])

    def average_grouped_values(grouped_values):
        return {
            key: {
                field: round(sum(values[field]) / len(values[field]), 3) if values[field] else None
                for field in ["rainfall", "temperature", "humidity"]
            }
            for key, values in grouped_values.items()
        }

    overall = {
        field: round(sum(field_values) / len(field_values), 3) if field_values else None
        for field, field_values in overall_values.items()
    }

    return {
        "by_date": average_grouped_values(by_date_values),
        "by_week": average_grouped_values(by_week_values),
        "by_month": average_grouped_values(by_month_values),
        "by_calendar_month": average_grouped_values(by_calendar_month_values),
        "overall": overall,
        "coverage_start": min(date_keys) if date_keys else "",
        "coverage_end": max(date_keys) if date_keys else "",
    }


def _select_weather_for_dengue_record(record, weather_context):
    raw_date = _read_value(
        record,
        ["date", "reporting_date", "reportingDate", "case_date", "caseDate"],
    )
    date_key = _date_key(raw_date)
    year, month, week = _read_year_month_week(record)

    if date_key and date_key in weather_context["by_date"]:
        return {
            **weather_context["by_date"][date_key],
            "weather_match_status": "exact_date",
        }

    if year and week and (year, week) in weather_context["by_week"]:
        return {
            **weather_context["by_week"][(year, week)],
            "weather_match_status": "weekly_average",
        }

    if year and month and (year, month) in weather_context["by_month"]:
        return {
            **weather_context["by_month"][(year, month)],
            "weather_match_status": "monthly_average",
        }

    if month and month in weather_context["by_calendar_month"]:
        return {
            **weather_context["by_calendar_month"][month],
            "weather_match_status": "calendar_month_average",
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


def _status_counts(rows, field):
    counts = Counter(_safe_text(row.get(field)) or "unavailable" for row in rows)
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def _percent(value, total):
    if not total:
        return 0
    return round((value / total) * 100, 2)


def _summarize_matches(rows, *, weather_context=None, source_status=None):
    total = len(rows)

    def count_match(field, matched_values):
        return sum(1 for row in rows if row.get(field) in matched_values)

    weather_matched = count_match("weather_match_status", WEATHER_MATCHED_STATUSES)
    population_matched = count_match("population_match_status", {"matched", "psgc_matched"})
    boundary_matched = count_match("boundary_match_status", {"matched", "psgc_matched"})
    barangay_exact = count_match("barangay_match_status", {"psgc_matched", "exact_matched"})
    barangay_auto = count_match("barangay_match_status", {"auto_matched"})
    barangay_review = count_match("barangay_match_status", {"needs_review", "unmatched"})

    barangays_needing_review = sorted({
        row.get("barangay_original") or row.get("barangay")
        for row in rows
        if row.get("barangay_match_status") in {"needs_review", "unmatched"}
        and (row.get("barangay_original") or row.get("barangay"))
    })

    boundary_unmatched_barangays = sorted({
        row.get("barangay")
        for row in rows
        if row.get("boundary_match_status") == "unmatched" and row.get("barangay")
    })

    population_unmatched_barangays = sorted({
        row.get("barangay")
        for row in rows
        if row.get("population_match_status") == "unmatched" and row.get("barangay")
    })

    weather_unmatched_periods = sorted({
        row.get("period")
        for row in rows
        if row.get("weather_match_status") == "unavailable" and row.get("period")
    })

    match_percentages = {
        "weather": _percent(weather_matched, total),
        "population": _percent(population_matched, total),
        "boundary": _percent(boundary_matched, total),
        "barangay_auto_or_exact": _percent(barangay_exact + barangay_auto, total),
    }

    overall_score = round(
        (
            match_percentages["weather"]
            + match_percentages["population"]
            + match_percentages["boundary"]
            + match_percentages["barangay_auto_or_exact"]
        ) / 4,
        2,
    ) if total else 0

    if overall_score >= 85:
        quality_label = "High integration readiness"
    elif overall_score >= 60:
        quality_label = "Usable with review"
    elif overall_score > 0:
        quality_label = "Needs data review"
    else:
        quality_label = "Insufficient combined data"

    return {
        "row_count": total,
        "weather_matched_rows": weather_matched,
        "population_matched_rows": population_matched,
        "boundary_matched_rows": boundary_matched,
        "barangay_exact_matched_rows": barangay_exact,
        "barangay_auto_matched_rows": barangay_auto,
        "barangay_needs_review_rows": barangay_review,
        "unique_barangay_count": len({row.get("barangay_key") for row in rows if row.get("barangay_key")}),
        "match_percentages": match_percentages,
        "integration_quality_score": overall_score,
        "integration_quality_label": quality_label,
        "weather_match_status_counts": _status_counts(rows, "weather_match_status"),
        "population_match_status_counts": _status_counts(rows, "population_match_status"),
        "boundary_match_status_counts": _status_counts(rows, "boundary_match_status"),
        "barangay_match_status_counts": _status_counts(rows, "barangay_match_status"),
        "barangays_needing_review": barangays_needing_review[:25],
        "boundary_unmatched_barangays": boundary_unmatched_barangays[:25],
        "population_unmatched_barangays": population_unmatched_barangays[:25],
        "weather_unmatched_periods": weather_unmatched_periods[:25],
        "weather_coverage_start": (weather_context or {}).get("coverage_start", ""),
        "weather_coverage_end": (weather_context or {}).get("coverage_end", ""),
        "adaptive_combination": True,
        "combination_method": "adaptive_standard_schema_matching",
        "combination_notes": [
            "Dengue rows were matched to boundary and population data using PSGC/code first, then normalized barangay name, then high-confidence barangay-name resolution.",
            "Weather data was matched by exact date first, then epidemiological week, month, calendar-month average, and overall average fallback.",
            "Rows that cannot be matched are kept in the combined dataset and marked for review instead of stopping the workflow.",
        ],
        "source_status_snapshot": source_status or {},
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

        population_match = _select_population_match(record, barangay_key, population_lookup)
        boundary_match = _select_boundary_match(record, barangay_key, boundary_lookup)
        weather_match = _select_weather_for_dengue_record(record, weather_context)

        population = population_match.get("population") if population_match else None
        boundary_area = boundary_match.get("boundary_area_sqkm") if boundary_match else None
        density = None

        if population and boundary_area:
            density = round(population / boundary_area, 3)

        year, month, week = _read_year_month_week(record)

        row = {
            "barangay": barangay,
            "barangay_key": barangay_key,
            "barangay_original": resolved_barangay.get("original_barangay") or get_record_barangay_name(record),
            "barangay_original_key": resolved_barangay.get("original_barangay_key") or _record_key(record),
            "barangay_match_status": resolved_barangay.get("match_status"),
            "barangay_match_confidence": round(_to_number(resolved_barangay.get("match_confidence"), 0), 3),
            "barangay_match_note": resolved_barangay.get("match_note"),
            "period": period,
            "date": _date_key(_read_value(record, ["date", "reporting_date", "reportingDate", "case_date", "caseDate"])) or _safe_date(_read_value(record, ["date", "reporting_date", "reportingDate"])),
            "year": year,
            "month": month,
            "week": week,
            "cases": _to_int_or_none(_read_value(record, ["cases", "case_count", "caseCount", "dengue_cases", "dengueCases", "confirmed_cases", "confirmedCases", "total_cases", "totalCases"])) or 0,
            "deaths": _to_int_or_none(_read_value(record, ["deaths", "death_count", "deathCount", "dengue_deaths", "dengueDeaths", "fatalities", "fatality_count", "fatalityCount"])) or 0,
            "rainfall": weather_match.get("rainfall"),
            "temperature": weather_match.get("temperature"),
            "humidity": weather_match.get("humidity"),
            "population": population,
            "population_year": population_match.get("population_year") if population_match else None,
            "density": density,
            "boundary_area_sqkm": boundary_area,
            "geometry_id": boundary_match.get("geometry_id") if boundary_match else None,
            "boundary_match_status": boundary_match.get("boundary_match_status") if boundary_match else "unmatched",
            "population_match_status": population_match.get("population_match_status") if population_match else "unmatched",
            "weather_match_status": weather_match.get("weather_match_status"),
        }

        merged_rows.append(row)

    merged_df = pd.DataFrame(merged_rows, columns=MERGED_DATASET_COLUMNS)
    merged_dataset = make_json_safe_records(merged_df)
    merged_preview = make_json_safe_records(merged_df.head(25))
    summary = _summarize_matches(
        merged_rows,
        weather_context=weather_context,
        source_status=status,
    )

    database_result = save_integration_result(
        integration_status=status,
        summary=summary,
        merged_rows=merged_dataset,
    )

    return {
        "message": "Adaptive model-ready multi-source dataset built successfully and saved to Supabase.",
        "integration_status": status,
        "standard_columns": MERGED_DATASET_COLUMNS,
        "row_count": int(len(merged_df)),
        "summary": summary,
        "match_report": summary,
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
