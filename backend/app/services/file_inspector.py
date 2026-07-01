from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.services.barangay_normalizer import (
    canonicalize_barangay_name,
    normalize_barangay_key,
)


DENGUE_FIELD_ALIASES = {
    "barangay": [
        "barangay",
        "brgy",
        "barangay_name",
        "brgy_name",
        "location",
        "area",
    ],
    "date": [
        "date",
        "reporting_date",
        "report_date",
        "case_date",
        "period",
    ],
    "year": [
        "year",
        "yr",
    ],
    "month": [
        "month",
        "mo",
    ],
    "week": [
        "week",
        "epi_week",
        "morbidity_week",
        "mw",
        "epidemiological_week",
    ],
    "cases": [
        "cases",
        "case_count",
        "dengue_cases",
        "confirmed_cases",
        "no_of_cases",
        "number_of_cases",
        "historical_total_cases",
    ],
    "deaths": [
        "deaths",
        "death_count",
        "dengue_deaths",
        "no_of_deaths",
        "number_of_deaths",
    ],
}


def normalize_column_name(column_name: str) -> str:
    return (
        str(column_name)
        .replace("\ufeff", "")
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
    )


async def read_tabular_file(file: UploadFile):
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

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a CSV or Excel file.",
            )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file. Error: {str(error)}",
        )

    return df, file_type, filename


def detect_dengue_columns(columns):
    normalized_columns = {
        normalize_column_name(column): column
        for column in columns
    }

    matched_fields = {}
    missing_required_fields = []

    for standard_field, aliases in DENGUE_FIELD_ALIASES.items():
        matched_column = None

        for alias in aliases:
            normalized_alias = normalize_column_name(alias)

            if normalized_alias in normalized_columns:
                matched_column = normalized_columns[normalized_alias]
                break

        if matched_column:
            matched_fields[standard_field] = matched_column

    has_barangay = "barangay" in matched_fields
    has_cases = "cases" in matched_fields
    has_time_field = any(
        field in matched_fields
        for field in ["date", "year", "month", "week"]
    )

    if not has_barangay:
        missing_required_fields.append("barangay")

    if not has_cases:
        missing_required_fields.append("cases")

    if not has_time_field:
        missing_required_fields.append("date/year/month/week")

    if has_barangay and has_cases and has_time_field:
        dataset_type = "likely_dengue_dataset"
        readiness = "ready_for_cleaning"
    elif has_barangay or has_cases:
        dataset_type = "possible_dengue_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_dengue_import"

    return {
        "dataset_type": dataset_type,
        "readiness": readiness,
        "matched_fields": matched_fields,
        "missing_required_fields": missing_required_fields,
    }


async def inspect_tabular_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

    preview = df.head(5).fillna("").astype(str).to_dict(orient="records")

    missing_values = {
        column: int(df[column].isna().sum())
        for column in df.columns
    }

    dengue_detection = detect_dengue_columns(df.columns)

    return {
        "message": "File inspected successfully.",
        "filename": filename,
        "file_type": file_type,
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": list(df.columns),
        "missing_values": missing_values,
        "dengue_detection": dengue_detection,
        "preview": preview,
    }


def has_usable_value(value):
    if value is None:
        return False

    if pd.isna(value):
        return False

    text_value = str(value).strip().lower()

    return text_value not in ["", "nan", "none", "nat"]


def build_period(row):
    date = row.get("date")

    if has_usable_value(date):
        return str(date)

    year = row.get("year")
    month = row.get("month")
    week = row.get("week")

    if has_usable_value(year) and has_usable_value(month):
        return f"{int(float(year))}-{int(float(month)):02d}"

    if has_usable_value(year) and has_usable_value(week):
        return f"{int(float(year))}-W{int(float(week)):02d}"

    return ""


def convert_number(value):
    if value is None:
        return None

    if pd.isna(value):
        return None

    return int(float(value))


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


def classify_historical_risk(total_cases: int):
    if total_cases >= 60:
        return "High"

    if total_cases >= 25:
        return "Moderate"

    return "Low"


