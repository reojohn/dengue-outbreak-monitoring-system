from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import text

from app.database import engine
from app.services.barangay_normalizer import normalize_barangay_key

MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

MONTH_SHORT_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def _month_name(month: int | None) -> str:
    if not month or month < 1 or month > 12:
        return ""
    return MONTH_NAMES[month - 1]


def _month_short_name(month: int | None) -> str:
    if not month or month < 1 or month > 12:
        return ""
    return MONTH_SHORT_NAMES[month - 1]


def _get_latest_completed_run(connection):
    return connection.execute(
        text(
            """
            select integration_run_id, dengue_upload_id, created_at
            from public.integration_runs
            where status = 'completed'
            order by created_at desc, integration_run_id desc
            limit 1
            """
        )
    ).mappings().first()


def _get_barangays_for_run(connection, integration_run_id) -> list[dict[str, str]]:
    rows = connection.execute(
        text(
            """
            select
                barangay_key,
                min(barangay) as barangay
            from public.integrated_dataset_rows
            where integration_run_id = :integration_run_id
              and barangay_key is not null
              and trim(barangay_key) <> ''
              and barangay is not null
              and trim(barangay) <> ''
              and year is not null
              and month between 1 and 12
              and coalesce(barangay_match_status, '') in ('psgc_matched', 'exact_matched', 'auto_matched')
            group by barangay_key
            order by min(barangay)
            """
        ),
        {"integration_run_id": integration_run_id},
    ).mappings().all()

    return [
        {
            "barangay": str(row["barangay"] or "").strip(),
            "barangay_key": str(row["barangay_key"] or "").strip(),
        }
        for row in rows
        if str(row["barangay"] or "").strip()
    ]


def _resolve_barangay(barangays: list[dict[str, str]], requested_barangay: str) -> dict[str, str] | None:
    requested_key = normalize_barangay_key(requested_barangay)
    if not requested_key:
        return None

    for item in barangays:
        if normalize_barangay_key(item.get("barangay_key") or "") == requested_key:
            return item

    for item in barangays:
        if normalize_barangay_key(item.get("barangay") or "") == requested_key:
            return item

    # Small alias tolerance for names such as "Baan KM 3" vs "Baan Km. 3".
    for item in barangays:
        candidate_key = normalize_barangay_key(item.get("barangay") or item.get("barangay_key") or "")
        if candidate_key and (candidate_key in requested_key or requested_key in candidate_key):
            return item

    return None


def _find_barangay_for_run(connection, integration_run_id, requested_barangay: str) -> dict[str, str] | None:
    requested_key = normalize_barangay_key(requested_barangay)
    if not requested_key:
        return None

    direct = connection.execute(
        text(
            """
            select
                barangay_key,
                min(barangay) as barangay
            from public.integrated_dataset_rows
            where integration_run_id = :integration_run_id
              and barangay_key = :barangay_key
              and year is not null
              and month between 1 and 12
              and coalesce(barangay_match_status, '') in ('psgc_matched', 'exact_matched', 'auto_matched')
            group by barangay_key
            limit 1
            """
        ),
        {
            "integration_run_id": integration_run_id,
            "barangay_key": requested_key,
        },
    ).mappings().first()

    if direct:
        return {
            "barangay": str(direct["barangay"] or requested_barangay).strip(),
            "barangay_key": str(direct["barangay_key"] or requested_key).strip(),
        }

    # Fallback is intentionally rare and only used for naming aliases. The normal
    # path queries one barangay key directly so the analytics endpoint stays light.
    return _resolve_barangay(
        _get_barangays_for_run(connection, integration_run_id),
        requested_barangay,
    )


def _empty_case_classification(scope_label: str = "", note: str = "") -> dict[str, Any]:
    return {
        "available": False,
        "scope_label": scope_label,
        "record_count": 0,
        "confirmed_available": False,
        "probable_available": False,
        "suspected_available": False,
        "confirmed_cases": None,
        "probable_cases": None,
        "suspected_cases": None,
        "classified_total": None,
        "reported_total": None,
        "unclassified_cases": None,
        "classification_matches_total": None,
        "source_note": note or "Confirmed, probable, and suspected case fields are not available for this period.",
    }


