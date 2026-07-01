from io import BytesIO
from pathlib import Path
import json

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.services.barangay_normalizer import (
    canonicalize_barangay_name,
    normalize_barangay_key,
)


POPULATION_FIELD_ALIASES = {
    "barangay": [
        "barangay",
        "brgy",
        "barangay_name",
        "brgy_name",
        "location",
        "area",
        "village",
        "adm4_name",
        "adm4_en",
        "name",
    ],
    "population": [
        "population",
        "population_count",
        "total_population",
        "pop",
        "pop2020",
        "population_2020",
        "2020_population",
        "census_population",
    ],
    "year": [
        "year",
        "census_year",
        "reference_year",
        "ref_year",
    ],
    "psgc": [
        "psgc",
        "psgc_code",
        "code",
        "barangay_code",
        "brgy_code",
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


async def read_population_file(file: UploadFile):
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
                    detail="JSON population file must contain an array of records or a records/data array.",
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
            detail=f"Could not read population file. Error: {str(error)}",
        )

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="Population file does not contain readable records.",
        )

    return df, file_type, filename


def detect_population_columns(columns):
    normalized_columns = {
        normalize_column_name(column): column
        for column in columns
    }

    matched_fields = {}
    missing_required_fields = []

    for standard_field, aliases in POPULATION_FIELD_ALIASES.items():
        matched_column = None

        for alias in aliases:
            normalized_alias = normalize_column_name(alias)

            if normalized_alias in normalized_columns:
                matched_column = normalized_columns[normalized_alias]
                break

        if matched_column:
            matched_fields[standard_field] = matched_column

    has_barangay = "barangay" in matched_fields
    has_population = "population" in matched_fields

    if not has_barangay:
        missing_required_fields.append("barangay")

    if not has_population:
        missing_required_fields.append("population")

    if has_barangay and has_population:
        dataset_type = "likely_population_dataset"
        readiness = "ready_for_cleaning"
    elif has_barangay or has_population:
        dataset_type = "possible_population_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_population_import"

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


def has_invalid_text(value):
    if value is None:
        return True

    try:
        if pd.isna(value):
            return True
    except Exception:
        pass

    text = str(value).strip().lower()

    return text in ["", "nan", "none", "nat"]


def convert_optional_int(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    return int(float(value))


def prepare_clean_population_dataframe(df: pd.DataFrame):
    population_detection = detect_population_columns(df.columns)

    if population_detection["readiness"] != "ready_for_cleaning":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "File is not ready for population cleaning.",
                "population_detection": population_detection,
            },
        )

    matched_fields = population_detection["matched_fields"]

    has_year = "year" in matched_fields
    has_psgc = "psgc" in matched_fields

    clean_df = pd.DataFrame()

    barangay_text = (
        df[matched_fields["barangay"]]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    clean_df["barangay_raw"] = barangay_text
    clean_df["barangay"] = barangay_text.apply(canonicalize_barangay_name)
    clean_df["barangay_key"] = barangay_text.apply(normalize_barangay_key)

    clean_df["population"] = pd.to_numeric(
        df[matched_fields["population"]],
        errors="coerce",
    )

    if has_year:
        clean_df["year"] = pd.to_numeric(
            df[matched_fields["year"]],
            errors="coerce",
        )
        year_raw = df[matched_fields["year"]]
    else:
        clean_df["year"] = pd.NA
        year_raw = pd.Series([None] * len(df))

    if has_psgc:
        clean_df["psgc"] = (
            df[matched_fields["psgc"]]
            .fillna("")
            .astype(str)
            .str.strip()
        )
    else:
        clean_df["psgc"] = ""

    invalid_barangay = (
        clean_df["barangay_raw"].isna()
        | clean_df["barangay_raw"].astype(str).str.strip().eq("")
        | clean_df["barangay_raw"]
        .astype(str)
        .str.strip()
        .str.lower()
        .isin(["nan", "none", "nat"])
    )

    invalid_population = (
        clean_df["population"].isna()
        | (clean_df["population"] < 0)
    )

    if has_year:
        year_has_value = ~year_raw.apply(has_invalid_text)
        invalid_year = year_has_value & (
            clean_df["year"].isna()
            | (clean_df["year"] < 1900)
            | (clean_df["year"] > 2100)
        )
    else:
        invalid_year = pd.Series([False] * len(clean_df), index=clean_df.index)

    duplicate_key = (
        clean_df["barangay_key"].fillna("").astype(str)
        + "-"
        + clean_df["year"].fillna("no-year").astype(str)
    )

    duplicate_rows = (
        duplicate_key.duplicated(keep="first")
        & ~invalid_barangay
        & ~invalid_population
        & ~invalid_year
    )

    invalid_rows = (
        invalid_barangay
        | invalid_population
        | invalid_year
        | duplicate_rows
    )

    def build_reason(index):
        reasons = []

        if bool(invalid_barangay.iloc[index]):
            reasons.append("Missing barangay")

        if bool(invalid_population.iloc[index]):
            reasons.append("Invalid population")

        if bool(invalid_year.iloc[index]):
            reasons.append("Invalid year")

        if bool(duplicate_rows.iloc[index]):
            reasons.append("Duplicate barangay/year")

        return ", ".join(reasons) if reasons else "Valid"

    clean_df["validation_status"] = [
        build_reason(index)
        for index in range(len(clean_df))
    ]

    valid_df = clean_df[~invalid_rows].copy()

    valid_df["population"] = valid_df["population"].apply(convert_optional_int)
    valid_df["year"] = valid_df["year"].apply(convert_optional_int)

    valid_df = valid_df[
        [
            "barangay",
            "barangay_key",
            "barangay_raw",
            "population",
            "year",
            "psgc",
            "validation_status",
        ]
    ]

    invalid_preview_df = clean_df[invalid_rows].copy()

    invalid_preview_df = invalid_preview_df[
        [
            "barangay",
            "barangay_key",
            "barangay_raw",
            "population",
            "year",
            "psgc",
            "validation_status",
        ]
    ]

    validation_summary = {
        "invalid_barangay_rows": int(invalid_barangay.sum()),
        "invalid_population_rows": int(invalid_population.sum()),
        "invalid_year_rows": int(invalid_year.sum()),
        "duplicate_barangay_rows": int(duplicate_rows.sum()),
        "normalized_barangay_count": int(valid_df["barangay_key"].nunique())
        if not valid_df.empty
        else 0,
    }

    return {
        "population_detection": population_detection,
        "valid_df": valid_df,
        "invalid_preview_df": invalid_preview_df,
        "invalid_rows": invalid_rows,
        "validation_summary": validation_summary,
    }


async def validate_population_file(file: UploadFile):
    df, file_type, filename = await read_population_file(file)

    prepared = prepare_clean_population_dataframe(df)

    population_detection = prepared["population_detection"]
    valid_df = prepared["valid_df"]
    invalid_preview_df = prepared["invalid_preview_df"]
    invalid_rows = prepared["invalid_rows"]
    validation_summary = prepared["validation_summary"]

    cleaned_preview = make_json_safe_records(valid_df.head(25))
    invalid_preview = make_json_safe_records(invalid_preview_df.head(25))

    return {
        "message": "Population file validated successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "standard_columns": list(valid_df.columns),
        "validation_summary": validation_summary,
        "population_detection": population_detection,
        "cleaned_preview": cleaned_preview,
        "invalid_preview": invalid_preview,
    }