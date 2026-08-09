"""Helpers for determining the reporting cadence of dengue time-series data.

A monthly record may still contain an ISO week derived from its date.  The
presence of a non-null week column alone therefore cannot be used to classify
an entire dataset as weekly.  These helpers prioritize explicit source
metadata, then inspect period labels and the actual spacing of unique reporting
periods.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd


_MONTH_PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_WEEK_PERIOD = re.compile(r"^\d{4}-W(0?[1-9]|[1-4]\d|5[0-3])$", re.IGNORECASE)


def _metadata_result(unit: str, reason: str) -> dict[str, Any]:
    monthly = unit == "month"
    return {
        "temporal_granularity": "monthly" if monthly else "weekly",
        "forecast_period_unit": unit,
        "forecast_horizon_periods": 4,
        "forecast_horizon_label": "4-month forecast after latest available data" if monthly else "4-week forecast after latest available data",
        "granularity_detection_reason": reason,
    }


def _explicit_unit(source_metadata: dict | None) -> str:
    metadata = source_metadata or {}
    raw_unit = str(metadata.get("forecast_period_unit") or "").strip().lower()
    raw_granularity = str(metadata.get("temporal_granularity") or "").strip().lower()

    if raw_unit.startswith("month") or "month" in raw_granularity:
        return "month"
    if raw_unit.startswith("week") or "week" in raw_granularity:
        return "week"
    return ""


def _series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(dtype="object")
    return frame[column]


def _unique_observation_dates(frame: pd.DataFrame) -> pd.DatetimeIndex:
    candidates: list[pd.Series] = []

    for column in ("date", "report_date"):
        values = _series(frame, column)
        if not values.empty:
            parsed = pd.to_datetime(values, errors="coerce")
            if parsed.notna().any():
                candidates.append(parsed)

    period_values = _series(frame, "period")
    if not period_values.empty:
        period_text = period_values.fillna("").astype(str).str.strip()
        # ISO week labels are intentionally excluded from ordinary date parsing.
        non_week_periods = period_text.mask(period_text.str.match(_WEEK_PERIOD))
        parsed_periods = pd.to_datetime(non_week_periods, errors="coerce")
        if parsed_periods.notna().any():
            candidates.append(parsed_periods)

    if not candidates:
        return pd.DatetimeIndex([])

    combined = pd.concat(candidates, ignore_index=True).dropna().drop_duplicates().sort_values()
    return pd.DatetimeIndex(combined)


def _cadence_from_dates(dates: pd.DatetimeIndex) -> str:
    if len(dates) < 3:
        return ""

    day_gaps = pd.Series(dates[1:] - dates[:-1]).dt.days
    day_gaps = day_gaps[(day_gaps > 0) & (day_gaps <= 120)]
    if day_gaps.empty:
        return ""

    weekly_share = float(day_gaps.between(5, 10).mean())
    monthly_mask = (
        day_gaps.between(24, 35)
        | day_gaps.between(52, 70)  # one missing monthly report
        | day_gaps.between(80, 100)  # two missing monthly reports
    )
    monthly_share = float(monthly_mask.mean())
    median_gap = float(day_gaps.median())

    if weekly_share >= 0.60 or 5 <= median_gap <= 10:
        return "week"
    if monthly_share >= 0.60 or 24 <= median_gap <= 35:
        return "month"
    return ""


def _cadence_from_period_density(frame: pd.DataFrame) -> str:
    year_values = pd.to_numeric(_series(frame, "year"), errors="coerce")
    if year_values.empty or not year_values.notna().any():
        return ""

    period_values = _series(frame, "period")
    if period_values.empty:
        # Build a stable per-row period key from the available calendar fields.
        month_values = pd.to_numeric(_series(frame, "month"), errors="coerce")
        week_values = pd.to_numeric(_series(frame, "week"), errors="coerce")
        period_values = pd.Series(
            [
                f"{int(year)}-{int(month) if pd.notna(month) else 0}-{int(week) if pd.notna(week) else 0}"
                if pd.notna(year)
                else ""
                for year, month, week in zip(year_values, month_values, week_values)
            ],
            index=frame.index,
        )

    density_frame = pd.DataFrame({
        "year": year_values,
        "period": period_values.fillna("").astype(str),
    }).dropna(subset=["year"])

    if density_frame.empty:
        return ""

    counts = density_frame.groupby("year")["period"].nunique()
    if counts.empty:
        return ""

    median_periods_per_year = float(counts.median())
    if median_periods_per_year <= 14:
        return "month"
    if median_periods_per_year >= 20:
        return "week"
    return ""


def infer_forecast_period_metadata(
    frame: pd.DataFrame,
    source_metadata: dict | None = None,
) -> dict[str, Any]:
    """Return monthly/weekly metadata using cadence-aware detection.

    Explicit parser metadata wins.  Otherwise, exact period labels and actual
    reporting intervals are used before falling back to field availability.
    """
    explicit = _explicit_unit(source_metadata)
    if explicit:
        return _metadata_result(explicit, "explicit source metadata")

    working = frame if isinstance(frame, pd.DataFrame) else pd.DataFrame(frame or [])
    if working.empty:
        return _metadata_result("month", "empty dataset default")

    period_values = _series(working, "period").fillna("").astype(str).str.strip()
    non_empty_periods = period_values[period_values.ne("")]
    if not non_empty_periods.empty:
        monthly_ratio = float(non_empty_periods.str.match(_MONTH_PERIOD).mean())
        weekly_ratio = float(non_empty_periods.str.match(_WEEK_PERIOD).mean())
        if monthly_ratio >= 0.80:
            return _metadata_result("month", "monthly period labels")
        if weekly_ratio >= 0.80:
            return _metadata_result("week", "weekly period labels")

    date_cadence = _cadence_from_dates(_unique_observation_dates(working))
    if date_cadence:
        return _metadata_result(date_cadence, "observed reporting interval")

    density_cadence = _cadence_from_period_density(working)
    if density_cadence:
        return _metadata_result(density_cadence, "reporting periods per year")

    week_values = pd.to_numeric(_series(working, "week"), errors="coerce")
    month_values = pd.to_numeric(_series(working, "month"), errors="coerce")
    has_week = bool(week_values.notna().any()) if not week_values.empty else False
    has_month = bool(month_values.notna().any()) if not month_values.empty else False

    if has_month and not has_week:
        return _metadata_result("month", "month field without week field")
    if has_week and not has_month:
        return _metadata_result("week", "week field without month field")

    # When both are populated, month is the safer fallback because dates create
    # both fields automatically, while the actual row cadence may still be monthly.
    if has_month:
        return _metadata_result("month", "month-aware fallback")

    return _metadata_result("week", "week-aware fallback")


def build_leakage_safe_chronological_split(
    frame: pd.DataFrame,
    *,
    period_unit: str,
    train_ratio: float = 0.8,
    leakage_guard_periods: int = 4,
    year_column: str = "year",
    month_column: str = "month",
    week_column: str = "week",
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Split forecast-origin rows by complete reporting periods without target leakage.

    The direct multi-step models use targets up to ``t + leakage_guard_periods``.
    Rows immediately before the holdout therefore cannot be used for evaluation
    training, because their targets would reach into the test era. Those origin
    periods are placed in a small embargo gap. The final selected model may still
    be refit on all model-ready rows after unbiased model comparison is complete.
    """
    working = frame.copy()
    if working.empty:
        raise ValueError("Cannot split an empty model dataframe.")

    unit = "week" if str(period_unit or "").lower().startswith("week") else "month"
    year_values = pd.to_numeric(working.get(year_column), errors="coerce")
    period_values = pd.to_numeric(
        working.get(week_column if unit == "week" else month_column),
        errors="coerce",
    )

    working = working.assign(
        __split_year=year_values,
        __split_period=period_values,
    ).dropna(subset=["__split_year", "__split_period"])

    if working.empty:
        raise ValueError("No valid reporting periods were available for chronological splitting.")

    working["__split_year"] = working["__split_year"].astype(int)
    working["__split_period"] = working["__split_period"].astype(int)
    working = working.sort_values(["__split_year", "__split_period"])

    unique_periods = sorted(
        {
            (int(year), int(period))
            for year, period in working[["__split_year", "__split_period"]].itertuples(index=False, name=None)
        }
    )

    minimum_periods = max(leakage_guard_periods + 3, 8)
    if len(unique_periods) < minimum_periods:
        raise ValueError(
            f"At least {minimum_periods} complete reporting periods are required for leakage-safe evaluation; "
            f"found {len(unique_periods)}."
        )

    requested_split = int(len(unique_periods) * float(train_ratio))
    split_position = max(leakage_guard_periods + 1, requested_split)
    split_position = min(split_position, len(unique_periods) - 1)

    train_period_end_position = split_position - leakage_guard_periods - 1
    if train_period_end_position < 0:
        raise ValueError("Not enough pre-holdout periods remain after applying the leakage guard.")

    train_periods = set(unique_periods[: train_period_end_position + 1])
    embargo_periods = set(unique_periods[train_period_end_position + 1 : split_position])
    test_periods = set(unique_periods[split_position:])

    period_pairs = list(zip(working["__split_year"], working["__split_period"]))
    train_mask = [pair in train_periods for pair in period_pairs]
    test_mask = [pair in test_periods for pair in period_pairs]
    embargo_mask = [pair in embargo_periods for pair in period_pairs]

    original_columns = [column for column in working.columns if not column.startswith("__split_")]
    train_df = working.loc[train_mask, original_columns].copy()
    test_df = working.loc[test_mask, original_columns].copy()
    embargoed_row_count = int(sum(embargo_mask))

    if train_df.empty or test_df.empty:
        raise ValueError("The chronological holdout produced an empty training or testing set.")

    def label(period: tuple[int, int] | None) -> str:
        if not period:
            return ""
        year, value = period
        return f"{year:04d}-W{value:02d}" if unit == "week" else f"{year:04d}-{value:02d}"

    metadata = {
        "split_strategy": "chronological_complete_period_holdout",
        "train_ratio_target": float(train_ratio),
        "test_ratio_target": round(1 - float(train_ratio), 4),
        "leakage_guard_periods": int(leakage_guard_periods),
        "embargoed_row_count": embargoed_row_count,
        "train_start_period": label(unique_periods[0]),
        "train_end_period": label(unique_periods[train_period_end_position]),
        "test_start_period": label(unique_periods[split_position]),
        "test_end_period": label(unique_periods[-1]),
        "evaluation_period_count": len(unique_periods),
        "train_period_count": len(train_periods),
        "test_period_count": len(test_periods),
        "embargo_period_count": len(embargo_periods),
    }

    return train_df, test_df, metadata
