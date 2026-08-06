"""Parser for DOH Butuan City monthly dengue summary workbooks.

The official FOI workbook is a human-readable report rather than a conventional
row-based dataset. This module detects that layout and converts it into the same
standard rows consumed by the existing dengue cleaning and forecasting pipeline.
It is intentionally separate from the adaptive parser so existing upload formats
remain backward compatible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import re

import pandas as pd


YEAR_HEADING_RE = re.compile(r"\bdengue\s+((?:19|20)\d{2})\b", re.IGNORECASE)
MONTH_LOOKUP = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
UNKNOWN_LOCATION_NAMES = {
    "unknown",
    "unknown barangay",
    "unspecified",
    "not specified",
    "not available",
    "n/a",
    "na",
    "none",
    "null",
    "(blank)",
    "blank",
}


@dataclass(frozen=True)
class ReportBlock:
    year: int
    year_row: int
    header_row: int
    start_column: int
    end_row: int
    fields: dict[str, int]


def _clean_text(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    text = str(value).replace("\ufeff", "").strip()

    # Repair common Excel mojibake without changing already-correct Unicode.
    if any(marker in text for marker in ("Ã", "Â", "â€")):
        try:
            repaired = text.encode("latin-1").decode("utf-8")
            if repaired:
                text = repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass

    return re.sub(r"\s+", " ", text).strip()


def _key(value: Any) -> str:
    text = _clean_text(value).lower()
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", text)


def _number(value: Any) -> int | None:
    text = _clean_text(value).replace(",", "")
    if not text:
        return None

    try:
        number = float(text)
    except (TypeError, ValueError):
        return None

    if pd.isna(number):
        return None

    return int(round(number))


def _month_number(value: Any) -> int | None:
    return MONTH_LOOKUP.get(_clean_text(value).lower())


def _find_year_headings(raw_df: pd.DataFrame) -> list[tuple[int, int, int]]:
    headings: list[tuple[int, int, int]] = []

    for row_index in range(len(raw_df)):
        for column_index in range(len(raw_df.columns)):
            text = _clean_text(raw_df.iat[row_index, column_index])
            match = YEAR_HEADING_RE.search(text)
            if match:
                headings.append((row_index, column_index, int(match.group(1))))

    return headings


def _find_header_row(raw_df: pd.DataFrame, year_row: int, start_column: int) -> tuple[int, dict[str, int]] | None:
    for row_index in range(year_row + 1, min(year_row + 15, len(raw_df))):
        first_key = _key(raw_df.iat[row_index, start_column])
        if "barangaymonthreported" not in first_key and not (
            "barangay" in first_key and "month" in first_key
        ):
            continue

        fields: dict[str, int] = {"barangay": start_column}
        scan_end = min(start_column + 7, len(raw_df.columns))

        for column_index in range(start_column + 1, scan_end):
            header_key = _key(raw_df.iat[row_index, column_index])
            if not header_key:
                continue
            if "confirmed" in header_key:
                fields["confirmed_cases"] = column_index
            elif "probable" in header_key:
                fields["probable_cases"] = column_index
            elif "suspect" in header_key:
                fields["suspect_cases"] = column_index
            elif "grandtotal" in header_key or header_key == "total":
                fields["cases"] = column_index

        if "cases" in fields:
            return row_index, fields

    return None


def _build_blocks(raw_df: pd.DataFrame) -> list[ReportBlock]:
    headings = _find_year_headings(raw_df)
    blocks: list[ReportBlock] = []

    for position, (year_row, start_column, year) in enumerate(headings):
        header_result = _find_header_row(raw_df, year_row, start_column)
        if not header_result:
            continue

        header_row, fields = header_result
        later_same_column_rows = [
            row
            for row, column, _ in headings[position + 1 :]
            if column == start_column and row > year_row
        ]
        end_row = min(later_same_column_rows) if later_same_column_rows else len(raw_df)

        blocks.append(
            ReportBlock(
                year=year,
                year_row=year_row,
                header_row=header_row,
                start_column=start_column,
                end_row=end_row,
                fields=fields,
            )
        )

    return blocks


def _parse_sheet(sheet_name: str, raw_df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]] | None:
    raw_df = raw_df.dropna(how="all").reset_index(drop=True)
    blocks = _build_blocks(raw_df)
    if not blocks:
        return None

    records: list[dict[str, Any]] = []
    monthly_reported_totals: dict[tuple[int, int], int] = {}
    annual_reported_totals: dict[int, int] = {}

    for block in blocks:
        current_month: int | None = None

        for row_index in range(block.header_row + 1, block.end_row):
            label = _clean_text(raw_df.iat[row_index, block.fields["barangay"]])
            label_key = _key(label)

            if not label:
                continue

            if YEAR_HEADING_RE.search(label):
                break

            month = _month_number(label)
            cases = _number(raw_df.iat[row_index, block.fields["cases"]])

            if month is not None:
                current_month = month
                if cases is not None:
                    monthly_reported_totals[(block.year, month)] = cases
                continue

            if label_key in {"grandtotal", "total"}:
                if cases is not None:
                    annual_reported_totals[block.year] = cases
                continue

            if "barangaymonthreported" in label_key:
                continue

            if current_month is None or cases is None or cases < 0:
                continue

            normalized_location = label.lower()
            location_status = (
                "unknown_or_blank"
                if not normalized_location or normalized_location in UNKNOWN_LOCATION_NAMES
                else "barangay_reported"
            )

            record = {
                "barangay": label,
                "year": block.year,
                "month": current_month,
                "cases": cases,
                "deaths": pd.NA,
                "confirmed_cases": _number(raw_df.iat[row_index, block.fields["confirmed_cases"]])
                if "confirmed_cases" in block.fields
                else None,
                "probable_cases": _number(raw_df.iat[row_index, block.fields["probable_cases"]])
                if "probable_cases" in block.fields
                else None,
                "suspect_cases": _number(raw_df.iat[row_index, block.fields["suspect_cases"]])
                if "suspect_cases" in block.fields
                else None,
                "reported_monthly_total": monthly_reported_totals.get((block.year, current_month)),
                "source_format": "doh_monthly_summary",
                "temporal_granularity": "monthly",
                "death_data_status": "not_provided",
                "location_status": location_status,
                "source_sheet": sheet_name,
            }
            records.append(record)

    if not records:
        return None

    parsed_df = pd.DataFrame(records)
    calculated_totals = (
        parsed_df.groupby(["year", "month"], dropna=False)["cases"].sum().to_dict()
    )

    discrepancies = []
    for (year, month), reported_total in sorted(monthly_reported_totals.items()):
        calculated_total = int(calculated_totals.get((year, month), 0))
        difference = calculated_total - int(reported_total)
        if difference != 0:
            discrepancies.append(
                {
                    "year": int(year),
                    "month": int(month),
                    "reported_total": int(reported_total),
                    "calculated_barangay_total": calculated_total,
                    "difference": difference,
                    "status": "needs_review",
                }
            )

    difference_lookup = {
        (item["year"], item["month"]): item["difference"]
        for item in discrepancies
    }
    parsed_df["monthly_total_difference"] = parsed_df.apply(
        lambda row: difference_lookup.get((int(row["year"]), int(row["month"])), 0),
        axis=1,
    )

    years = sorted(int(value) for value in parsed_df["year"].dropna().unique())
    periods = sorted(
        f"{int(year):04d}-{int(month):02d}"
        for year, month in parsed_df[["year", "month"]].drop_duplicates().itertuples(index=False, name=None)
    )
    unknown_mask = parsed_df["location_status"].eq("unknown_or_blank")

    metadata = {
        "dataset_type": "likely_dengue_dataset",
        "readiness": "ready_for_cleaning",
        "source_format": "doh_monthly_summary",
        "source_agency": "Department of Health",
        "source_sheet": sheet_name,
        "temporal_granularity": "monthly",
        "forecast_period_unit": "month",
        "forecast_horizon_periods": 4,
        "forecast_horizon_label": "Next 4 months",
        "case_measure": "Grand Total",
        "death_data_status": "not_provided",
        "matched_fields": {
            "barangay": "Barangay/Month Reported",
            "year": "Dengue YEAR Butuan City heading",
            "month": "Month heading",
            "cases": "Grand Total",
        },
        "missing_required_fields": [],
        "confidence_score": 100,
        "detection_method": "doh_monthly_report_parser",
        "mapping_summary": (
            "barangay → Barangay/Month Reported, year → report heading, "
            "month → month heading, cases → Grand Total"
        ),
        "coverage_start": periods[0] if periods else "",
        "coverage_end": periods[-1] if periods else "",
        "year_count": len(years),
        "years": years,
        "monthly_period_count": len(periods),
        "extracted_record_count": int(len(parsed_df)),
        "unknown_location_record_count": int(unknown_mask.sum()),
        "unknown_location_case_count": int(parsed_df.loc[unknown_mask, "cases"].sum()),
        "monthly_total_discrepancy_count": len(discrepancies),
        "monthly_total_discrepancies": discrepancies,
        "annual_reported_totals": {
            str(year): total for year, total in sorted(annual_reported_totals.items())
        },
        "zero_fill_applied": False,
        "zero_fill_note": (
            "Barangay-month rows absent from the DOH report were not invented or automatically filled with zero."
        ),
    }

    parsed_df.attrs["source_metadata"] = metadata
    return parsed_df, metadata


def detect_and_parse_doh_dengue_workbook(
    workbook: dict[str, pd.DataFrame],
) -> tuple[pd.DataFrame, dict[str, Any]] | None:
    """Return the best DOH monthly report extraction, or ``None``.

    A workbook is recognized only when a sheet has both a dengue year heading
    and the DOH report headers. If more than one sheet contains overlapping
    layouts, the sheet with the widest year/month coverage is selected so cases
    are not double-counted.
    """

    candidates: list[tuple[tuple[int, int, int], pd.DataFrame, dict[str, Any]]] = []

    for sheet_name, raw_df in workbook.items():
        parsed = _parse_sheet(str(sheet_name), raw_df)
        if not parsed:
            continue

        parsed_df, metadata = parsed
        score = (
            int(metadata.get("year_count", 0)),
            int(metadata.get("monthly_period_count", 0)),
            int(metadata.get("extracted_record_count", 0)),
        )
        candidates.append((score, parsed_df, metadata))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, parsed_df, metadata = candidates[0]
    metadata = dict(metadata)
    metadata["available_report_sheets"] = [
        candidate_metadata.get("source_sheet", "")
        for _, _, candidate_metadata in candidates
    ]
    metadata["duplicate_sheet_policy"] = (
        "Only the sheet with the widest non-overlapping coverage was imported to prevent double-counting."
    )
    parsed_df.attrs["source_metadata"] = metadata
    return parsed_df, metadata
