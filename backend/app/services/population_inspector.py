import re

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.services.barangay_normalizer import (
    canonicalize_barangay_name,
    normalize_barangay_key,
)
from app.services.file_inspector import (
    clean_column_name,
    compact_column_name,
    non_empty_sample,
    numeric_ratio,
    numeric_values,
    read_tabular_file,
    text_ratio,
    tokenize_column_name,
    year_like_ratio,
)


POPULATION_FIELD_ALIASES = {
    "barangay": [
        "barangay",
        "brgy",
        "bgy",
        "barangay_name",
        "brgy_name",
        "bgy_name",
        "name_of_barangay",
        "barangay_of_residence",
        "residence_barangay",
        "address_barangay",
        "location",
        "locality",
        "area",
        "village",
        "adm4_name",
        "adm4_ref_name",
        "adm4_en",
        "name",
    ],
    "population": [
        "population",
        "population_count",
        "total_population",
        "total_pop",
        "population_total",
        "pop",
        "pop2020",
        "population_2020",
        "2020_population",
        "census_population",
        "household_population",
        "residents",
        "resident_population",
        "number_of_people",
        "no_of_people",
        "no._of_people",
        "persons",
        "total_residents",
        "projected_population",
    ],
    "year": [
        "year",
        "yr",
        "census_year",
        "reference_year",
        "ref_year",
        "population_year",
        "data_year",
    ],
    "psgc": [
        "psgc",
        "psgc_code",
        "code",
        "barangay_code",
        "brgy_code",
        "bgy_code",
        "adm4_pcode",
        "adm4_code",
        "geo_code",
        "geocode",
        "location_code",
    ],
}

POPULATION_STANDARD_SCHEMA = [
    "barangay",
    "barangay_key",
    "barangay_raw",
    "population",
    "year",
    "psgc",
    "validation_status",
]

POPULATION_FIELD_KEYWORDS = {
    "barangay": ["barangay", "brgy", "bgy", "village", "residence", "address", "locality", "location", "adm4", "name"],
    "population": ["population", "pop", "residents", "resident", "people", "persons", "householdpopulation", "census"],
    "year": ["year", "yr", "census", "reference", "refyear"],
    "psgc": ["psgc", "code", "pcode", "barangaycode", "brgycode", "geocode"],
}

POPULATION_FIELD_NEGATIVE_KEYWORDS = {
    "barangay": ["population", "pop", "count", "total", "year", "psgc", "code", "pcode", "area_sq", "sqkm", "household"],
    "population": ["barangay", "brgy", "bgy", "name", "year", "psgc", "code", "pcode", "area", "sqkm"],
    "year": ["barangay", "brgy", "population", "pop", "psgc", "code", "area"],
    "psgc": ["barangay", "name", "population", "pop", "year", "area"],
}

FIELD_SCORE_THRESHOLDS = {
    "barangay": 42,
    "population": 46,
    "year": 44,
    "psgc": 38,
}


def normalize_column_name(column_name: str) -> str:
    return clean_column_name(column_name)


def score_population_column(field: str, column, df: pd.DataFrame | None = None) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    normalized = clean_column_name(column)
    compact = compact_column_name(column)
    aliases = [clean_column_name(alias) for alias in POPULATION_FIELD_ALIASES.get(field, [])]
    compact_aliases = [compact_column_name(alias) for alias in POPULATION_FIELD_ALIASES.get(field, [])]

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

    for keyword in POPULATION_FIELD_KEYWORDS.get(field, []):
        key = compact_column_name(keyword)
        if not key:
            continue
        matched_keyword = key in column_tokens if len(key) <= 3 else key in compact
        if matched_keyword:
            score += 18
            reasons.append(f"name contains {keyword}")

    for negative in POPULATION_FIELD_NEGATIVE_KEYWORDS.get(field, []):
        key = compact_column_name(negative)
        if key and key in compact:
            score -= 24
            reasons.append(f"name conflicts with {negative}")

    sample = non_empty_sample(df, column)

    if not sample.empty:
        if field == "barangay":
            text_score = text_ratio(sample)
            numeric_score = numeric_ratio(sample)
            unique_count = int(sample.astype(str).str.strip().nunique())
            if text_score >= 0.7 and numeric_score <= 0.2:
                score += 42
                reasons.append("values look like barangay names")
            if unique_count >= 2:
                score += min(18, unique_count * 1.2)
                reasons.append("multiple unique barangay-like values")

        elif field == "population":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty and (values >= 0).mean() >= 0.98:
                score += 42
                reasons.append("values look like population counts")
            if not values.empty and values.max() > 100:
                score += 8
                reasons.append("values are larger than typical codes or dates")

        elif field == "year":
            ratio = year_like_ratio(sample)
            if ratio >= 0.75:
                score += 46
                reasons.append("values look like census/reference years")
            elif ratio >= 0.45:
                score += 22
                reasons.append("some values look like census/reference years")

        elif field == "psgc":
            text_values = sample.astype(str).str.strip()
            code_like = text_values.apply(lambda value: bool(re.match(r"^[A-Za-z0-9_\-]{4,30}$", value)))
            if float(code_like.mean()) >= 0.7:
                score += 28
                reasons.append("values look like location codes")
            if numeric_ratio(sample) >= 0.7:
                values = numeric_values(sample).dropna()
                if not values.empty and values.max() > 1000:
                    score += 14
                    reasons.append("numeric values look like PSGC codes")

    return score, reasons[:5]