def _get_case_classification(
    connection,
    *,
    dengue_upload_id: Any,
    barangay_key: str,
    year: int | None,
    quarter: int | None,
    month: int | None,
    scope_label: str,
) -> dict[str, Any]:
    """Aggregate case classifications inside PostgreSQL from the cleaned dengue payload.

    The source payload already contains the official DOH confirmed/probable/suspect
    fields when the uploaded workbook provides them. Querying the JSONB array in
    PostgreSQL keeps the browser response tiny and avoids downloading the full
    dengue source into React merely to calculate a comparison.
    """
    if not dengue_upload_id or not barangay_key or year is None:
        return _empty_case_classification(
            scope_label,
            "Case classification is not available for the current integrated dataset.",
        )

    result = connection.execute(
        text(
            """
            with dengue_source as (
                select payload
                from public.dataset_source_payloads
                where dataset_type = 'dengue'
                  and upload_id = cast(:dengue_upload_id as uuid)
                limit 1
            ),
            source_records as (
                select record
                from dengue_source
                cross join lateral jsonb_array_elements(
                    case
                        when jsonb_typeof(payload->'records') = 'array' then payload->'records'
                        else '[]'::jsonb
                    end
                ) as item(record)
            ),
            parsed as (
                select
                    record,
                    case
                        when coalesce(record->>'year', '') ~ '^[0-9]+([.][0-9]+)?$'
                        then round((record->>'year')::numeric)::integer
                        else null
                    end as record_year,
                    case
                        when coalesce(record->>'month', '') ~ '^[0-9]+([.][0-9]+)?$'
                        then round((record->>'month')::numeric)::integer
                        else null
                    end as record_month
                from source_records
                where coalesce(record->>'barangay_key', '') = :barangay_key
            ),
            scoped as (
                select record
                from parsed
                where record_year = cast(:year as integer)
                  and (cast(:month as integer) is null or record_month = cast(:month as integer))
                  and (
                      cast(:quarter as integer) is null
                      or record_month between ((cast(:quarter as integer) - 1) * 3 + 1) and ((cast(:quarter as integer) - 1) * 3 + 3)
                  )
            )
            select
                count(*)::bigint as record_count,
                coalesce(bool_or(
                    coalesce(record->>'confirmed_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_confirmed_values,
                coalesce(bool_or(
                    coalesce(record->>'probable_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_probable_values,
                coalesce(bool_or(
                    coalesce(record->>'suspect_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_suspected_values,
                coalesce(sum(
                    case
                        when coalesce(record->>'confirmed_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'confirmed_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as confirmed_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'probable_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'probable_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as probable_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'suspect_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'suspect_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as suspected_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as reported_total
            from scoped
            """
        ),
        {
            "dengue_upload_id": dengue_upload_id,
            "barangay_key": barangay_key,
            "year": year,
            "quarter": quarter,
            "month": month,
        },
    ).mappings().first()

    confirmed_available = bool(result.get("has_confirmed_values")) if result else False
    probable_available = bool(result.get("has_probable_values")) if result else False
    suspected_available = bool(result.get("has_suspected_values")) if result else False
    any_classification_available = confirmed_available or probable_available or suspected_available

    if not result or not any_classification_available:
        return _empty_case_classification(
            scope_label,
            "The current dengue source does not contain confirmed, probable, and suspected case fields for this selected period. No values are estimated.",
        )

    confirmed = int(result.get("confirmed_cases") or 0) if confirmed_available else None
    probable = int(result.get("probable_cases") or 0) if probable_available else None
    suspected = int(result.get("suspected_cases") or 0) if suspected_available else None
    reported_total = int(result.get("reported_total") or 0)
    classified_total = sum(
        value for value in (confirmed, probable, suspected) if value is not None
    )
    unclassified_cases = max(0, reported_total - classified_total)

    unavailable_labels = [
        label
        for label, is_available in (
            ("confirmed", confirmed_available),
            ("probable", probable_available),
            ("suspected", suspected_available),
        )
        if not is_available
    ]
    if unavailable_labels:
        unavailable_text = ", ".join(unavailable_labels)
        source_note = (
            "Official case classifications from the current cleaned dengue source. "
            f"The following classification field(s) are not separately reported for this selected period: {unavailable_text}. "
            "N/A is shown instead of treating missing source fields as zero."
        )
    else:
        source_note = "Official case classifications from the current cleaned dengue source. These are recorded cases, not forecast values."

    return {
        "available": True,
        "scope_label": scope_label,
        "record_count": int(result.get("record_count") or 0),
        "confirmed_available": confirmed_available,
        "probable_available": probable_available,
        "suspected_available": suspected_available,
        "confirmed_cases": confirmed,
        "probable_cases": probable,
        "suspected_cases": suspected,
        "classified_total": classified_total,
        "reported_total": reported_total,
        "unclassified_cases": unclassified_cases,
        "classification_matches_total": classified_total == reported_total,
        "source_note": source_note,
    }