def prepare_clean_dengue_dataframe(df: pd.DataFrame):
    dengue_detection = detect_dengue_columns(df.columns)

    if dengue_detection["readiness"] != "ready_for_cleaning":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "File is not ready for dengue cleaning.",
                "dengue_detection": dengue_detection,
            },
        )

    matched_fields = dengue_detection["matched_fields"]

    has_date = "date" in matched_fields
    has_year = "year" in matched_fields
    has_month = "month" in matched_fields
    has_week = "week" in matched_fields

    if not has_date and not (has_year and (has_month or has_week)):
        raise HTTPException(
            status_code=400,
            detail="A dengue dataset must contain either a date column or year with month/week columns.",
        )

    clean_df = pd.DataFrame()

    barangay_text = (
        df[matched_fields["barangay"]]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    # Keep the original name for traceability, but use the normalized
    # barangay name for grouping, forecasting, mapping, and future dataset matching.
    clean_df["barangay_raw"] = barangay_text
    clean_df["barangay"] = barangay_text.apply(canonicalize_barangay_name)
    clean_df["barangay_key"] = barangay_text.apply(normalize_barangay_key)

    if has_date:
        parsed_dates = pd.to_datetime(
            df[matched_fields["date"]],
            errors="coerce",
        )

        clean_df["date"] = parsed_dates.dt.strftime("%Y-%m-%d")
        clean_df["year"] = parsed_dates.dt.year
        clean_df["month"] = parsed_dates.dt.month
        clean_df["week"] = parsed_dates.dt.isocalendar().week.astype("Int64")

    else:
        clean_df["date"] = None
        clean_df["year"] = pd.to_numeric(
            df[matched_fields["year"]],
            errors="coerce",
        )

        if has_month:
            clean_df["month"] = pd.to_numeric(
                df[matched_fields["month"]],
                errors="coerce",
            )
        else:
            clean_df["month"] = pd.NA

        if has_week:
            clean_df["week"] = pd.to_numeric(
                df[matched_fields["week"]],
                errors="coerce",
            )
        else:
            clean_df["week"] = pd.NA

    clean_df["cases"] = pd.to_numeric(
        df[matched_fields["cases"]],
        errors="coerce",
    )

    if "deaths" in matched_fields:
        clean_df["deaths"] = pd.to_numeric(
            df[matched_fields["deaths"]],
            errors="coerce",
        )
    else:
        clean_df["deaths"] = 0

    invalid_barangay = (
        clean_df["barangay_raw"].isna()
        | clean_df["barangay_raw"].astype(str).str.strip().eq("")
        | clean_df["barangay_raw"]
        .astype(str)
        .str.strip()
        .str.lower()
        .isin(["nan", "none", "nat"])
    )

    invalid_time = clean_df["year"].isna() | (
        clean_df["month"].isna() & clean_df["week"].isna()
    )

    invalid_cases = clean_df["cases"].isna() | (clean_df["cases"] < 0)
    invalid_deaths = clean_df["deaths"].isna() | (clean_df["deaths"] < 0)

    invalid_rows = invalid_barangay | invalid_time | invalid_cases | invalid_deaths

    valid_df = clean_df[~invalid_rows].copy()
    valid_df["period"] = valid_df.apply(build_period, axis=1)

    for column in ["year", "month", "week", "cases", "deaths"]:
        valid_df[column] = valid_df[column].apply(convert_number)

    valid_df = valid_df[
        [
            "barangay",
            "barangay_key",
            "barangay_raw",
            "period",
            "date",
            "year",
            "month",
            "week",
            "cases",
            "deaths",
        ]
    ]

    invalid_preview_df = clean_df[invalid_rows].copy()
    invalid_preview_df["period"] = ""

    invalid_preview_df = invalid_preview_df[
        [
            "barangay",
            "barangay_key",
            "barangay_raw",
            "period",
            "date",
            "year",
            "month",
            "week",
            "cases",
            "deaths",
        ]
    ]

    validation_summary = {
        "invalid_barangay_rows": int(invalid_barangay.sum()),
        "invalid_time_rows": int(invalid_time.sum()),
        "invalid_cases_rows": int(invalid_cases.sum()),
        "invalid_deaths_rows": int(invalid_deaths.sum()),
        "normalized_barangay_count": int(valid_df["barangay_key"].nunique())
        if not valid_df.empty
        else 0,
    }

    return {
        "dengue_detection": dengue_detection,
        "valid_df": valid_df,
        "invalid_preview_df": invalid_preview_df,
        "invalid_rows": invalid_rows,
        "validation_summary": validation_summary,
    }


async def clean_dengue_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

    prepared = prepare_clean_dengue_dataframe(df)

    dengue_detection = prepared["dengue_detection"]
    valid_df = prepared["valid_df"]
    invalid_preview_df = prepared["invalid_preview_df"]
    invalid_rows = prepared["invalid_rows"]
    validation_summary = prepared["validation_summary"]

    cleaned_records = make_json_safe_records(valid_df)
    cleaned_preview = make_json_safe_records(valid_df.head(25))
    invalid_preview = make_json_safe_records(invalid_preview_df.head(25))

    return {
        "message": "Dengue file cleaned successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "standard_columns": list(valid_df.columns),
        "validation_summary": validation_summary,
        "dengue_detection": dengue_detection,
        "cleaned_records": cleaned_records,
        "cleaned_preview": cleaned_preview,
        "invalid_preview": invalid_preview,
    }


async def summarize_dengue_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

    prepared = prepare_clean_dengue_dataframe(df)

    dengue_detection = prepared["dengue_detection"]
    valid_df = prepared["valid_df"]
    invalid_preview_df = prepared["invalid_preview_df"]
    invalid_rows = prepared["invalid_rows"]
    validation_summary = prepared["validation_summary"]

    if valid_df.empty:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No valid dengue records found after cleaning.",
                "validation_summary": validation_summary,
                "invalid_preview": make_json_safe_records(invalid_preview_df.head(10)),
            },
        )

    summary_df = (
        valid_df
        .groupby("barangay", as_index=False)
        .agg(
            total_cases=("cases", "sum"),
            total_deaths=("deaths", "sum"),
            record_count=("barangay", "count"),
            first_period=("period", "min"),
            latest_period=("period", "max"),
            average_cases=("cases", "mean"),
            max_cases_in_period=("cases", "max"),
        )
    )

    summary_df["average_cases"] = summary_df["average_cases"].round(2)
    summary_df["historical_risk_level"] = summary_df["total_cases"].apply(
        classify_historical_risk
    )

    summary_df = summary_df.sort_values(
        by=["total_cases", "barangay"],
        ascending=[False, True],
    )

    summary_df["rank"] = range(1, len(summary_df) + 1)

    summary_df = summary_df[
        [
            "rank",
            "barangay",
            "total_cases",
            "total_deaths",
            "record_count",
            "first_period",
            "latest_period",
            "average_cases",
            "max_cases_in_period",
            "historical_risk_level",
        ]
    ]

    barangay_summary = make_json_safe_records(summary_df)

    total_cases = int(valid_df["cases"].sum())
    total_deaths = int(valid_df["deaths"].sum())
    barangay_count = int(valid_df["barangay"].nunique())

    risk_counts = {
        "High": int((summary_df["historical_risk_level"] == "High").sum()),
        "Moderate": int((summary_df["historical_risk_level"] == "Moderate").sum()),
        "Low": int((summary_df["historical_risk_level"] == "Low").sum()),
    }

    return {
        "message": "Dengue barangay summary generated successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "barangay_count": barangay_count,
        "total_cases": total_cases,
        "total_deaths": total_deaths,
        "risk_counts": risk_counts,
        "validation_summary": validation_summary,
        "dengue_detection": dengue_detection,
        "barangay_summary": barangay_summary,
        "invalid_preview": make_json_safe_records(invalid_preview_df.head(10)),
    }