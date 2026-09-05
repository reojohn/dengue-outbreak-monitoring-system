import re
from typing import Any

from sqlalchemy import text

from app.database import engine


def _extract_year(value: Any) -> int | None:
    """Extract a sane four-digit year from persisted coverage metadata."""
    if value is None:
        return None

    match = re.search(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)", str(value))
    if not match:
        return None

    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def get_public_system_summary() -> dict:
    """Return only the tiny, non-sensitive dataset coverage used by the public site.

    The range is anchored to the latest *completed integration run*. This means a
    newly uploaded dengue file does not change the public website until that
    upload has successfully passed the system's integration workflow.
    """
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                select
                    coalesce(
                        nullif(dengue.detection_result->>'coverage_start', ''),
                        nullif(dengue.validation_summary->>'coverage_start', '')
                    ) as coverage_start,
                    coalesce(
                        nullif(dengue.detection_result->>'coverage_end', ''),
                        nullif(dengue.validation_summary->>'coverage_end', '')
                    ) as coverage_end,
                    integration.created_at
                from public.integration_runs integration
                left join public.dataset_uploads dengue
                    on dengue.upload_id = integration.dengue_upload_id
                where integration.status = 'completed'
                order by integration.created_at desc, integration.integration_run_id desc
                limit 1
                """
            )
        ).mappings().first()

        if not row:
            return {
                "has_integrated_data": False,
                "historical_dengue": {
                    "start_year": None,
                    "end_year": None,
                    "range_label": "",
                },
                "last_updated": None,
            }

        start_year = _extract_year(row.get("coverage_start"))
        end_year = _extract_year(row.get("coverage_end"))

        # Older saved upload rows may not contain coverage metadata. Fall back to
        # the integrated rows for the same latest run without exposing any row data.
        if start_year is None or end_year is None:
            fallback = connection.execute(
                text(
                    """
                    select
                        min(rows.report_date) as coverage_start,
                        max(rows.report_date) as coverage_end
                    from public.integrated_dataset_rows rows
                    where rows.integration_run_id = (
                        select integration_run_id
                        from public.integration_runs
                        where status = 'completed'
                        order by created_at desc, integration_run_id desc
                        limit 1
                    )
                    """
                )
            ).mappings().first()

            start_year = start_year or _extract_year(fallback.get("coverage_start") if fallback else None)
            end_year = end_year or _extract_year(fallback.get("coverage_end") if fallback else None)

        range_label = ""
        if start_year and end_year:
            range_label = str(start_year) if start_year == end_year else f"{start_year}\u2013{end_year}"

        created_at = row.get("created_at")

        return {
            "has_integrated_data": bool(range_label),
            "historical_dengue": {
                "start_year": start_year,
                "end_year": end_year,
                "range_label": range_label,
            },
            "last_updated": created_at.isoformat() if hasattr(created_at, "isoformat") else (str(created_at) if created_at else None),
        }
