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


def build_period(row):
    if row.get("date"):
        return row.get("date")

    year = row.get("year")
    month = row.get("month")
    week = row.get("week")

    if year is not None and month is not None:
        return f"{int(year)}-{int(month):02d}"

    if year is not None and week is not None:
        return f"{int(year)}-W{int(week):02d}"

    return ""


def convert_number(value):
    if pd.isna(value):
        return None

    return int(value)


async def clean_dengue_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

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

    clean_df["barangay"] = (
        df[matched_fields["barangay"]]
        .astype(str)
        .str.strip()
    )

    if has_date:
        parsed_dates = pd.to_datetime(df[matched_fields["date"]], errors="coerce")

        clean_df["date"] = parsed_dates.dt.strftime("%Y-%m-%d")
        clean_df["year"] = parsed_dates.dt.year
        clean_df["month"] = parsed_dates.dt.month
        clean_df["week"] = parsed_dates.dt.isocalendar().week.astype("Int64")

    else:
        clean_df["date"] = None
        clean_df["year"] = pd.to_numeric(df[matched_fields["year"]], errors="coerce")

        if has_month:
            clean_df["month"] = pd.to_numeric(df[matched_fields["month"]], errors="coerce")
        else:
            clean_df["month"] = pd.NA

        if has_week:
            clean_df["week"] = pd.to_numeric(df[matched_fields["week"]], errors="coerce")
        else:
            clean_df["week"] = pd.NA

    clean_df["cases"] = pd.to_numeric(df[matched_fields["cases"]], errors="coerce")

    if "deaths" in matched_fields:
        clean_df["deaths"] = pd.to_numeric(df[matched_fields["deaths"]], errors="coerce")
    else:
        clean_df["deaths"] = 0

    invalid_barangay = clean_df["barangay"].str.lower().isin(["", "nan", "none"])
    invalid_time = clean_df["year"].isna() | (
        clean_df["month"].isna() & clean_df["week"].isna()
    )
    invalid_cases = clean_df["cases"].isna() | (clean_df["cases"] < 0)
    invalid_deaths = clean_df["deaths"].isna() | (clean_df["deaths"] < 0)

    invalid_rows = invalid_barangay | invalid_time | invalid_cases | invalid_deaths

    clean_df["period"] = clean_df.apply(build_period, axis=1)

    valid_df = clean_df[~invalid_rows].copy()

    for column in ["year", "month", "week", "cases", "deaths"]:
        valid_df[column] = valid_df[column].apply(convert_number)

    valid_df = valid_df[
        [
            "barangay",
            "period",
            "date",
            "year",
            "month",
            "week",
            "cases",
            "deaths",
        ]
    ]

    valid_df = valid_df.where(pd.notnull(valid_df), None)

    cleaned_preview = valid_df.head(10).to_dict(orient="records")

    return {
        "message": "Dengue file cleaned successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "standard_columns": list(valid_df.columns),
        "validation_summary": {
            "invalid_barangay_rows": int(invalid_barangay.sum()),
            "invalid_time_rows": int(invalid_time.sum()),
            "invalid_cases_rows": int(invalid_cases.sum()),
            "invalid_deaths_rows": int(invalid_deaths.sum()),
        },
        "dengue_detection": dengue_detection,
        "cleaned_preview": cleaned_preview,
    }