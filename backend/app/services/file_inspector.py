from io import BytesIO
from pathlib import Path
import csv
import json
import re

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
        "bgy",
        "barangay_name",
        "brgy_name",
        "bgy_name",
        "name_of_barangay",
        "barangay_of_residence",
        "residence_barangay",
        "residence_brgy",
        "address_barangay",
        "address_brgy",
        "patient_barangay",
        "patient_brgy",
        "case_barangay",
        "case_brgy",
        "home_barangay",
        "home_brgy",
        "municipality_barangay",
        "city_barangay",
        "village",
        "location",
        "locality",
        "area",
        "place",
        "adm4_name",
        "adm4_ref_name",
        "adm4_en",
        "name",
    ],
    "date": [
        "date",
        "reporting_date",
        "reported_date",
        "report_date",
        "case_date",
        "onset_date",
        "date_of_onset",
        "date_reported",
        "date_admitted",
        "admission_date",
        "consultation_date",
        "morbidity_date",
        "surveillance_date",
        "notification_date",
        "period",
        "reporting_period",
        "week_start",
        "week_ending",
        "week_end",
    ],
    "year": [
        "year",
        "yr",
        "report_year",
        "reporting_year",
        "morbidity_year",
        "epi_year",
        "epidemiological_year",
    ],
    "month": [
        "month",
        "mo",
        "mn",
        "report_month",
        "reporting_month",
        "morbidity_month",
        "case_month",
    ],
    "week": [
        "week",
        "wk",
        "week_no",
        "week_num",
        "week_number",
        "epi_week",
        "ep_week",
        "epidemiological_week",
        "epidemiologic_week",
        "morbidity_week",
        "mw",
        "reporting_week",
        "case_week",
    ],
    "cases": [
        "cases",
        "case",
        "case_count",
        "dengue_cases",
        "dengue_case_count",
        "no_of_cases",
        "no._of_cases",
        "number_of_cases",
        "num_cases",
        "total_cases",
        "total_case_count",
        "historical_total_cases",
        "confirmed_cases",
        "confirmed_dengue_cases",
        "reported_cases",
        "reported_dengue_cases",
        "suspected_cases",
        "suspected_dengue_cases",
        "positive_cases",
        "morbidity_cases",
        "admitted_cases",
        "admissions",
        "count",
        "total",
    ],
    "deaths": [
        "deaths",
        "death",
        "death_count",
        "dengue_deaths",
        "no_of_deaths",
        "no._of_deaths",
        "number_of_deaths",
        "num_deaths",
        "total_deaths",
        "fatalities",
        "fatality",
        "mortality",
        "died",
    ],
}