def detect_population_columns(columns, df: pd.DataFrame | None = None):
    columns = list(columns)
    used_columns = set()
    matched_fields = {}
    field_confidence = {}
    field_detection_details = {}
    field_candidates = {}

    for field in POPULATION_FIELD_ALIASES:
        candidates = []
        for column in columns:
            score, reasons = score_population_column(field, column, df)
            candidates.append({
                "column": column,
                "score": round(max(score, 0), 2),
                "reasons": reasons,
            })
        candidates.sort(key=lambda item: item["score"], reverse=True)
        field_candidates[field] = candidates[:5]

    # Required fields first. Optional PSGC and year are selected after so they
    # cannot steal a barangay or population column from unusual spreadsheets.
    for field in ["barangay", "population", "year", "psgc"]:
        threshold = FIELD_SCORE_THRESHOLDS.get(field, 44)
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

    has_barangay = "barangay" in matched_fields
    has_population = "population" in matched_fields

    missing_required_fields = []
    if not has_barangay:
        missing_required_fields.append("barangay")
    if not has_population:
        missing_required_fields.append("population")

    required_confidences = [field_confidence[field] for field in ["barangay", "population"] if field in field_confidence]
    mapping_confidence = int(round(sum(required_confidences) / len(required_confidences))) if required_confidences else 0

    if has_barangay and has_population:
        dataset_type = "likely_population_dataset"
        readiness = "ready_for_cleaning"
    elif has_barangay or has_population:
        dataset_type = "possible_population_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_population_import"

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
        "standard_schema": POPULATION_STANDARD_SCHEMA,
    }


async def read_population_file(file: UploadFile):
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
    population_detection = detect_population_columns(df.columns, df)

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

    barangay_text = df[matched_fields["barangay"]].fillna("").astype(str).str.strip()
    clean_df["barangay_raw"] = barangay_text
    clean_df["barangay"] = barangay_text.apply(canonicalize_barangay_name)
    clean_df["barangay_key"] = barangay_text.apply(normalize_barangay_key)
    clean_df["population"] = df[matched_fields["population"]].apply(parse_numeric)

    if has_year:
        clean_df["year"] = df[matched_fields["year"]].apply(parse_numeric)
        year_raw = df[matched_fields["year"]]
    else:
        clean_df["year"] = pd.NA
        year_raw = pd.Series([None] * len(df))

    if has_psgc:
        clean_df["psgc"] = df[matched_fields["psgc"]].fillna("").astype(str).str.strip()
    else:
        clean_df["psgc"] = ""

    invalid_barangay = (
        clean_df["barangay_raw"].isna()
        | clean_df["barangay_raw"].astype(str).str.strip().eq("")
        | clean_df["barangay_raw"].astype(str).str.strip().str.lower().isin(["nan", "none", "nat"])
    )

    invalid_population = clean_df["population"].isna() | (clean_df["population"] < 0)

    if has_year:
        year_has_value = ~year_raw.apply(has_invalid_text)
        invalid_year = year_has_value & (
            clean_df["year"].isna()
            | (clean_df["year"] < 1900)
            | (clean_df["year"] > 2100)
        )
    else:
        invalid_year = pd.Series([False] * len(clean_df), index=clean_df.index)

    duplicate_key = clean_df["barangay_key"].fillna("").astype(str) + "-" + clean_df["year"].fillna("no-year").astype(str)
    duplicate_rows = duplicate_key.duplicated(keep="first") & ~invalid_barangay & ~invalid_population & ~invalid_year
    invalid_rows = invalid_barangay | invalid_population | invalid_year | duplicate_rows

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

    clean_df["validation_status"] = [build_reason(index) for index in range(len(clean_df))]

    valid_df = clean_df[~invalid_rows].copy()
    valid_df["population"] = valid_df["population"].apply(convert_optional_int)
    valid_df["year"] = valid_df["year"].apply(convert_optional_int)

    valid_df = valid_df[POPULATION_STANDARD_SCHEMA]
    invalid_preview_df = clean_df[invalid_rows].copy()[POPULATION_STANDARD_SCHEMA]

    validation_summary = {
        "invalid_barangay_rows": int(invalid_barangay.sum()),
        "invalid_population_rows": int(invalid_population.sum()),
        "invalid_year_rows": int(invalid_year.sum()),
        "duplicate_barangay_rows": int(duplicate_rows.sum()),
        "normalized_barangay_count": int(valid_df["barangay_key"].nunique()) if not valid_df.empty else 0,
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

    cleaned_records = make_json_safe_records(valid_df)
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
        "cleaned_records": cleaned_records,
        "cleaned_preview": cleaned_preview,
        "invalid_preview": invalid_preview,
    }
