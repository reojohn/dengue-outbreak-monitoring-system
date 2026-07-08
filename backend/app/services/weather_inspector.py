from datetime import datetime, timedelta
from pathlib import Path
import re

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.services.file_inspector import (
    bounded_integer_ratio,
    clean_column_name,
    compact_column_name,
    date_like_ratio,
    month_name_ratio,
    non_empty_sample,
    numeric_ratio,
    numeric_values,
    read_tabular_file,
    text_ratio,
    tokenize_column_name,
    year_like_ratio,
)


WEATHER_FIELD_ALIASES = {
    "date": [
        "date",
        "reporting_date",
        "reported_date",
        "weather_date",
        "observation_date",
        "observed_date",
        "record_date",
        "day_date",
        "datetime",
        "date_time",
        "time",
        "timestamp",
        "valid_date",
        "measurement_date",
        "monitoring_date",
    ],
    "year": [
        "year",
        "yr",
        "weather_year",
        "observation_year",
        "record_year",
        "reference_year",
    ],
    "month": [
        "month",
        "mo",
        "mn",
        "weather_month",
        "observation_month",
        "record_month",
    ],
    "day": [
        "day",
        "dy",
        "date_day",
        "day_of_month",
        "dom",
        "observation_day",
        "record_day",
    ],
    "doy": [
        "doy",
        "day_of_year",
        "julian_day",
        "daynumber",
        "day_number",
        "yearday",
        "year_day",
    ],
    "rainfall": [
        "rainfall",
        "rainfall_mm",
        "rain_mm",
        "rain",
        "precipitation",
        "precipitation_mm",
        "precip_mm",
        "precip",
        "prectotcorr",
        "prectot",
        "prcp",
        "daily_rainfall",
        "total_rainfall",
        "rainfall_amount",
        "rainfall_total",
        "precipitation_amount",
    ],
    "temperature": [
        "temperature",
        "temp",
        "temperature_c",
        "temp_c",
        "air_temperature",
        "mean_temperature",
        "avg_temperature",
        "average_temperature",
        "temperature_at_2_meters",
        "t2m",
        "tmean",
        "mean_temp",
        "daily_temperature",
        "average_temp",
    ],
    "humidity": [
        "humidity",
        "relative_humidity",
        "relative_humidity_percent",
        "humidity_percent",
        "rh",
        "rh2m",
        "relative_humidity_at_2_meters",
        "avg_humidity",
        "average_humidity",
        "mean_humidity",
    ],
}

WEATHER_STANDARD_SCHEMA = [
    "reporting_date",
    "year",
    "month",
    "rainfall",
    "temperature",
    "humidity",
    "validation_status",
]

WEATHER_FIELD_KEYWORDS = {
    "date": ["date", "time", "timestamp", "observation", "observed", "record", "report", "monitoring"],
    "year": ["year", "yr"],
    "month": ["month", "mo", "mn"],
    "day": ["day", "dy", "dom"],
    "doy": ["doy", "julian", "dayofyear", "yearday"],
    "rainfall": ["rain", "rainfall", "precip", "precipitation", "prectot", "prcp"],
    "temperature": ["temperature", "temp", "t2m", "tmean", "airtemp"],
    "humidity": ["humidity", "relativehumidity", "rh", "rh2m"],
}

WEATHER_FIELD_NEGATIVE_KEYWORDS = {
    "date": ["rain", "precip", "temp", "humidity", "rh", "case", "population", "barangay"],
    "year": ["rain", "precip", "temp", "humidity", "day", "month", "case", "population"],
    "month": ["rain", "precip", "temp", "humidity", "year", "day", "case", "population"],
    "day": ["rain", "precip", "temp", "humidity", "year", "month", "doy", "case", "population"],
    "doy": ["rain", "precip", "temp", "humidity", "year", "month", "case", "population"],
    "rainfall": ["temp", "temperature", "humidity", "rh", "year", "month", "day", "case", "population"],
    "temperature": ["rain", "precip", "humidity", "rh", "year", "month", "day", "case", "population"],
    "humidity": ["rain", "precip", "temp", "temperature", "year", "month", "day", "case", "population"],
}

FIELD_SCORE_THRESHOLDS = {
    "date": 46,
    "year": 44,
    "month": 44,
    "day": 44,
    "doy": 44,
    "rainfall": 46,
    "temperature": 46,
    "humidity": 46,
}


def normalize_column_name(column_name: str) -> str:
    return clean_column_name(column_name)