DENGUE_STANDARD_SCHEMA = [
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

GENERIC_HEADER_FRAGMENTS = [
    "barangay",
    "brgy",
    "bgy",
    "residence",
    "location",
    "village",
    "date",
    "period",
    "year",
    "month",
    "week",
    "morbidity",
    "epi",
    "case",
    "confirmed",
    "reported",
    "suspected",
    "death",
    "fatal",
    "rain",
    "precip",
    "temperature",
    "temp",
    "humidity",
    "population",
]

FIELD_SCORE_THRESHOLDS = {
    "barangay": 42,
    "date": 46,
    "year": 46,
    "month": 46,
    "week": 46,
    "cases": 46,
    "deaths": 42,
}

DENGUE_FIELD_KEYWORDS = {
    "barangay": [
        "barangay", "brgy", "bgy", "village", "residence", "address",
        "locality", "location", "adm4", "casebarangay", "homebarangay",
    ],
    "date": [
        "date", "report", "reported", "reporting", "onset", "admission",
        "admitted", "consultation", "notification", "period", "surveillance",
    ],
    "year": ["year", "yr"],
    "month": ["month", "mo", "mn"],
    "week": ["week", "wk", "epi", "epidemiologic", "epidemiological", "morbidity", "mw"],
    "cases": [
        "case", "cases", "confirmed", "reported", "suspected", "positive",
        "morbidity", "admission", "admitted", "dengue", "count", "total",
    ],
    "deaths": ["death", "deaths", "fatal", "fatality", "fatalities", "mortality", "died"],
}

DENGUE_FIELD_NEGATIVE_KEYWORDS = {
    "barangay": ["case", "count", "total", "year", "month", "week", "date", "death", "population", "area_sq"],
    "date": ["case", "count", "death", "barangay", "population", "rain", "temp", "humidity", "month", "year"],
    "year": ["case", "count", "death", "barangay", "month", "week", "rain", "temp", "humidity"],
    "month": ["case", "count", "death", "barangay", "year", "week", "rain", "temp", "humidity"],
    "week": ["case", "count", "death", "barangay", "year", "month", "rain", "temp", "humidity"],
    "cases": ["death", "fatal", "mortality", "year", "month", "week", "date", "population", "rain", "temp", "humidity"],
    "deaths": ["case_count", "cases", "barangay", "year", "month", "week", "date", "population", "rain", "temp", "humidity"],
}


def normalize_column_name(column_name: str) -> str:
    return (
        str(column_name)
        .replace("\ufeff", "")
        .strip()
        .lower()
        .replace("%", "percent")
        .replace("&", " and ")
        .replace("+", " plus ")
        .replace("/", "_")
        .replace("-", "_")
        .replace(".", "_")
        .replace(" ", "_")
        .replace("(", "_")
        .replace(")", "_")
    )


def compact_column_name(column_name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_column_name(column_name))


def tokenize_column_name(column_name: str) -> set[str]:
    normalized = normalize_column_name(column_name)
    compact = compact_column_name(column_name)
    tokens = set(filter(None, re.split(r"[^a-z0-9]+", normalized)))
    if compact:
        tokens.add(compact)
    return tokens


def clean_column_name(column_name: str) -> str:
    normalized = normalize_column_name(column_name)
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    return re.sub(r"_+", "_", normalized).strip("_")


def make_unique_columns(columns) -> list[str]:
    seen: dict[str, int] = {}
    unique_columns = []

    for index, column in enumerate(columns):
        base = str(column).strip() if str(column).strip() else f"column_{index + 1}"
        count = seen.get(base, 0)
        seen[base] = count + 1
        unique_columns.append(base if count == 0 else f"{base}_{count + 1}")

    return unique_columns


def score_possible_header_row(values) -> float:
    score = 0.0
    non_empty_values = [str(value).strip() for value in values if str(value).strip()]

    if len(non_empty_values) < 2:
        return 0.0

    alias_set = {
        clean_column_name(alias)
        for aliases in DENGUE_FIELD_ALIASES.values()
        for alias in aliases
    }

    for value in non_empty_values:
        normalized = clean_column_name(value)
        compact = compact_column_name(value)

        if normalized in alias_set or compact in alias_set:
            score += 5
            continue

        for fragment in GENERIC_HEADER_FRAGMENTS:
            fragment_key = compact_column_name(fragment)
            if fragment_key and fragment_key in compact:
                score += 1.25
                break

        if re.search(r"[a-zA-Z]", str(value)):
            score += 0.2

        if re.fullmatch(r"\d+(\.\d+)?", str(value).strip()):
            score -= 0.4

    return score


def dataframe_from_raw_rows(raw_df: pd.DataFrame) -> pd.DataFrame:
    if raw_df.empty:
        return raw_df

    raw_df = raw_df.dropna(how="all")
    if raw_df.empty:
        return raw_df

    header_limit = min(30, len(raw_df))
    best_header_index = 0
    best_header_score = 0.0

    for offset in range(header_limit):
        score = score_possible_header_row(raw_df.iloc[offset].tolist())
        if score > best_header_score:
            best_header_index = offset
            best_header_score = score

    if best_header_score < 2:
        best_header_index = 0

    columns = make_unique_columns(raw_df.iloc[best_header_index].fillna("").tolist())
    df = raw_df.iloc[best_header_index + 1 :].copy()
    df.columns = columns
    df = df.dropna(how="all")
    df = df.loc[:, [str(column).strip() != "" for column in df.columns]]
    df = df.reset_index(drop=True)

    return df


def read_json_records(content: bytes):
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except UnicodeDecodeError:
        payload = json.loads(content.decode("latin-1"))

    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        for key in ["records", "data", "rows", "items", "features"]:
            value = payload.get(key)
            if isinstance(value, list):
                if key == "features":
                    return [item.get("properties", item) for item in value if isinstance(item, dict)]
                return value

    raise HTTPException(
        status_code=400,
        detail="JSON file must contain a list of records or a records/data array.",
    )



def decode_text_content(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def detect_text_delimiter(text: str) -> str:
    lines = [line for line in text.splitlines() if line.strip()][:50]
    delimiters = [",", ";", "\t"]

    def delimiter_score(delimiter: str) -> int:
        return sum(line.count(delimiter) for line in lines)

    best_delimiter = max(delimiters, key=delimiter_score)
    return best_delimiter if delimiter_score(best_delimiter) > 0 else ","


def read_csv_content_to_raw_dataframe(content: bytes) -> pd.DataFrame:
    text = decode_text_content(content)
    delimiter = detect_text_delimiter(text)
    rows = [row for row in csv.reader(text.splitlines(), delimiter=delimiter)]
    rows = [row for row in rows if any(str(cell).strip() for cell in row)]

    if not rows:
        return pd.DataFrame()

    max_columns = max(len(row) for row in rows)
    padded_rows = [row + [""] * (max_columns - len(row)) for row in rows]

    return pd.DataFrame(padded_rows)


def non_empty_sample(df: pd.DataFrame | None, column, limit: int = 250) -> pd.Series:
    if df is None or column not in df.columns:
        return pd.Series(dtype="object")

    sample = df[column].dropna().head(limit)
    if sample.empty:
        return sample

    text_sample = sample.astype(str).str.strip()
    usable_mask = ~text_sample.str.lower().isin(["", "nan", "none", "nat", "null"])
    return sample[usable_mask]


def numeric_ratio(sample: pd.Series) -> float:
    if sample.empty:
        return 0.0

    cleaned = sample.astype(str).str.replace(",", "", regex=False).str.replace("%", "", regex=False).str.strip()
    numeric = pd.to_numeric(cleaned, errors="coerce")
    return float(numeric.notna().mean())


def numeric_values(sample: pd.Series) -> pd.Series:
    if sample.empty:
        return pd.Series(dtype="float64")

    cleaned = sample.astype(str).str.replace(",", "", regex=False).str.replace("%", "", regex=False).str.strip()
    return pd.to_numeric(cleaned, errors="coerce")


def year_like_ratio(sample: pd.Series) -> float:
    values = numeric_values(sample)
    if values.empty:
        return 0.0

    return float(((values >= 1990) & (values <= 2100)).mean())


def bounded_integer_ratio(sample: pd.Series, minimum: int, maximum: int) -> float:
    values = numeric_values(sample)
    if values.empty:
        return 0.0

    rounded = values.dropna()
    if rounded.empty:
        return 0.0

    integer_like = (rounded % 1 == 0)
    in_range = (rounded >= minimum) & (rounded <= maximum)
    return float((integer_like & in_range).mean())


def month_name_ratio(sample: pd.Series) -> float:
    if sample.empty:
        return 0.0

    month_pattern = re.compile(
        r"^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$",
        re.IGNORECASE,
    )
    values = sample.astype(str).str.strip()
    return float(values.apply(lambda value: bool(month_pattern.match(value))).mean())


def date_like_ratio(sample: pd.Series) -> float:
    if sample.empty:
        return 0.0

    def is_date_like(value) -> bool:
        if isinstance(value, pd.Timestamp):
            return not pd.isna(value)

        raw = str(value).strip()
        if not raw or raw.lower() in ["nan", "none", "nat", "null"]:
            return False

        if re.match(r"^\d{4}\s*-?\s*w\d{1,2}$", raw, flags=re.IGNORECASE):
            return True

        if re.match(r"^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$", raw):
            return True

        if re.match(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$", raw):
            return True

        if re.match(r"^\d{8}$", raw):
            return True

        if re.search(
            r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b",
            raw,
            flags=re.IGNORECASE,
        ):
            return bool(re.search(r"\d{2,4}", raw))

        number = pd.to_numeric(pd.Series([raw]), errors="coerce").iloc[0]
        if pd.notna(number) and 20000 <= float(number) <= 60000:
            return True

        if any(separator in raw for separator in ["-", "/", ","]):
            parsed = pd.to_datetime(pd.Series([raw]), errors="coerce").iloc[0]
            return not pd.isna(parsed)

        return False

    return float(sample.apply(is_date_like).mean())


def text_ratio(sample: pd.Series) -> float:
    if sample.empty:
        return 0.0

    values = sample.astype(str).str.strip()
    text_like = values.apply(lambda value: bool(re.search(r"[A-Za-z]", value)))
    return float(text_like.mean())


def score_dengue_column(field: str, column, df: pd.DataFrame | None = None) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    normalized = clean_column_name(column)
    compact = compact_column_name(column)
    aliases = [clean_column_name(alias) for alias in DENGUE_FIELD_ALIASES.get(field, [])]
    compact_aliases = [compact_column_name(alias) for alias in DENGUE_FIELD_ALIASES.get(field, [])]

    if normalized in aliases or compact in compact_aliases:
        score += 95
        reasons.append("exact alias match")

    column_tokens = tokenize_column_name(column)

    for alias in aliases:
        alias_compact = compact_column_name(alias)
        if (
            alias
            and alias != normalized
            and len(alias_compact) >= 4
            and (alias in normalized or normalized in alias)
        ):
            score += 32
            reasons.append(f"name resembles {alias}")
            break

    for keyword in DENGUE_FIELD_KEYWORDS.get(field, []):
        key = compact_column_name(keyword)
        if not key:
            continue

        if len(key) <= 3:
            matched_keyword = key in column_tokens
        else:
            matched_keyword = key in compact

        if matched_keyword:
            score += 18
            reasons.append(f"name contains {keyword}")

    for negative in DENGUE_FIELD_NEGATIVE_KEYWORDS.get(field, []):
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
                reasons.append("values look like place names")
            if unique_count >= 2:
                score += min(18, unique_count * 1.2)
                reasons.append("multiple unique barangay-like values")

        if field == "date":
            ratio = date_like_ratio(sample)
            if ratio >= 0.65:
                score += 48
                reasons.append("values look like dates or periods")
            elif ratio >= 0.35:
                score += 24
                reasons.append("some values look like dates or periods")

        if field == "year":
            ratio = year_like_ratio(sample)
            if ratio >= 0.75:
                score += 46
                reasons.append("values look like years")
            elif ratio >= 0.45:
                score += 22
                reasons.append("some values look like years")

        if field == "month":
            numeric_month_ratio = bounded_integer_ratio(sample, 1, 12)
            named_month_ratio = month_name_ratio(sample)
            ratio = max(numeric_month_ratio, named_month_ratio)
            if ratio >= 0.75:
                score += 44
                reasons.append("values look like months")
            elif ratio >= 0.45:
                score += 20
                reasons.append("some values look like months")

        if field == "week":
            ratio = bounded_integer_ratio(sample, 1, 53)
            if ratio >= 0.75:
                score += 44
                reasons.append("values look like epidemiological weeks")
            elif ratio >= 0.45:
                score += 20
                reasons.append("some values look like epidemiological weeks")

        if field == "cases":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty and (values >= 0).mean() >= 0.98:
                score += 38
                reasons.append("values are non-negative case counts")
            if not values.empty and values.max() > 53:
                score += 10
                reasons.append("values are larger than week/month ranges")

        if field == "deaths":
            ratio = numeric_ratio(sample)
            values = numeric_values(sample).dropna()
            if ratio >= 0.75 and not values.empty and (values >= 0).mean() >= 0.98:
                score += 32
                reasons.append("values are non-negative death counts")

    return score, reasons[:5]


def detect_dengue_columns(columns, df: pd.DataFrame | None = None):
    columns = list(columns)
    used_columns = set()
    matched_fields = {}
    field_confidence = {}
    field_detection_details = {}
    field_candidates = {}

    for field in DENGUE_FIELD_ALIASES:
        candidates = []

        for column in columns:
            score, reasons = score_dengue_column(field, column, df)
            candidates.append({
                "column": column,
                "score": round(max(score, 0), 2),
                "reasons": reasons,
            })

        candidates.sort(key=lambda item: item["score"], reverse=True)
        field_candidates[field] = candidates[:5]

    # Required fields are selected first. Optional deaths is selected last so it
    # cannot steal a numeric case column when no death column exists.
    selection_order = ["barangay", "cases", "date", "year", "week", "month", "deaths"]

    for field in selection_order:
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

    has_barangay = "barangay" in matched_fields
    has_cases = "cases" in matched_fields
    has_date = "date" in matched_fields
    has_year = "year" in matched_fields
    has_month = "month" in matched_fields
    has_week = "week" in matched_fields
    has_time_field = has_date or (has_year and (has_month or has_week))

    missing_required_fields = []

    if not has_barangay:
        missing_required_fields.append("barangay")

    if not has_cases:
        missing_required_fields.append("cases")

    if not has_time_field:
        missing_required_fields.append("date/year + month/week")

    required_confidences = [
        field_confidence[field]
        for field in ["barangay", "cases"]
        if field in field_confidence
    ]

    if has_time_field:
        if has_date:
            required_confidences.append(field_confidence.get("date", 0))
        else:
            required_confidences.extend([
                field_confidence.get("year", 0),
                max(field_confidence.get("month", 0), field_confidence.get("week", 0)),
            ])

    mapping_confidence = int(round(sum(required_confidences) / len(required_confidences))) if required_confidences else 0

    if has_barangay and has_cases and has_time_field:
        dataset_type = "likely_dengue_dataset"
        readiness = "ready_for_cleaning"
    elif has_barangay or has_cases or has_time_field:
        dataset_type = "possible_dengue_dataset"
        readiness = "needs_field_review"
    else:
        dataset_type = "unknown_or_report_file"
        readiness = "not_ready_for_dengue_import"

    mapping_summary = ", ".join(
        f"{field} → {column}"
        for field, column in matched_fields.items()
    )

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
        "standard_schema": DENGUE_STANDARD_SCHEMA,
    }


async def read_tabular_file(file: UploadFile):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if extension == ".csv":
            raw_df = read_csv_content_to_raw_dataframe(content)
            df = dataframe_from_raw_rows(raw_df)
            file_type = "csv"

        elif extension in [".xlsx", ".xls"]:
            workbook = pd.read_excel(
                BytesIO(content),
                sheet_name=None,
                header=None,
                dtype=object,
            )

            if not workbook:
                raise HTTPException(status_code=400, detail="Excel file does not contain readable sheets.")

            scored_sheets = []
            for sheet_name, raw_df in workbook.items():
                raw_df = raw_df.dropna(how="all")
                sheet_score = 0.0
                for offset in range(min(30, len(raw_df))):
                    sheet_score += score_possible_header_row(raw_df.iloc[offset].tolist())

                scored_sheets.append((sheet_score, sheet_name, raw_df))

            scored_sheets.sort(key=lambda item: item[0], reverse=True)
            _, selected_sheet_name, selected_raw_df = scored_sheets[0]
            df = dataframe_from_raw_rows(selected_raw_df)
            file_type = f"excel:{selected_sheet_name}"

        elif extension == ".json":
            records = read_json_records(content)
            df = pd.DataFrame(records)
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
            detail=f"Could not read file. Error: {str(error)}",
        )

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file does not contain readable rows.")

    return df, file_type, filename



async def inspect_tabular_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

    preview = df.head(5).fillna("").astype(str).to_dict(orient="records")

    missing_values = {
        column: int(df[column].isna().sum())
        for column in df.columns
    }

    dengue_detection = detect_dengue_columns(df.columns, df)

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


MONTH_NAME_LOOKUP = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_numeric_value(value):
    if not has_usable_value(value):
        return pd.NA

    cleaned = str(value).replace(",", "").replace("%", "").strip()
    return pd.to_numeric(cleaned, errors="coerce")


def parse_year_value(value):
    if not has_usable_value(value):
        return pd.NA

    number = parse_numeric_value(value)
    if pd.notna(number):
        return number

    match = re.search(r"(19|20)\d{2}", str(value))
    return int(match.group(0)) if match else pd.NA


def parse_month_value(value):
    if not has_usable_value(value):
        return pd.NA

    number = parse_numeric_value(value)
    if pd.notna(number):
        return number

    normalized = re.sub(r"[^a-z]", "", str(value).strip().lower())
    return MONTH_NAME_LOOKUP.get(normalized, pd.NA)


def parse_week_value(value):
    if not has_usable_value(value):
        return pd.NA

    number = parse_numeric_value(value)
    if pd.notna(number):
        return number

    match = re.search(r"\d{1,2}", str(value))
    return int(match.group(0)) if match else pd.NA


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
    dengue_detection = detect_dengue_columns(df.columns, df)

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
        clean_df["year"] = df[matched_fields["year"]].apply(parse_year_value)

        if has_month:
            clean_df["month"] = df[matched_fields["month"]].apply(parse_month_value)
        else:
            clean_df["month"] = pd.NA

        if has_week:
            clean_df["week"] = df[matched_fields["week"]].apply(parse_week_value)
        else:
            clean_df["week"] = pd.NA

    clean_df["cases"] = df[matched_fields["cases"]].apply(parse_numeric_value)

    if "deaths" in matched_fields:
        clean_df["deaths"] = df[matched_fields["deaths"]].apply(parse_numeric_value)
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


def build_clean_dengue_result_from_dataframe(
    df: pd.DataFrame,
    *,
    file_type: str = "",
    filename: str = "dengue_dataset",
    prepared: dict | None = None,
):
    """Build the cleaned dengue payload from an already-read dataframe.

    This lets the upload endpoint read and clean a large historical file once,
    then reuse the same cleaned dataframe for forecasting. Previously the
    dengue upload path read and cleaned the same large file twice, which made
    defense demos feel slow.
    """
    prepared = prepared or prepare_clean_dengue_dataframe(df)

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


async def clean_dengue_file(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)
    return build_clean_dengue_result_from_dataframe(
        df,
        file_type=file_type,
        filename=filename,
    )


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