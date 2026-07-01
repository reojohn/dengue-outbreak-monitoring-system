from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
import json

import pandas as pd
from fastapi import HTTPException, UploadFile


WEATHER_FIELD_ALIASES = {
    "date": [
        "date",
        "reporting_date",
        "weather_date",
        "observation_date",
        "observed_date",
        "record_date",
        "day_date",
        "datetime",
        "time",
    ],
    "year": [
        "year",
        "yr",
    ],
    "month": [
        "month",
        "mo",
        "mn",
    ],
    "day": [
        "day",
        "dy",
        "date_day",
    ],
    "doy": [
        "doy",
        "day_of_year",
        "julian_day",
        "daynumber",
        "day_number",
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
    ],
    "humidity": [
        "humidity",
        "relative_humidity",
        "relative_humidity_percent",
        "humidity_percent",
        "rh",
        "rh2m",
        "relative_humidity_at_2_meters",
    ],
}


def normalize_column_name(column_name: str) -> str:
    return (
        str(column_name)
        .replace("\ufeff", "")
        .strip()
        .lower()
        .replace("%", "percent")
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
        .replace("(", "")
        .replace(")", "")
    )


async def read_weather_file(file: UploadFile):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if extension == ".csv":
            df = pd.read_csv(BytesIO(content))
            file_type = "csv"

        elif extension in [".xlsx", ".xls"]:
            df = pd.read_excel(BytesIO(content))
            file_type = "excel"

        elif extension == ".json":
            parsed = json.loads(content.decode("utf-8"))

            if isinstance(parsed, list):
                df = pd.DataFrame(parsed)
            elif isinstance(parsed, dict) and isinstance(parsed.get("records"), list):
                df = pd.DataFrame(parsed["records"])
            elif isinstance(parsed, dict) and isinstance(parsed.get("data"), list):
                df = pd.DataFrame(parsed["data"])
            else:
                raise HTTPException(
                    status_code=400,
                    detail="JSON weather file must contain an array of records or a records/data array.",
                )

            file_type = "json"

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a CSV, Excel, or JSON file.",
            )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read weather file. Error: {str(error)}",
        )

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="Weather file does not contain readable records.",
        )

    return df, file_type, filename


def detect_weather_columns(columns):
    normalized_columns = {
        normalize_column_name(column): column
        for column in columns
    }

    matched_fields = {}
    missing_required_fields = []

    for standard_field, aliases in WEATHER_FIELD_ALIASES.items():
        matched_column = None

        for alias in aliases:
            normalized_alias = normalize_column_name(alias)

            if normalized_alias in normalized_columns:
                matched_column = normalized_columns[normalized_alias]
                break

        if matched_column:
            matched_fields[standard_field] = matched_column

    has_direct_date = "date" in matched_fields
    has_year_month_day = all(
        field in matched_fields
        for field in ["year", "month", "day"]
    )
    has_year_doy = all(
        field in matched_fields
        for field in ["year", "doy"]
    )

    has_time_field = has_direct_date or has_year_month_day or has_year_doy
    has_rainfall = "rainfall" in matched_fields
    has_temperature = "temperature" in matched_fields
    has_humidity = "humidity" in matched_fields

    if not has_time_field:
        missing_required_fields.append("date or year/month/day or year/day_of_year")

    if not has_rainfall:
        missing_required_fields.append("rainfall")

    if not has_temperature:
        missing_required_fields.append("temperature")

    if not has_humidity:
        missing_required_fields.append("humidity")

    if has_time_field and has_rainfall and has_temperature and has_humidity:
        dataset_type = "likely_weather_dataset"
        readiness = "ready_for_cleaning"
    elif has_time_field or has_rainfall or has_temperature or has_humidity:
        dataset_type = "possible_weather_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_weather_import"

    return {
        "dataset_type": dataset_type,
        "readiness": readiness,
        "matched_fields": matched_fields,
        "missing_required_fields": missing_required_fields,
    }


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
    weather_detection = detect_weather_columns(df.columns)

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

    clean_df["year"] = pd.to_datetime(
        clean_df["reporting_date"],
        errors="coerce",
    ).dt.year

    clean_df["month"] = pd.to_datetime(
        clean_df["reporting_date"],
        errors="coerce",
    ).dt.month

    invalid_date = (
        clean_df["reporting_date"].isna()
        | clean_df["reporting_date"].astype(str).str.strip().eq("")
    )

    invalid_rainfall = (
        clean_df["rainfall"].isna()
        | (clean_df["rainfall"] < 0)
    )

    invalid_temperature = (
        clean_df["temperature"].isna()
        | (clean_df["temperature"] < -20)
        | (clean_df["temperature"] > 60)
    )

    invalid_humidity = (
        clean_df["humidity"].isna()
        | (clean_df["humidity"] < 0)
        | (clean_df["humidity"] > 100)
    )

    duplicate_rows = (
        clean_df["reporting_date"].duplicated(keep="first")
        & ~invalid_date
        & ~invalid_rainfall
        & ~invalid_temperature
        & ~invalid_humidity
    )

    invalid_rows = (
        invalid_date
        | invalid_rainfall
        | invalid_temperature
        | invalid_humidity
        | duplicate_rows
    )

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

    clean_df["validation_status"] = [
        build_reason(index)
        for index in range(len(clean_df))
    ]

    valid_df = clean_df[~invalid_rows].copy()

    valid_df["rainfall"] = valid_df["rainfall"].apply(convert_optional_float)
    valid_df["temperature"] = valid_df["temperature"].apply(convert_optional_float)
    valid_df["humidity"] = valid_df["humidity"].apply(convert_optional_float)

    valid_df = valid_df[
        [
            "reporting_date",
            "year",
            "month",
            "rainfall",
            "temperature",
            "humidity",
            "validation_status",
        ]
    ]

    invalid_preview_df = clean_df[invalid_rows].copy()

    invalid_preview_df = invalid_preview_df[
        [
            "reporting_date",
            "year",
            "month",
            "rainfall",
            "temperature",
            "humidity",
            "validation_status",
        ]
    ]

    validation_summary = {
        "invalid_date_rows": int(invalid_date.sum()),
        "invalid_rainfall_rows": int(invalid_rainfall.sum()),
        "invalid_temperature_rows": int(invalid_temperature.sum()),
        "invalid_humidity_rows": int(invalid_humidity.sum()),
        "duplicate_weather_rows": int(duplicate_rows.sum()),
        "unique_reporting_period_count": int(valid_df["reporting_date"].nunique())
        if not valid_df.empty
        else 0,
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
        "cleaned_preview": cleaned_preview,
        "invalid_preview": invalid_preview,
    }