def score_weather_column(field: str, column, df: pd.DataFrame | None = None) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    normalized = clean_column_name(column)
    compact = compact_column_name(column)
    aliases = [clean_column_name(alias) for alias in WEATHER_FIELD_ALIASES.get(field, [])]
    compact_aliases = [compact_column_name(alias) for alias in WEATHER_FIELD_ALIASES.get(field, [])]

    if normalized in aliases or compact in compact_aliases:
        score += 95
        reasons.append("exact alias match")

    for alias in aliases:
        alias_compact = compact_column_name(alias)
        if alias and alias != normalized and len(alias_compact) >= 4 and (alias in normalized or normalized in alias):
            score += 32
            reasons.append(f"name resembles {alias}")
            break

    column_tokens = tokenize_column_name(column)

    for keyword in WEATHER_FIELD_KEYWORDS.get(field, []):
        key = compact_column_name(keyword)
        if not key:
            continue
        matched_keyword = key in column_tokens if len(key) <= 3 else key in compact
        if matched_keyword:
            score += 18
            reasons.append(f"name contains {keyword}")

    for negative in WEATHER_FIELD_NEGATIVE_KEYWORDS.get(field, []):
        key = compact_column_name(negative)
        if key and key in compact:
            score -= 24
            reasons.append(f"name conflicts with {negative}")

    sample = non_empty_sample(df, column)

    if not sample.empty:
        if field == "date":
            ratio = date_like_ratio(sample)
            if ratio >= 0.65:
                score += 50
                reasons.append("values look like dates")
            elif ratio >= 0.35:
                score += 24
                reasons.append("some values look like dates")

        elif field == "year":
            ratio = year_like_ratio(sample)
            if ratio >= 0.75:
                score += 46
                reasons.append("values look like years")
            elif ratio >= 0.45:
                score += 22
                reasons.append("some values look like years")

        elif field == "month":
            ratio = max(bounded_integer_ratio(sample, 1, 12), month_name_ratio(sample))
            if ratio >= 0.75:
                score += 44
                reasons.append("values look like months")
            elif ratio >= 0.45:
                score += 20
                reasons.append("some values look like months")

        elif field == "day":
            ratio = bounded_integer_ratio(sample, 1, 31)
            if ratio >= 0.75:
                score += 42
                reasons.append("values look like days of month")
            elif ratio >= 0.45:
                score += 18
                reasons.append("some values look like days of month")

        elif field == "doy":
            ratio = bounded_integer_ratio(sample, 1, 366)
            if ratio >= 0.75:
                score += 42
                reasons.append("values look like day-of-year values")
            elif ratio >= 0.45:
                score += 18
                reasons.append("some values look like day-of-year values")

        elif field == "rainfall":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty and (values >= 0).mean() >= 0.98:
                score += 42
                reasons.append("values look like rainfall amounts")

        elif field == "temperature":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty:
                in_range = ((values >= -20) & (values <= 60)).mean()
                if in_range >= 0.9:
                    score += 44
                    reasons.append("values look like Celsius temperatures")

        elif field == "humidity":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty:
                in_range = ((values >= 0) & (values <= 100)).mean()
                if in_range >= 0.9:
                    score += 44
                    reasons.append("values look like humidity percentages")

    return score, reasons[:5]


def detect_weather_columns(columns, df: pd.DataFrame | None = None):
    columns = list(columns)
    used_columns = set()
    matched_fields = {}
    field_confidence = {}
    field_detection_details = {}
    field_candidates = {}

    for field in WEATHER_FIELD_ALIASES:
        candidates = []
        for column in columns:
            score, reasons = score_weather_column(field, column, df)
            candidates.append({
                "column": column,
                "score": round(max(score, 0), 2),
                "reasons": reasons,
            })
        candidates.sort(key=lambda item: item["score"], reverse=True)
        field_candidates[field] = candidates[:5]

    for field in ["date", "year", "month", "day", "doy", "rainfall", "temperature", "humidity"]:
        threshold = FIELD_SCORE_THRESHOLDS.get(field, 46)
        for candidate in field_candidates.get(field, []):
            column = candidate["column"]
            if column in used_columns:
                continue
            if candidate["score"] >= threshold:
                matched_fields[field] = column
                used_columns.add(column)
                confidence = int(max(0, min(100, round(candidate["score"]))))
                field_confidence[field] = confidence
                field_detection_details[field] = {
                    "column": column,
                    "confidence": confidence,
                    "reasons": candidate.get("reasons", []),
                }
                break

    has_direct_date = "date" in matched_fields
    has_year_month_day = all(field in matched_fields for field in ["year", "month", "day"])
    has_year_doy = all(field in matched_fields for field in ["year", "doy"])
    has_time_field = has_direct_date or has_year_month_day or has_year_doy
    has_rainfall = "rainfall" in matched_fields
    has_temperature = "temperature" in matched_fields
    has_humidity = "humidity" in matched_fields

    missing_required_fields = []
    if not has_time_field:
        missing_required_fields.append("date or year/month/day or year/day_of_year")
    if not has_rainfall:
        missing_required_fields.append("rainfall")
    if not has_temperature:
        missing_required_fields.append("temperature")
    if not has_humidity:
        missing_required_fields.append("humidity")

    required_confidences = []
    if has_direct_date:
        required_confidences.append(field_confidence.get("date", 0))
    elif has_year_month_day:
        required_confidences.extend([
            field_confidence.get("year", 0),
            field_confidence.get("month", 0),
            field_confidence.get("day", 0),
        ])
    elif has_year_doy:
        required_confidences.extend([
            field_confidence.get("year", 0),
            field_confidence.get("doy", 0),
        ])

    for field in ["rainfall", "temperature", "humidity"]:
        if field in field_confidence:
            required_confidences.append(field_confidence[field])

    mapping_confidence = int(round(sum(required_confidences) / len(required_confidences))) if required_confidences else 0

    if has_time_field and has_rainfall and has_temperature and has_humidity:
        dataset_type = "likely_weather_dataset"
        readiness = "ready_for_cleaning"
    elif has_time_field or has_rainfall or has_temperature or has_humidity:
        dataset_type = "possible_weather_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_weather_import"

    mapping_summary = ", ".join(f"{field} → {column}" for field, column in matched_fields.items())

    return {
        "dataset_type": dataset_type,
        "readiness": readiness,
        "matched_fields": matched_fields,
        "missing_required_fields": missing_required_fields,
        "confidence_score": mapping_confidence,
        "field_confidence": field_confidence,
        "field_detection_details": field_detection_details,
        "field_candidates": field_candidates,
        "detection_method": "adaptive_schema_detection",
        "mapping_summary": mapping_summary,
        "standard_schema": WEATHER_STANDARD_SCHEMA,
    }