def _get_city_case_classification(
    connection,
    *,
    dengue_upload_id: Any,
    year: int | None,
    quarter: int | None,
    month: int | None,
    scope_label: str,
) -> dict[str, Any]:
    """Aggregate official case classifications citywide for export/report review.

    This is intentionally opt-in from the city-trends endpoint so normal
    dashboard trend loading stays lightweight. The aggregation happens inside
    PostgreSQL; raw dengue rows are never sent to the browser.
    """
    if not dengue_upload_id or year is None:
        return _empty_case_classification(
            scope_label,
            "Citywide case classification is not available for the current integrated dataset.",
        )

    result = connection.execute(
        text(
            """
            with dengue_source as (
                select payload
                from public.dataset_source_payloads
                where dataset_type = 'dengue'
                  and upload_id = cast(:dengue_upload_id as uuid)
                limit 1
            ),
            source_records as (
                select record
                from dengue_source
                cross join lateral jsonb_array_elements(
                    case
                        when jsonb_typeof(payload->'records') = 'array' then payload->'records'
                        else '[]'::jsonb
                    end
                ) as item(record)
            ),
            parsed as (
                select
                    record,
                    case
                        when coalesce(record->>'year', '') ~ '^[0-9]+([.][0-9]+)?$'
                        then round((record->>'year')::numeric)::integer
                        else null
                    end as record_year,
                    case
                        when coalesce(record->>'month', '') ~ '^[0-9]+([.][0-9]+)?$'
                        then round((record->>'month')::numeric)::integer
                        else null
                    end as record_month
                from source_records
            ),
            scoped as (
                select record
                from parsed
                where record_year = cast(:year as integer)
                  and (cast(:month as integer) is null or record_month = cast(:month as integer))
                  and (
                      cast(:quarter as integer) is null
                      or record_month between ((cast(:quarter as integer) - 1) * 3 + 1) and ((cast(:quarter as integer) - 1) * 3 + 3)
                  )
            )
            select
                count(*)::bigint as record_count,
                coalesce(bool_or(
                    coalesce(record->>'confirmed_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_confirmed_values,
                coalesce(bool_or(
                    coalesce(record->>'probable_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_probable_values,
                coalesce(bool_or(
                    coalesce(record->>'suspect_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                ), false) as has_suspected_values,
                coalesce(sum(
                    case
                        when coalesce(record->>'confirmed_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'confirmed_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as confirmed_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'probable_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'probable_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as probable_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'suspect_cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'suspect_cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as suspected_cases,
                coalesce(sum(
                    case
                        when coalesce(record->>'cases', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                        then round((record->>'cases')::numeric)::bigint
                        else 0
                    end
                ), 0)::bigint as reported_total
            from scoped
            """
        ),
        {
            "dengue_upload_id": dengue_upload_id,
            "year": year,
            "quarter": quarter,
            "month": month,
        },
    ).mappings().first()

    confirmed_available = bool(result.get("has_confirmed_values")) if result else False
    probable_available = bool(result.get("has_probable_values")) if result else False
    suspected_available = bool(result.get("has_suspected_values")) if result else False
    any_classification_available = confirmed_available or probable_available or suspected_available

    if not result or not any_classification_available:
        return _empty_case_classification(
            scope_label,
            "The current dengue source does not separately report confirmed, probable, or suspected cases for this selected period. N/A is shown instead of zero.",
        )

    confirmed = int(result.get("confirmed_cases") or 0) if confirmed_available else None
    probable = int(result.get("probable_cases") or 0) if probable_available else None
    suspected = int(result.get("suspected_cases") or 0) if suspected_available else None
    reported_total = int(result.get("reported_total") or 0)
    classified_total = sum(value for value in (confirmed, probable, suspected) if value is not None)

    unavailable_labels = [
        label
        for label, available in (
            ("confirmed", confirmed_available),
            ("probable", probable_available),
            ("suspected", suspected_available),
        )
        if not available
    ]
    source_note = "Official citywide case classifications from the current cleaned dengue source."
    if unavailable_labels:
        source_note += (
            " The following classification field(s) are not separately reported for this period: "
            + ", ".join(unavailable_labels)
            + ". N/A is shown instead of treating missing source fields as zero."
        )

    return {
        "available": True,
        "scope_label": scope_label,
        "record_count": int(result.get("record_count") or 0),
        "confirmed_available": confirmed_available,
        "probable_available": probable_available,
        "suspected_available": suspected_available,
        "confirmed_cases": confirmed,
        "probable_cases": probable,
        "suspected_cases": suspected,
        "classified_total": classified_total,
        "reported_total": reported_total,
        "unclassified_cases": max(0, reported_total - classified_total),
        "classification_matches_total": classified_total == reported_total,
        "source_note": source_note,
    }


