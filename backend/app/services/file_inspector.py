from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile


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
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
    )


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