async def read_weather_file(file: UploadFile):
    return await read_tabular_file(file)


def make_json_safe_value(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    return value


def make_json_safe_records(df: pd.DataFrame):
    safe_df = df.copy()
    safe_df = safe_df.astype(object)
    safe_df = safe_df.where(pd.notnull(safe_df), None)

    records = safe_df.to_dict(orient="records")

    return [
        {
            key: make_json_safe_value(value)
            for key, value in record.items()
        }
        for record in records
    ]


def parse_numeric(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    text = str(value).strip().replace(",", "").replace("%", "")

    if text == "":
        return None

    try:
        return float(text)
    except Exception:
        return None


def format_date(date_value):
    if date_value is None:
        return ""

    if pd.isna(date_value):
        return ""

    if isinstance(date_value, datetime):
        return date_value.strftime("%Y-%m-%d")

    raw = str(date_value).strip()

    if raw == "":
        return ""

    if raw.endswith(".0") and raw.replace(".0", "").isdigit():
        raw = raw.replace(".0", "")

    if raw.isdigit() and len(raw) == 8:
        try:
            date = datetime.strptime(raw, "%Y%m%d")
            return date.strftime("%Y-%m-%d")
        except Exception:
            pass

    excel_serial = parse_numeric(raw)

    if excel_serial is not None and 20000 < excel_serial < 60000:
        try:
            date = datetime(1899, 12, 30) + timedelta(days=int(excel_serial))
            return date.strftime("%Y-%m-%d")
        except Exception:
            pass

    parsed = pd.to_datetime(raw, errors="coerce")

    if pd.isna(parsed):
        return ""

    return parsed.strftime("%Y-%m-%d")


def build_date_from_parts(year_value, month_value, day_value):
    year = parse_numeric(year_value)
    month = parse_numeric(month_value)
    day = parse_numeric(day_value)

    if year is None or month is None or day is None:
        return ""

    try:
        date = datetime(int(year), int(month), int(day))
        return date.strftime("%Y-%m-%d")
    except Exception:
        return ""


def build_date_from_doy(year_value, doy_value):
    year = parse_numeric(year_value)
    doy = parse_numeric(doy_value)

    if year is None or doy is None:
        return ""

    if doy < 1 or doy > 366:
        return ""

    try:
        date = datetime(int(year), 1, 1) + timedelta(days=int(doy) - 1)

        if date.year != int(year):
            return ""

        return date.strftime("%Y-%m-%d")
    except Exception:
        return ""


def convert_optional_float(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    return round(float(value), 3)


def prepare_clean_weather_dataframe(df: pd.DataFrame):
    weather_detection = detect_weather_columns(df.columns, df)

    if weather_detection["readiness"] != "ready_for_cleaning":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "File is not ready for weather cleaning.",
                "weather_detection": weather_detection,
            },
        )

    matched_fields = weather_detection["matched_fields"]

    has_date = "date" in matched_fields
    has_year = "year" in matched_fields
    has_month = "month" in matched_fields
    has_day = "day" in matched_fields
    has_doy = "doy" in matched_fields

    clean_df = pd.DataFrame()

    if has_date:
        clean_df["reporting_date"] = df[matched_fields["date"]].apply(format_date)
    elif has_year and has_month and has_day:
        clean_df["reporting_date"] = [
            build_date_from_parts(year, month, day)
            for year, month, day in zip(
                df[matched_fields["year"]],
                df[matched_fields["month"]],
                df[matched_fields["day"]],
            )
        ]
    elif has_year and has_doy:
        clean_df["reporting_date"] = [
            build_date_from_doy(year, doy)
            for year, doy in zip(
                df[matched_fields["year"]],
                df[matched_fields["doy"]],
            )
        ]
    else:
        clean_df["reporting_date"] = ""

    clean_df["rainfall"] = df[matched_fields["rainfall"]].apply(parse_numeric)
    clean_df["temperature"] = df[matched_fields["temperature"]].apply(parse_numeric)
    clean_df["humidity"] = df[matched_fields["humidity"]].apply(parse_numeric)

    clean_df["year"] = pd.to_datetime(clean_df["reporting_date"], errors="coerce").dt.year
    clean_df["month"] = pd.to_datetime(clean_df["reporting_date"], errors="coerce").dt.month

    invalid_date = clean_df["reporting_date"].isna() | clean_df["reporting_date"].astype(str).str.strip().eq("")
    invalid_rainfall = clean_df["rainfall"].isna() | (clean_df["rainfall"] < 0)
    invalid_temperature = clean_df["temperature"].isna() | (clean_df["temperature"] < -20) | (clean_df["temperature"] > 60)
    invalid_humidity = clean_df["humidity"].isna() | (clean_df["humidity"] < 0) | (clean_df["humidity"] > 100)

    duplicate_rows = (
        clean_df["reporting_date"].duplicated(keep="first")
        & ~invalid_date
        & ~invalid_rainfall
        & ~invalid_temperature
        & ~invalid_humidity
    )

    invalid_rows = invalid_date | invalid_rainfall | invalid_temperature | invalid_humidity | duplicate_rows

    def build_reason(index):
        reasons = []
        if bool(invalid_date.iloc[index]):
            reasons.append("Missing or invalid date")
        if bool(invalid_rainfall.iloc[index]):
            reasons.append("Invalid rainfall")
        if bool(invalid_temperature.iloc[index]):
            reasons.append("Invalid temperature")
        if bool(invalid_humidity.iloc[index]):
            reasons.append("Invalid humidity")
        if bool(duplicate_rows.iloc[index]):
            reasons.append("Duplicate reporting date")
        return ", ".join(reasons) if reasons else "Valid"

    clean_df["validation_status"] = [build_reason(index) for index in range(len(clean_df))]

    valid_df = clean_df[~invalid_rows].copy()
    valid_df["rainfall"] = valid_df["rainfall"].apply(convert_optional_float)
    valid_df["temperature"] = valid_df["temperature"].apply(convert_optional_float)
    valid_df["humidity"] = valid_df["humidity"].apply(convert_optional_float)

    valid_df = valid_df[WEATHER_STANDARD_SCHEMA]
    invalid_preview_df = clean_df[invalid_rows].copy()[WEATHER_STANDARD_SCHEMA]

    validation_summary = {
        "invalid_date_rows": int(invalid_date.sum()),
        "invalid_rainfall_rows": int(invalid_rainfall.sum()),
        "invalid_temperature_rows": int(invalid_temperature.sum()),
        "invalid_humidity_rows": int(invalid_humidity.sum()),
        "duplicate_weather_rows": int(duplicate_rows.sum()),
        "unique_reporting_period_count": int(valid_df["reporting_date"].nunique()) if not valid_df.empty else 0,
    }

    return {
        "weather_detection": weather_detection,
        "valid_df": valid_df,
        "invalid_preview_df": invalid_preview_df,
        "invalid_rows": invalid_rows,
        "validation_summary": validation_summary,
    }


async def validate_weather_file(file: UploadFile):
    df, file_type, filename = await read_weather_file(file)

    prepared = prepare_clean_weather_dataframe(df)

    weather_detection = prepared["weather_detection"]
    valid_df = prepared["valid_df"]
    invalid_preview_df = prepared["invalid_preview_df"]
    invalid_rows = prepared["invalid_rows"]
    validation_summary = prepared["validation_summary"]

    cleaned_records = make_json_safe_records(valid_df)
    cleaned_preview = make_json_safe_records(valid_df.head(25))
    invalid_preview = make_json_safe_records(invalid_preview_df.head(25))

    return {
        "message": "Weather file validated successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "standard_columns": list(valid_df.columns),
        "validation_summary": validation_summary,
        "weather_detection": weather_detection,
        "cleaned_records": cleaned_records,
        "cleaned_preview": cleaned_preview,
        "invalid_preview": invalid_preview,
    }