def _period_key(year: int, month: int) -> tuple[int, int]:
    return int(year), int(month)


def _previous_period(year: int, month: int) -> tuple[int, int]:
    if month <= 1:
        return year - 1, 12
    return year, month - 1


def _format_scope(year: int, quarter: int | None, month: int | None) -> str:
    if month:
        return f"{_month_name(month)} {year}"
    if quarter:
        return f"Q{quarter} {year}"
    return str(year)


def _trend_direction(current_cases: int, previous_cases: int | None) -> str:
    if previous_cases is None:
        return "No comparison"
    if current_cases > previous_cases:
        return "Increasing"
    if current_cases < previous_cases:
        return "Decreasing"
    return "Stable"


def _movement_details(current_row: dict[str, Any] | None, previous_row: dict[str, Any] | None) -> dict[str, Any]:
    if not current_row:
        return {
            "direction": "No comparison",
            "current_period": None,
            "current_cases": None,
            "previous_period": None,
            "previous_cases": None,
            "change_cases": None,
            "change_percent": None,
            "change_label": "No monthly comparison is available.",
        }

    current_cases = int(current_row.get("cases") or 0)
    previous_cases = int(previous_row.get("cases") or 0) if previous_row else None
    direction = _trend_direction(current_cases, previous_cases)

    current_period = f"{_month_name(current_row['month'])} {current_row['year']}"
    previous_period = (
        f"{_month_name(previous_row['month'])} {previous_row['year']}"
        if previous_row
        else None
    )

    if previous_cases is None:
        change_cases = None
        change_percent = None
        change_label = "No previous month is available for comparison."
    else:
        change_cases = current_cases - previous_cases
        if previous_cases > 0:
            change_percent = round((change_cases / previous_cases) * 100, 1)
            sign = "+" if change_percent > 0 else ""
            change_label = f"{sign}{change_percent:g}% vs {previous_period}"
        elif current_cases > 0:
            change_percent = None
            change_label = f"Increased from 0 to {current_cases} cases vs {previous_period}"
        else:
            change_percent = 0.0
            change_label = f"No change vs {previous_period}"

    return {
        "direction": direction,
        "current_period": current_period,
        "current_cases": current_cases,
        "previous_period": previous_period,
        "previous_cases": previous_cases,
        "change_cases": change_cases,
        "change_percent": change_percent,
        "change_label": change_label,
    }


def _find_peak_month(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None

    max_cases = max(int(row.get("cases") or 0) for row in rows)
    if max_cases <= 0:
        return None

    tied = [row for row in rows if int(row.get("cases") or 0) == max_cases]
    first = tied[0]
    return {
        "month": int(first["month"]),
        "month_label": _month_name(int(first["month"])),
        "cases": max_cases,
        "tied_months": [
            {
                "month": int(row["month"]),
                "month_label": _month_name(int(row["month"])),
                "cases": max_cases,
            }
            for row in tied
        ],
    }


def _find_lowest_month(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None

    min_cases = min(int(row.get("cases") or 0) for row in rows)
    tied = [row for row in rows if int(row.get("cases") or 0) == min_cases]
    first = tied[0]
    return {
        "month": int(first["month"]),
        "month_label": _month_name(int(first["month"])),
        "cases": min_cases,
        "tied_months": [
            {
                "month": int(row["month"]),
                "month_label": _month_name(int(row["month"])),
                "cases": min_cases,
            }
            for row in tied
        ],
    }


def _build_historical_peak(all_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not all_rows:
        return None

    totals = defaultdict(int)
    years_seen = defaultdict(set)

    for row in all_rows:
        month = int(row["month"])
        year = int(row["year"])
        totals[month] += int(row.get("cases") or 0)
        years_seen[month].add(year)

    candidates = []
    for month in range(1, 13):
        years = years_seen.get(month) or set()
        if not years:
            continue
        total_cases = totals.get(month, 0)
        average_cases = total_cases / len(years)
        candidates.append(
            {
                "month": month,
                "month_label": _month_name(month),
                "total_cases": total_cases,
                "average_cases": round(average_cases, 2),
                "years_observed": len(years),
            }
        )

    if not candidates or max(item["total_cases"] for item in candidates) <= 0:
        return None

    candidates.sort(key=lambda item: (-item["average_cases"], item["month"]))
    return candidates[0]


def _build_interpretation(
    *,
    barangay: str,
    scope_label: str,
    total_cases: int,
    peak_month: dict[str, Any] | None,
    historical_peak: dict[str, Any] | None,
    movement: dict[str, Any],
) -> str:
    if total_cases <= 0:
        return (
            f"No dengue cases were recorded for {barangay} during {scope_label}. "
            "Continue routine surveillance and update the records when new reports are received."
        )

    sentences = [f"{barangay} recorded {total_cases} dengue case{'s' if total_cases != 1 else ''} during {scope_label}."]

    if peak_month:
        peak_cases = int(peak_month.get("cases") or 0)
        sentences.append(
            f"{peak_month['month_label']} had the highest recorded cases during {scope_label}, with {peak_cases} case{'s' if peak_cases != 1 else ''}."
        )

    if historical_peak:
        sentences.append(
            f"Based on past records, dengue cases are usually highest in {historical_peak['month_label']}."
        )

    direction = movement.get("direction")
    current_period = movement.get("current_period")
    current_cases = movement.get("current_cases")
    previous_period = movement.get("previous_period")
    previous_cases = movement.get("previous_cases")

    if current_period and previous_period and previous_cases is not None:
        if direction == "Increasing":
            sentences.append(
                f"The latest monthly count increased from {previous_cases} in {previous_period} to {current_cases} in {current_period}."
            )
        elif direction == "Decreasing":
            sentences.append(
                f"The latest monthly count decreased from {previous_cases} in {previous_period} to {current_cases} in {current_period}."
            )
        else:
            sentences.append(
                f"The latest monthly count stayed at {current_cases} cases from {previous_period} to {current_period}."
            )

    return " ".join(sentences)


def _build_trend_payload(
    *,
    barangay: str,
    barangay_key: str,
    integration_run_id: str,
    integration_created_at: Any,
    all_rows: list[dict[str, Any]],
    requested_year: int | None = None,
    quarter: int | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    clean_rows = [
        {
            "year": int(row["year"]),
            "month": int(row["month"]),
            "cases": int(row.get("cases") or 0),
        }
        for row in all_rows
        if row.get("year") is not None and row.get("month") is not None
    ]
    clean_rows.sort(key=lambda row: (row["year"], row["month"]))

    available_years = sorted({row["year"] for row in clean_rows}, reverse=True)
    selected_year = requested_year if requested_year in available_years else (available_years[0] if available_years else None)

    if selected_year is None:
        return {
            "has_data": False,
            "barangay": barangay,
            "barangay_key": barangay_key,
            "integration_run_id": integration_run_id,
            "integration_created_at": str(integration_created_at or ""),
            "filters": {
                "year": None,
                "quarter": quarter,
                "month": month,
                "available_years": [],
            },
            "summary": {},
            "monthly": [],
            "quarterly": [],
            "annual": [],
            "historical_peak": None,
            "interpretation": "No monthly dengue trend records are available for this barangay.",
        }

    year_rows = [row for row in clean_rows if row["year"] == selected_year]

    selected_rows = year_rows
    if month:
        selected_rows = [row for row in year_rows if row["month"] == month]
    elif quarter:
        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2
        selected_rows = [row for row in year_rows if start_month <= row["month"] <= end_month]

    monthly_lookup = {
        _period_key(row["year"], row["month"]): row
        for row in clean_rows
    }

    current_row = selected_rows[-1] if selected_rows else None
    previous_row = None
    if current_row:
        previous_key = _previous_period(current_row["year"], current_row["month"])
        previous_row = monthly_lookup.get(previous_key)

    movement = _movement_details(current_row, previous_row)
    total_cases = sum(int(row.get("cases") or 0) for row in selected_rows)
    peak_month = _find_peak_month(selected_rows)
    lowest_month = _find_lowest_month(selected_rows)
    historical_peak = _build_historical_peak(clean_rows)
    scope_label = _format_scope(selected_year, quarter, month)

    monthly_payload = [
        {
            "year": row["year"],
            "month": row["month"],
            "month_label": _month_name(row["month"]),
            "month_short": _month_short_name(row["month"]),
            "period": f"{row['year']:04d}-{row['month']:02d}",
            "cases": int(row.get("cases") or 0),
        }
        for row in selected_rows
    ]

    quarterly_payload = []
    for quarter_number in range(1, 5):
        start_month = (quarter_number - 1) * 3 + 1
        end_month = start_month + 2
        quarter_rows = [row for row in year_rows if start_month <= row["month"] <= end_month]
        quarterly_payload.append(
            {
                "quarter": quarter_number,
                "label": f"Q{quarter_number}",
                "cases": sum(int(row.get("cases") or 0) for row in quarter_rows),
            }
        )

    annual_totals = defaultdict(int)
    for row in clean_rows:
        annual_totals[row["year"]] += int(row.get("cases") or 0)
    annual_payload = [
        {"year": year_value, "cases": annual_totals[year_value]}
        for year_value in sorted(annual_totals)
    ]

    return {
        "has_data": bool(selected_rows),
        "barangay": barangay,
        "barangay_key": barangay_key,
        "integration_run_id": integration_run_id,
        "integration_created_at": str(integration_created_at or ""),
        "filters": {
            "year": selected_year,
            "requested_year": requested_year,
            "requested_year_available": requested_year is None or requested_year == selected_year,
            "quarter": quarter,
            "month": month,
            "scope_label": scope_label,
            "available_years": available_years,
        },
        "summary": {
            "total_cases": total_cases,
            "peak_month": peak_month,
            "lowest_month": lowest_month,
            "trend_direction": movement["direction"],
            "latest_period": movement["current_period"],
            "latest_cases": movement["current_cases"],
            "previous_period": movement["previous_period"],
            "previous_cases": movement["previous_cases"],
            "change_cases": movement["change_cases"],
            "change_percent": movement["change_percent"],
            "change_label": movement["change_label"],
        },
        "monthly": monthly_payload,
        "quarterly": quarterly_payload,
        "annual": annual_payload,
        "historical_peak": historical_peak,
        "interpretation": _build_interpretation(
            barangay=barangay,
            scope_label=scope_label,
            total_cases=total_cases,
            peak_month=peak_month,
            historical_peak=historical_peak,
            movement=movement,
        ),
    }


def get_trend_barangays(scope_barangay: str | None = None) -> dict[str, Any]:
    with engine.connect() as connection:
        latest_run = _get_latest_completed_run(connection)
        if not latest_run:
            return {
                "has_saved_dataset": False,
                "integration_run_id": None,
                "barangays": [],
            }

        barangays = _get_barangays_for_run(connection, latest_run["integration_run_id"])

    if scope_barangay:
        resolved = _resolve_barangay(barangays, scope_barangay)
        barangays = [resolved] if resolved else []

    return {
        "has_saved_dataset": True,
        "integration_run_id": str(latest_run["integration_run_id"]),
        "integration_created_at": str(latest_run["created_at"] or ""),
        "barangays": barangays,
    }


def get_barangay_trend_analytics(
    *,
    barangay: str,
    year: int | None = None,
    quarter: int | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    with engine.connect() as connection:
        latest_run = _get_latest_completed_run(connection)
        if not latest_run:
            return {
                "has_data": False,
                "has_saved_dataset": False,
                "barangay": barangay,
                "filters": {"year": None, "quarter": quarter, "month": month, "available_years": []},
                "summary": {},
                "monthly": [],
                "quarterly": [],
                "annual": [],
                "historical_peak": None,
                "case_classification": _empty_case_classification(
                    "",
                    "No saved integrated dengue dataset is available for case classification.",
                ),
                "interpretation": "No saved integrated dengue dataset is available yet.",
            }

        resolved = _find_barangay_for_run(
            connection,
            latest_run["integration_run_id"],
            barangay,
        )
        if not resolved:
            return {
                "has_data": False,
                "has_saved_dataset": True,
                "barangay": barangay,
                "filters": {"year": None, "quarter": quarter, "month": month, "available_years": []},
                "summary": {},
                "monthly": [],
                "quarterly": [],
                "annual": [],
                "historical_peak": None,
                "case_classification": _empty_case_classification(
                    "",
                    "No dengue records were found for this barangay, so case classification is unavailable.",
                ),
                "interpretation": "No monthly dengue trend records were found for the selected barangay.",
            }

        rows = connection.execute(
            text(
                """
                select
                    year,
                    month,
                    sum(coalesce(cases, 0))::bigint as cases
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                  and barangay_key = :barangay_key
                  and year is not null
                  and month between 1 and 12
                group by year, month
                order by year, month
                """
            ),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "barangay_key": resolved["barangay_key"],
            },
        ).mappings().all()

        payload = _build_trend_payload(
            barangay=resolved["barangay"],
            barangay_key=resolved["barangay_key"],
            integration_run_id=str(latest_run["integration_run_id"]),
            integration_created_at=latest_run["created_at"],
            all_rows=[dict(row) for row in rows],
            requested_year=year,
            quarter=quarter,
            month=month,
        )

        resolved_year = payload.get("filters", {}).get("year")
        scope_label = str(payload.get("filters", {}).get("scope_label") or "")
        payload["case_classification"] = _get_case_classification(
            connection,
            dengue_upload_id=latest_run.get("dengue_upload_id"),
            barangay_key=resolved["barangay_key"],
            year=resolved_year,
            quarter=quarter,
            month=month,
            scope_label=scope_label,
        )

    payload["has_saved_dataset"] = True
    return payload

def get_city_trend_analytics(
    *,
    year: int | None = None,
    quarter: int | None = None,
    month: int | None = None,
    include_classification: bool = False,
) -> dict[str, Any]:
    """Return lightweight citywide actual-case trend analytics.

    PostgreSQL aggregates the saved integrated rows by month before anything is
    returned to the frontend, keeping the response small and avoiding raw-row
    downloads for dashboard/report trend views.
    """
    with engine.connect() as connection:
        latest_run = _get_latest_completed_run(connection)
        if not latest_run:
            return {
                "has_data": False,
                "has_saved_dataset": False,
                "scope": "citywide",
                "barangay": "Butuan City",
                "filters": {"year": None, "quarter": quarter, "month": month, "available_years": []},
                "summary": {},
                "monthly": [],
                "quarterly": [],
                "annual": [],
                "historical_peak": None,
                "interpretation": "No saved integrated dengue dataset is available yet.",
                "case_classification": _empty_case_classification("", "No saved integrated dengue dataset is available yet.") if include_classification else None,
            }

        rows = connection.execute(
            text(
                """
                select
                    year,
                    month,
                    sum(coalesce(cases, 0))::bigint as cases
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                  and year is not null
                  and month between 1 and 12
                  and coalesce(barangay_match_status, '') in ('psgc_matched', 'exact_matched', 'auto_matched')
                group by year, month
                order by year, month
                """
            ),
            {"integration_run_id": latest_run["integration_run_id"]},
        ).mappings().all()

        payload = _build_trend_payload(
            barangay="Butuan City",
            barangay_key="butuan_city",
            integration_run_id=str(latest_run["integration_run_id"]),
            integration_created_at=latest_run["created_at"],
            all_rows=[dict(row) for row in rows],
            requested_year=year,
            quarter=quarter,
            month=month,
        )
        payload["scope"] = "citywide"
        payload["has_saved_dataset"] = True
        if include_classification:
            payload["case_classification"] = _get_city_case_classification(
                connection,
                dengue_upload_id=latest_run.get("dengue_upload_id"),
                year=payload.get("filters", {}).get("year"),
                quarter=quarter,
                month=month,
                scope_label=payload.get("filters", {}).get("scope_label") or "",
            )
        return payload

