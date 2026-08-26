import gzip
import json
import uuid
from threading import Lock
from typing import Any

from sqlalchemy import text

from app.database import engine


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _json_object(value: Any) -> dict:
    """Normalize a JSON/JSONB value into a dictionary."""
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    return {}


def _build_validation_counts(
    dataset_type: str,
    summary: dict | str | None,
    invalid_row_count: int,
    detection: dict | str | None = None,
    original_filename: str = "",
) -> dict:
    """Return tiny, non-overlapping issue counts for the upload workspace.

    The latest upload metadata can span validation_summary and detection_result.
    Older persisted DOH rows sometimes have the source-format / unknown-location
    metadata only in detection_result, so use both sources when rebuilding the
    lightweight status payload. This keeps the 22 unresolved DOH location rows
    in the unresolved bucket instead of reclassifying them as generic invalid
    values after login or refresh.
    """
    summary = _json_object(summary)
    detection = _json_object(detection)

    invalid_total = max(0, _safe_int(invalid_row_count))

    if dataset_type == "dengue":
        explicit_unresolved = max(
            _safe_int(summary.get("invalid_barangay_rows")),
            _safe_int(summary.get("unknown_location_record_count")),
            _safe_int(detection.get("invalid_barangay_rows")),
            _safe_int(detection.get("unknown_location_record_count")),
        )

        source_format = str(
            summary.get("source_format")
            or detection.get("source_format")
            or ""
        ).strip().lower()
        detection_method = str(
            summary.get("detection_method")
            or detection.get("detection_method")
            or ""
        ).strip().lower()
        source_agency = str(
            summary.get("source_agency")
            or detection.get("source_agency")
            or ""
        ).strip().lower()
        filename_key = str(original_filename or "").strip().lower()

        known_other_invalid = (
            max(
                _safe_int(summary.get("invalid_time_rows")),
                _safe_int(detection.get("invalid_time_rows")),
            )
            + max(
                _safe_int(summary.get("invalid_cases_rows")),
                _safe_int(detection.get("invalid_cases_rows")),
            )
            + max(
                _safe_int(summary.get("invalid_deaths_rows")),
                _safe_int(detection.get("invalid_deaths_rows")),
            )
        )

        # Current uploads persist source_format and invalid_barangay_rows.
        # Some older Supabase rows were saved before those metadata fields were
        # persisted, even though the same official DOH FOI workbook had already
        # been validated locally as having unresolved barangay/location rows.
        # Recognize those legacy DOH rows from the remaining stable metadata
        # (or the official FOI filename) so refresh/login does not move the
        # unresolved rows into the generic "Invalid values" bucket.
        looks_like_doh_monthly = any((
            source_format == "doh_monthly_summary",
            detection_method == "doh_monthly_report_parser",
            source_agency == "department of health",
            "foi doh" in filename_key,
        ))

        if explicit_unresolved <= 0 and looks_like_doh_monthly:
            explicit_unresolved = max(0, invalid_total - known_other_invalid)

        unresolved = min(invalid_total, explicit_unresolved)
        duplicate = 0
        other_invalid = max(0, invalid_total - unresolved - duplicate)
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": other_invalid,
            "duplicates": duplicate,
            "source_discrepancies": max(
                _safe_int(summary.get("monthly_total_discrepancy_count")),
                _safe_int(detection.get("monthly_total_discrepancy_count")),
            ),
            "unknown_location_records": max(
                _safe_int(summary.get("unknown_location_record_count")),
                _safe_int(detection.get("unknown_location_record_count")),
            ),
            "unknown_location_cases": max(
                _safe_int(summary.get("unknown_location_case_count")),
                _safe_int(detection.get("unknown_location_case_count")),
            ),
        }

    if dataset_type == "weather":
        duplicates = min(invalid_total, _safe_int(summary.get("duplicate_weather_rows")))
        return {
            "unresolved_or_missing": 0,
            "other_invalid": max(0, invalid_total - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    if dataset_type == "population":
        unresolved = min(invalid_total, _safe_int(summary.get("invalid_barangay_rows")))
        duplicates = min(max(0, invalid_total - unresolved), _safe_int(summary.get("duplicate_barangay_rows")))
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": max(0, invalid_total - unresolved - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    if dataset_type == "boundary":
        unresolved = min(invalid_total, _safe_int(summary.get("missing_barangay_name_rows")))
        duplicates = min(max(0, invalid_total - unresolved), _safe_int(summary.get("duplicate_boundary_rows")))
        return {
            "unresolved_or_missing": unresolved,
            "other_invalid": max(0, invalid_total - unresolved - duplicates),
            "duplicates": duplicates,
            "source_discrepancies": 0,
            "unknown_location_cases": 0,
        }

    return {
        "unresolved_or_missing": 0,
        "other_invalid": invalid_total,
        "duplicates": 0,
        "source_discrepancies": 0,
        "unknown_location_cases": 0,
    }


_DATASET_UPLOADS_SCHEMA_READY = False
_DATASET_UPLOADS_SCHEMA_LOCK = Lock()


def ensure_dataset_uploads_schema() -> None:
    """Create or repair the upload metadata table used by every file type."""
    global _DATASET_UPLOADS_SCHEMA_READY

    if _DATASET_UPLOADS_SCHEMA_READY:
        return

    with _DATASET_UPLOADS_SCHEMA_LOCK:
        if _DATASET_UPLOADS_SCHEMA_READY:
            return

        with engine.begin() as connection:
            connection.execute(
                text("""
                    create table if not exists public.dataset_uploads (
                        upload_id uuid primary key default gen_random_uuid(),
                        dataset_type text not null,
                        original_filename text not null,
                        file_type text not null default '',
                        uploaded_by text not null default 'demo_user',
                        status text not null default 'validated',
                        original_row_count integer not null default 0,
                        valid_row_count integer not null default 0,
                        invalid_row_count integer not null default 0,
                        validation_summary jsonb not null default '{}'::jsonb,
                        detection_result jsonb not null default '{}'::jsonb,
                        error_message text,
                        uploaded_at timestamptz not null default now()
                    )
                """)
            )

            column_statements = [
                "alter table public.dataset_uploads add column if not exists file_type text not null default ''",
                "alter table public.dataset_uploads add column if not exists uploaded_by text not null default 'demo_user'",
                "alter table public.dataset_uploads add column if not exists status text not null default 'validated'",
                "alter table public.dataset_uploads add column if not exists original_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists valid_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists invalid_row_count integer not null default 0",
                "alter table public.dataset_uploads add column if not exists validation_summary jsonb not null default '{}'::jsonb",
                "alter table public.dataset_uploads add column if not exists detection_result jsonb not null default '{}'::jsonb",
                "alter table public.dataset_uploads add column if not exists error_message text",
                "alter table public.dataset_uploads add column if not exists uploaded_at timestamptz not null default now()",
            ]

            for statement in column_statements:
                connection.execute(text(statement))

            connection.execute(
                text("""
                    create index if not exists idx_dataset_uploads_type_uploaded_at
                    on public.dataset_uploads (dataset_type, uploaded_at desc)
                """)
            )

            # Keep only the latest cleaned source payload for each dataset type.
            # Metadata/history stays in dataset_uploads, while this small table
            # lets Render rebuild the integrated dataset after a restart without
            # forcing users to re-upload the other three unchanged sources.
            connection.execute(
                text("""
                    create table if not exists public.dataset_source_payloads (
                        dataset_type text primary key,
                        upload_id uuid not null references public.dataset_uploads(upload_id) on delete cascade,
                        payload jsonb not null default '{}'::jsonb,
                        updated_at timestamptz not null default now()
                    )
                """)
            )

            # Keep the exact current source file for each dataset type so an
            # authorized CHO/Admin user can download it on another computer,
            # correct it in Excel/a compatible editor, and upload it again.
            # Only ONE current source file per dataset type is retained, so old
            # file blobs do not accumulate in the database. Bytes are gzip-
            # compressed before storage and restored exactly when downloaded.
            connection.execute(
                text("""
                    create table if not exists public.dataset_source_files (
                        dataset_type text primary key,
                        upload_id uuid not null references public.dataset_uploads(upload_id) on delete cascade,
                        original_filename text not null,
                        content_type text not null default 'application/octet-stream',
                        size_bytes bigint not null default 0,
                        compressed boolean not null default true,
                        file_bytes bytea not null,
                        updated_at timestamptz not null default now()
                    )
                """)
            )

            source_file_columns = [
                "alter table public.dataset_source_files add column if not exists original_filename text not null default 'source_file'",
                "alter table public.dataset_source_files add column if not exists content_type text not null default 'application/octet-stream'",
                "alter table public.dataset_source_files add column if not exists size_bytes bigint not null default 0",
                "alter table public.dataset_source_files add column if not exists compressed boolean not null default true",
                "alter table public.dataset_source_files add column if not exists file_bytes bytea",
                "alter table public.dataset_source_files add column if not exists updated_at timestamptz not null default now()",
            ]
            for statement in source_file_columns:
                connection.execute(text(statement))

            # Persistent singleton describing the upload cards' current source set.
            # Starting a fresh cycle replaces only this tiny pointer map; historical
            # upload rows, integrations, forecasts, and source payloads remain intact.
            connection.execute(
                text("""
                    create table if not exists public.dataset_upload_cycle_state (
                        singleton_id smallint primary key,
                        cycle_id text not null,
                        mode text not null default 'replacement',
                        source_upload_ids jsonb not null default '{}'::jsonb,
                        started_by text not null default '',
                        started_at timestamptz not null default now(),
                        updated_at timestamptz not null default now(),
                        constraint dataset_upload_cycle_state_singleton check (singleton_id = 1)
                    )
                """)
            )

        _DATASET_UPLOADS_SCHEMA_READY = True


def save_dataset_upload(
    *,
    dataset_type: str,
    original_filename: str,
    file_type: str = "",
    uploaded_by: str = "demo_user",
    status: str = "validated",
    original_row_count: int = 0,
    valid_row_count: int = 0,
    invalid_row_count: int = 0,
    validation_summary: dict | None = None,
    detection_result: dict | None = None,
    error_message: str | None = None,
) -> str:
    ensure_dataset_uploads_schema()

    with engine.begin() as connection:
        result = connection.execute(
            text("""
                insert into public.dataset_uploads (
                    dataset_type,
                    original_filename,
                    file_type,
                    uploaded_by,
                    status,
                    original_row_count,
                    valid_row_count,
                    invalid_row_count,
                    validation_summary,
                    detection_result,
                    error_message
                )
                values (
                    :dataset_type,
                    :original_filename,
                    :file_type,
                    :uploaded_by,
                    :status,
                    :original_row_count,
                    :valid_row_count,
                    :invalid_row_count,
                    cast(:validation_summary as jsonb),
                    cast(:detection_result as jsonb),
                    :error_message
                )
                returning upload_id
            """),
            {
                "dataset_type": dataset_type,
                "original_filename": original_filename,
                "file_type": file_type,
                "uploaded_by": uploaded_by,
                "status": status,
                "original_row_count": int(original_row_count or 0),
                "valid_row_count": int(valid_row_count or 0),
                "invalid_row_count": int(invalid_row_count or 0),
                "validation_summary": _to_json(validation_summary),
                "detection_result": _to_json(detection_result),
                "error_message": error_message,
            },
        )

        upload_id = result.scalar_one()

    return str(upload_id)


def save_dataset_source_payload(*, dataset_type: str, upload_id: str, payload: dict | None = None) -> None:
    """Persist the latest cleaned source payload for integration recovery.

    One row per dataset type is retained, so repeated uploads do not accumulate
    full cleaned source copies. This is used only when an integration rebuild is
    actually requested after the backend process has lost its in-memory state.
    """
    ensure_dataset_uploads_schema()

    with engine.begin() as connection:
        connection.execute(
            text("""
                insert into public.dataset_source_payloads (
                    dataset_type, upload_id, payload, updated_at
                )
                values (
                    :dataset_type, cast(:upload_id as uuid), cast(:payload as jsonb), now()
                )
                on conflict (dataset_type) do update
                set upload_id = excluded.upload_id,
                    payload = excluded.payload,
                    updated_at = now()
            """),
            {
                "dataset_type": str(dataset_type or "").strip().lower(),
                "upload_id": str(upload_id),
                "payload": _to_json(payload),
            },
        )


REQUIRED_DATASET_TYPES = ("dengue", "weather", "population", "boundary")


def _normalize_upload_id_map(value: Any) -> dict:
    raw = _json_object(value)
    normalized = {}
    for dataset_type in REQUIRED_DATASET_TYPES:
        upload_id = str(raw.get(dataset_type) or "").strip()
        if upload_id:
            normalized[dataset_type] = upload_id
    return normalized


def save_dataset_source_file(
    *,
    dataset_type: str,
    upload_id: str,
    original_filename: str,
    content_bytes: bytes,
    content_type: str = "application/octet-stream",
) -> None:
    """Persist the exact current uploaded file without accumulating history.

    The browser only downloads this blob after an explicit user action. Keeping
    one compressed row per source type preserves cross-device review while
    avoiding repeated source-file storage growth.
    """
    ensure_dataset_uploads_schema()

    raw = bytes(content_bytes or b"")
    compressed_bytes = gzip.compress(raw, compresslevel=6)

    with engine.begin() as connection:
        connection.execute(
            text("""
                insert into public.dataset_source_files (
                    dataset_type, upload_id, original_filename, content_type,
                    size_bytes, compressed, file_bytes, updated_at
                )
                values (
                    :dataset_type, cast(:upload_id as uuid), :original_filename,
                    :content_type, :size_bytes, true, :file_bytes, now()
                )
                on conflict (dataset_type) do update
                set upload_id = excluded.upload_id,
                    original_filename = excluded.original_filename,
                    content_type = excluded.content_type,
                    size_bytes = excluded.size_bytes,
                    compressed = excluded.compressed,
                    file_bytes = excluded.file_bytes,
                    updated_at = now()
            """),
            {
                "dataset_type": str(dataset_type or "").strip().lower(),
                "upload_id": str(upload_id),
                "original_filename": str(original_filename or "source_file")[:255],
                "content_type": str(content_type or "application/octet-stream")[:160],
                "size_bytes": len(raw),
                "file_bytes": compressed_bytes,
            },
        )


def get_current_dataset_source_file(dataset_type: str) -> dict | None:
    """Return the exact source file for the upload currently shown on its card."""
    ensure_dataset_uploads_schema()
    dataset_type = str(dataset_type or "").strip().lower()
    if dataset_type not in REQUIRED_DATASET_TYPES:
        return None

    with engine.connect() as connection:
        current_ids = _current_upload_ids_for_connection(connection)
        upload_id = current_ids.get(dataset_type)
        if not upload_id:
            return None

        row = connection.execute(
            text("""
                select dataset_type, upload_id, original_filename, content_type,
                       size_bytes, compressed, file_bytes, updated_at
                from public.dataset_source_files
                where dataset_type = :dataset_type
                  and upload_id = cast(:upload_id as uuid)
                limit 1
            """),
            {"dataset_type": dataset_type, "upload_id": upload_id},
        ).mappings().first()

    if not row or row["file_bytes"] is None:
        return None

    stored = bytes(row["file_bytes"])
    try:
        content = gzip.decompress(stored) if bool(row["compressed"]) else stored
    except (OSError, EOFError):
        # Defensive compatibility fallback if an interrupted migration left an
        # uncompressed row marked incorrectly.
        content = stored

    return {
        "dataset_type": str(row["dataset_type"]),
        "upload_id": str(row["upload_id"]),
        "original_filename": str(row["original_filename"] or "source_file"),
        "content_type": str(row["content_type"] or "application/octet-stream"),
        "size_bytes": int(row["size_bytes"] or len(content)),
        "content": content,
        "updated_at": str(row["updated_at"] or ""),
    }


def _latest_validated_upload_ids_for_connection(connection) -> dict:
    rows = connection.execute(
        text("""
            select distinct on (dataset_type) dataset_type, upload_id
            from public.dataset_uploads
            where status = 'validated'
              and dataset_type in ('dengue', 'weather', 'population', 'boundary')
            order by dataset_type, uploaded_at desc
        """)
    ).mappings().all()
    return {str(row["dataset_type"]): str(row["upload_id"]) for row in rows}


def _latest_completed_integration_upload_ids_for_connection(connection) -> dict:
    row = connection.execute(
        text("""
            select dengue_upload_id, weather_upload_id, population_upload_id, boundary_upload_id
            from public.integration_runs
            where status = 'completed'
            order by created_at desc, integration_run_id desc
            limit 1
        """)
    ).mappings().first()
    if not row:
        return {}
    return {
        dataset_type: str(row[f"{dataset_type}_upload_id"])
        for dataset_type in REQUIRED_DATASET_TYPES
        if row.get(f"{dataset_type}_upload_id")
    }


def _get_upload_cycle_for_connection(connection) -> dict | None:
    row = connection.execute(
        text("""
            select cycle_id, mode, source_upload_ids, started_by, started_at, updated_at
            from public.dataset_upload_cycle_state
            where singleton_id = 1
            limit 1
        """)
    ).mappings().first()
    if not row:
        return None
    source_ids = _normalize_upload_id_map(row["source_upload_ids"])
    return {
        "cycle_id": str(row["cycle_id"]),
        "mode": str(row["mode"] or "replacement"),
        "source_upload_ids": source_ids,
        "completed_types": [name for name in REQUIRED_DATASET_TYPES if name in source_ids],
        "missing_types": [name for name in REQUIRED_DATASET_TYPES if name not in source_ids],
        "started_by": str(row["started_by"] or ""),
        "started_at": str(row["started_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def get_current_upload_cycle() -> dict | None:
    ensure_dataset_uploads_schema()
    with engine.connect() as connection:
        return _get_upload_cycle_for_connection(connection)


def start_fresh_upload_cycle(*, started_by: str = "") -> dict:
    """Persist an intentionally empty upload-card set without deleting history."""
    ensure_dataset_uploads_schema()
    cycle_id = str(uuid.uuid4())
    with engine.begin() as connection:
        connection.execute(
            text("""
                insert into public.dataset_upload_cycle_state (
                    singleton_id, cycle_id, mode, source_upload_ids, started_by, started_at, updated_at
                )
                values (1, :cycle_id, 'fresh', '{}'::jsonb, :started_by, now(), now())
                on conflict (singleton_id) do update
                set cycle_id = excluded.cycle_id,
                    mode = 'fresh',
                    source_upload_ids = '{}'::jsonb,
                    started_by = excluded.started_by,
                    started_at = now(),
                    updated_at = now()
            """),
            {"cycle_id": cycle_id, "started_by": str(started_by or "")},
        )
        cycle = _get_upload_cycle_for_connection(connection)
    return cycle or {
        "cycle_id": cycle_id,
        "mode": "fresh",
        "source_upload_ids": {},
        "completed_types": [],
        "missing_types": list(REQUIRED_DATASET_TYPES),
    }


def register_upload_in_current_cycle(*, dataset_type: str, upload_id: str, started_by: str = "") -> dict:
    """Attach a validated upload to the persistent card set.

    If no explicit fresh cycle exists, seed the set from the last completed
    integration (or latest validated uploads) so replacing one source keeps the
    other three current sources without downloading them into the browser.
    """
    ensure_dataset_uploads_schema()
    dataset_type = str(dataset_type or "").strip().lower()
    if dataset_type not in REQUIRED_DATASET_TYPES:
        raise ValueError(f"Unsupported dataset type: {dataset_type}")

    with engine.begin() as connection:
        row = connection.execute(
            text("""
                select cycle_id, mode, source_upload_ids, started_by, started_at, updated_at
                from public.dataset_upload_cycle_state
                where singleton_id = 1
                for update
            """)
        ).mappings().first()

        if row:
            cycle_id = str(row["cycle_id"])
            mode = str(row["mode"] or "replacement")
            source_ids = _normalize_upload_id_map(row["source_upload_ids"])
        else:
            cycle_id = str(uuid.uuid4())
            mode = "replacement"
            source_ids = _latest_completed_integration_upload_ids_for_connection(connection)
            if len(source_ids) < len(REQUIRED_DATASET_TYPES):
                latest_ids = _latest_validated_upload_ids_for_connection(connection)
                for name in REQUIRED_DATASET_TYPES:
                    if name not in source_ids and latest_ids.get(name):
                        source_ids[name] = latest_ids[name]

        source_ids[dataset_type] = str(upload_id)

        connection.execute(
            text("""
                insert into public.dataset_upload_cycle_state (
                    singleton_id, cycle_id, mode, source_upload_ids, started_by, started_at, updated_at
                )
                values (
                    1, :cycle_id, :mode, cast(:source_upload_ids as jsonb), :started_by, now(), now()
                )
                on conflict (singleton_id) do update
                set cycle_id = excluded.cycle_id,
                    mode = excluded.mode,
                    source_upload_ids = excluded.source_upload_ids,
                    started_by = case
                        when public.dataset_upload_cycle_state.started_by = '' then excluded.started_by
                        else public.dataset_upload_cycle_state.started_by
                    end,
                    updated_at = now()
            """),
            {
                "cycle_id": cycle_id,
                "mode": mode,
                "source_upload_ids": _to_json(source_ids),
                "started_by": str(started_by or ""),
            },
        )
        cycle = _get_upload_cycle_for_connection(connection)
    return cycle or {}


def _current_upload_ids_for_connection(connection) -> dict:
    cycle = _get_upload_cycle_for_connection(connection)
    if cycle is not None:
        return dict(cycle.get("source_upload_ids") or {})
    return _latest_validated_upload_ids_for_connection(connection)


def get_current_dataset_upload_ids() -> dict:
    ensure_dataset_uploads_schema()
    with engine.connect() as connection:
        return _current_upload_ids_for_connection(connection)


def get_latest_dataset_source_payloads() -> dict:
    """Return persisted payloads for the current persistent upload-card set only."""
    ensure_dataset_uploads_schema()

    with engine.connect() as connection:
        current_ids = _current_upload_ids_for_connection(connection)
        rows = []
        for dataset_type, upload_id in current_ids.items():
            row = connection.execute(
                text("""
                    select dataset_type, upload_id, payload
                    from public.dataset_source_payloads
                    where dataset_type = :dataset_type
                      and upload_id = cast(:upload_id as uuid)
                    limit 1
                """),
                {"dataset_type": dataset_type, "upload_id": upload_id},
            ).mappings().first()
            if row:
                rows.append(row)

    payloads = {}
    for row in rows:
        payload = _json_object(row["payload"])
        if payload:
            payloads[str(row["dataset_type"])] = payload

    return payloads


def get_latest_dataset_uploads() -> dict:
    ensure_dataset_uploads_schema()

    with engine.connect() as connection:
        upload_cycle = _get_upload_cycle_for_connection(connection)
        current_upload_ids = _current_upload_ids_for_connection(connection)
        rows = []

        # Fetch at most four tiny metadata rows, one for each upload card. If a
        # persistent fresh cycle is partial, missing types stay missing instead
        # of silently falling back to older uploads after logout/login.
        for dataset_type in REQUIRED_DATASET_TYPES:
            upload_id = current_upload_ids.get(dataset_type)
            if not upload_id:
                continue
            row = connection.execute(
                text("""
                    select
                        upload_id,
                        dataset_type,
                        original_filename,
                        file_type,
                        status,
                        original_row_count,
                        valid_row_count,
                        invalid_row_count,
                        validation_summary,
                        detection_result,
                        coalesce(
                            nullif(detection_result->>'coverage_start', ''),
                            nullif(validation_summary->>'coverage_start', '')
                        ) as coverage_start,
                        coalesce(
                            nullif(detection_result->>'coverage_end', ''),
                            nullif(validation_summary->>'coverage_end', '')
                        ) as coverage_end,
                        exists (
                            select 1
                            from public.dataset_source_files source_file
                            where source_file.dataset_type = :dataset_type
                              and source_file.upload_id = cast(:upload_id as uuid)
                        ) as source_file_available,
                        coalesce((
                            select source_file.size_bytes
                            from public.dataset_source_files source_file
                            where source_file.dataset_type = :dataset_type
                              and source_file.upload_id = cast(:upload_id as uuid)
                            limit 1
                        ), 0) as source_file_size_bytes,
                        uploaded_at
                    from public.dataset_uploads
                    where upload_id = cast(:upload_id as uuid)
                      and dataset_type = :dataset_type
                      and status = 'validated'
                    limit 1
                """),
                {"upload_id": upload_id, "dataset_type": dataset_type},
            ).mappings().first()
            if row:
                rows.append(row)

        # Keep forecast readiness lightweight. The Upload page already calls this
        # endpoint when it opens, so include only a tiny persisted-forecast status
        # instead of making the browser download the full forecast just to decide
        # whether the workflow checklist is ready.
        forecast_result = connection.execute(
            text("""
                select
                    runs.forecast_run_id,
                    runs.integration_run_id,
                    runs.dengue_upload_id,
                    runs.completed_at,
                    runs.validation_summary->>'forecast_scope' as forecast_scope,
                    runs.validation_summary->>'forecast_stage' as forecast_stage,
                    integration.dengue_upload_id as integration_dengue_upload_id,
                    integration.weather_upload_id as integration_weather_upload_id,
                    integration.population_upload_id as integration_population_upload_id,
                    integration.boundary_upload_id as integration_boundary_upload_id,
                    (
                        select count(*)
                        from public.forecast_results results
                        where results.forecast_run_id = runs.forecast_run_id
                    ) as result_count
                from public.forecast_runs runs
                left join public.integration_runs integration
                    on integration.integration_run_id = runs.integration_run_id
                where runs.status = 'completed'
                order by
                    runs.completed_at desc nulls last,
                    runs.started_at desc nulls last,
                    runs.forecast_run_id desc
                limit 1
            """)
        )

        latest_forecast = forecast_result.mappings().first()

        # A preliminary dengue-only forecast belongs to the CURRENT dengue
        # upload cycle, not simply to whichever completed forecast happens to
        # be newest overall. Its stable identity is: exact current dengue upload
        # id + no integration run + saved forecast rows. JSON scope/stage tags are
        # useful metadata but are deliberately not required here so relogin also
        # works for runs saved before/while those tags were introduced.
        current_dengue_upload_id = current_upload_ids.get("dengue")
        latest_historical_forecast = None
        if current_dengue_upload_id:
            historical_forecast_result = connection.execute(
                text("""
                    select
                        runs.forecast_run_id,
                        runs.dengue_upload_id,
                        runs.completed_at,
                        runs.validation_summary->>'forecast_scope' as forecast_scope,
                        runs.validation_summary->>'forecast_stage' as forecast_stage,
                        (
                            select count(*)
                            from public.forecast_results results
                            where results.forecast_run_id = runs.forecast_run_id
                        ) as result_count
                    from public.forecast_runs runs
                    where runs.status = 'completed'
                      and runs.dengue_upload_id = cast(:dengue_upload_id as uuid)
                      and runs.integration_run_id is null
                      -- Matching the exact current dengue upload + no integration
                      -- is the authoritative identity of the preliminary stage.
                      -- Do not require the newer JSON tags here because older/
                      -- partially migrated runs may not have them even though the
                      -- forecast rows were saved correctly.
                      and exists (
                          select 1
                          from public.forecast_results existing_results
                          where existing_results.forecast_run_id = runs.forecast_run_id
                      )
                    order by
                        runs.completed_at desc nulls last,
                        runs.started_at desc nulls last,
                        runs.forecast_run_id desc
                    limit 1
                """),
                {"dengue_upload_id": current_dengue_upload_id},
            )
            latest_historical_forecast = historical_forecast_result.mappings().first()

        integration_result = connection.execute(
            text("""
                select
                    integration_run_id, dengue_upload_id, weather_upload_id,
                    population_upload_id, boundary_upload_id, row_count, summary, created_at
                from public.integration_runs
                where status = 'completed'
                order by created_at desc, integration_run_id desc
                limit 1
            """)
        )
        latest_integration = integration_result.mappings().first()
        integration_counts = None
        if latest_integration:
            integration_counts = connection.execute(
                text("""
                    select
                        count(*) as integrated_row_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_barangay_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and population_match_status in ('matched', 'psgc_matched')
                        ) as dengue_population_matched_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and boundary_match_status in ('matched', 'psgc_matched')
                        ) as dengue_boundary_matched_count,
                        count(distinct barangay_key) filter (
                            where population_match_status in ('matched', 'psgc_matched')
                        ) as population_barangay_count,
                        count(distinct barangay_key) filter (
                            where boundary_match_status in ('matched', 'psgc_matched')
                        ) as boundary_barangay_count,
                        count(distinct barangay_key) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                              and population_match_status in ('matched', 'psgc_matched')
                              and boundary_match_status in ('matched', 'psgc_matched')
                        ) as shared_barangay_count,
                        count(*) filter (where weather_match_status <> 'unavailable') as weather_matched_rows,
                        min(report_date) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_coverage_start,
                        max(report_date) filter (
                            where barangay_match_status in ('psgc_matched', 'exact_matched', 'auto_matched')
                        ) as dengue_coverage_end
                    from public.integrated_dataset_rows
                    where integration_run_id = :integration_run_id
                """),
                {"integration_run_id": latest_integration["integration_run_id"]},
            ).mappings().first()

    uploads = {}

    for row in rows:
        dataset_type = row["dataset_type"]

        uploads[dataset_type] = {
            "upload_id": str(row["upload_id"]),
            "dataset_type": row["dataset_type"],
            "original_filename": row["original_filename"],
            "file_type": row["file_type"],
            "status": row["status"],
            "original_row_count": row["original_row_count"],
            "valid_row_count": row["valid_row_count"],
            "invalid_row_count": row["invalid_row_count"],
            "validation_counts": _build_validation_counts(
                dataset_type,
                row["validation_summary"],
                row["invalid_row_count"],
                row["detection_result"],
                row["original_filename"],
            ),
            # Only expose the two tiny coverage values needed by the header.
            # This reuses the existing database-status request and avoids
            # downloading dengue rows just to calculate the displayed range.
            "coverage_start": row["coverage_start"] or "",
            "coverage_end": row["coverage_end"] or "",
            "source_file_available": bool(row["source_file_available"]),
            "source_file_size_bytes": int(row["source_file_size_bytes"] or 0),
            "uploaded_at": str(row["uploaded_at"]),
        }

    required_types = list(REQUIRED_DATASET_TYPES)
    forecast_result_count = int(latest_forecast["result_count"] or 0) if latest_forecast else 0

    forecast_matches_current_uploads = False
    integration_matches_current_uploads = False

    if latest_integration and all(item in uploads for item in required_types):
        integration_matches_current_uploads = all(
            str(latest_integration[f"{dataset_type}_upload_id"] or "")
            == str(uploads[dataset_type].get("upload_id") or "")
            for dataset_type in required_types
        )

    if latest_forecast and all(item in uploads for item in required_types):
        forecast_matches_current_uploads = all(
            str(latest_forecast[f"integration_{dataset_type}_upload_id"] or "")
            == str(uploads[dataset_type].get("upload_id") or "")
            for dataset_type in required_types
        )

    historical_forecast_result_count = (
        int(latest_historical_forecast["result_count"] or 0)
        if latest_historical_forecast
        else 0
    )
    historical_forecast_matches_current_dengue = bool(
        latest_historical_forecast
        and uploads.get("dengue")
        and str(latest_historical_forecast.get("dengue_upload_id") or "")
            == str(uploads["dengue"].get("upload_id") or "")
        and historical_forecast_result_count > 0
    )

    integration_readiness = None
    if latest_integration and integration_counts and integration_matches_current_uploads:
        total_integrated = _safe_int(integration_counts["integrated_row_count"])
        dengue_barangays = _safe_int(integration_counts["dengue_barangay_count"])
        dengue_population = _safe_int(integration_counts["dengue_population_matched_count"])
        dengue_boundary = _safe_int(integration_counts["dengue_boundary_matched_count"])
        population_barangays = _safe_int(integration_counts["population_barangay_count"])
        boundary_barangays = _safe_int(integration_counts["boundary_barangay_count"])
        shared_barangays = _safe_int(integration_counts["shared_barangay_count"])
        weather_matched = _safe_int(integration_counts["weather_matched_rows"])
        weather_ready = total_integrated > 0 and weather_matched == total_integrated
        forecast_ready = forecast_result_count > 0 and forecast_matches_current_uploads

        checks = [
            {
                "id": "dengue-population-match",
                "label": "Dengue barangays matched with population",
                "ready": dengue_barangays > 0 and dengue_population == dengue_barangays,
                "value": f"{dengue_population}/{dengue_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "dengue-boundary-match",
                "label": "Dengue barangays matched with boundary layer",
                "ready": dengue_barangays > 0 and dengue_boundary == dengue_barangays,
                "value": f"{dengue_boundary}/{dengue_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "population-boundary-match",
                "label": "Population barangays matched with boundary layer",
                "ready": population_barangays > 0 and shared_barangays == population_barangays,
                "value": f"{shared_barangays}/{population_barangays}",
                "detail": "Authoritative count from the latest integrated dataset.",
                "missingPreview": [],
            },
            {
                "id": "weather-coverage",
                "label": "Weather context available for integrated rows",
                "ready": weather_ready,
                "value": f"{weather_matched}/{total_integrated}",
                "detail": "Weather-match status is summarized in the database; no full dataset download is required.",
                "missingPreview": [],
            },
            {
                "id": "forecast-rows-ready",
                "label": "Forecast and DSS rows generated",
                "ready": forecast_ready,
                "value": f"{forecast_result_count} barangay rows",
                "detail": "Saved forecast results match the current four uploaded sources." if forecast_ready else "A matching saved forecast has not been generated yet.",
                "missingPreview": [],
            },
        ]
        ready_count = sum(1 for check in checks if check["ready"])
        integration_readiness = {
            "status": "Ready" if ready_count == len(checks) else "Needs Review",
            "score": round((ready_count / len(checks)) * 100) if checks else 0,
            "readyCount": ready_count,
            "checkCount": len(checks),
            "allSourcesLoaded": True,
            "checks": checks,
            "summary": {
                "dengueBarangayCount": dengue_barangays,
                "populationBarangayCount": population_barangays,
                "boundaryBarangayCount": boundary_barangays,
                "sharedBarangayCount": shared_barangays,
                "forecastAreaCount": forecast_result_count,
                "integratedRowCount": total_integrated,
                "weatherMatchedRowCount": weather_matched,
                "dengueDateCoverage": f"{integration_counts['dengue_coverage_start'] or ''} to {integration_counts['dengue_coverage_end'] or ''}",
                "weatherDateCoverage": uploads.get("weather", {}).get("coverage_start", "") + " to " + uploads.get("weather", {}).get("coverage_end", ""),
                "riskRowCount": forecast_result_count,
            },
        }

    return {
        "required_types": required_types,
        "uploads": uploads,
        "completed_types": [item for item in required_types if item in uploads],
        "missing_types": [item for item in required_types if item not in uploads],
        "all_required_uploaded": all(item in uploads for item in required_types),
        "integration_status": {
            "ready": bool(integration_matches_current_uploads),
            "matches_current_uploads": integration_matches_current_uploads,
            "integration_run_id": str(latest_integration["integration_run_id"]) if latest_integration else None,
            "row_count": _safe_int(latest_integration["row_count"]) if latest_integration else 0,
        },
        "integration_readiness": integration_readiness,
        "forecast_status": {
            # This remains the final four-source readiness flag used by the
            # automatic integration/model workflow. A preliminary historical
            # forecast must never satisfy this full-source match.
            "ready": forecast_result_count > 0 and forecast_matches_current_uploads,
            "result_count": forecast_result_count,
            "matches_current_uploads": forecast_matches_current_uploads,
            # The latest successful forecast remains publishable to BHW,
            # Supervisor, and Viewer while Admin is staging a new partial set.
            "published_ready": forecast_result_count > 0,
            "forecast_scope": latest_forecast.get("forecast_scope") if latest_forecast else None,
            "forecast_stage": latest_forecast.get("forecast_stage") if latest_forecast else None,
            "forecast_run_id": str(latest_forecast["forecast_run_id"]) if latest_forecast else None,
            "completed_at": (
                str(latest_forecast["completed_at"])
                if latest_forecast and latest_forecast["completed_at"]
                else None
            ),
        },
        "historical_forecast_status": {
            "ready": historical_forecast_matches_current_dengue,
            "matches_current_dengue_upload": historical_forecast_matches_current_dengue,
            "result_count": (
                historical_forecast_result_count
                if historical_forecast_matches_current_dengue
                else 0
            ),
            "forecast_run_id": (
                str(latest_historical_forecast["forecast_run_id"])
                if historical_forecast_matches_current_dengue
                else None
            ),
            "completed_at": (
                str(latest_historical_forecast["completed_at"])
                if historical_forecast_matches_current_dengue
                and latest_historical_forecast["completed_at"]
                else None
            ),
        },
        "upload_cycle": {
            "persistent": upload_cycle is not None,
            "cycle_id": upload_cycle.get("cycle_id") if upload_cycle else None,
            "mode": upload_cycle.get("mode") if upload_cycle else "legacy",
            "completed_types": [item for item in required_types if item in uploads],
            "missing_types": [item for item in required_types if item not in uploads],
            "started_at": upload_cycle.get("started_at") if upload_cycle else None,
            "updated_at": upload_cycle.get("updated_at") if upload_cycle else None,
        },
    }


def get_latest_dataset_previews(limit: int = 300) -> dict:
    safe_limit = max(1, min(int(limit or 300), 1000))

    # Preview the persistent current upload set, not an older completed
    # integration. PostgreSQL slices only the requested JSON records so Render
    # does not pull an entire persisted source payload from Supabase merely to
    # show a 25/100-row browser preview. This endpoint is also lazy and is never
    # called by the normal login bootstrap.
    ensure_dataset_uploads_schema()
    with engine.connect() as preview_connection:
        cycle = _get_upload_cycle_for_connection(preview_connection)
        current_ids = _current_upload_ids_for_connection(preview_connection)
        previews = {}
        payload_found = False
        for dataset_type in ("dengue", "weather", "population"):
            upload_id = current_ids.get(dataset_type)
            if not upload_id:
                previews[dataset_type] = []
                continue

            rows = preview_connection.execute(
                text("""
                    select item.value as record
                    from public.dataset_source_payloads payloads
                    cross join lateral jsonb_array_elements(
                        coalesce(payloads.payload->'records', '[]'::jsonb)
                    ) with ordinality as item(value, ord)
                    where payloads.dataset_type = :dataset_type
                      and payloads.upload_id = cast(:upload_id as uuid)
                    order by item.ord
                    limit :limit
                """),
                {
                    "dataset_type": dataset_type,
                    "upload_id": upload_id,
                    "limit": safe_limit,
                },
            ).mappings().all()
            previews[dataset_type] = [
                _json_object(row["record"]) for row in rows if _json_object(row["record"])
            ]
            if rows:
                payload_found = True

        if cycle is not None or payload_found:
            return {
                "message": "Current upload-cycle previews loaded from persisted source payloads.",
                "has_saved_preview": payload_found,
                "limit": safe_limit,
                "previews": previews,
            }

    with engine.connect() as connection:
        latest_run_result = connection.execute(
            text("""
                select integration_run_id, row_count, created_at
                from public.integration_runs
                where status = 'completed'
                order by created_at desc, integration_run_id desc
                limit 1
            """)
        )

        latest_run = latest_run_result.mappings().first()

        if not latest_run:
            return {
                "message": "No saved integrated dataset preview found.",
                "has_saved_preview": False,
                "limit": safe_limit,
                "previews": {
                    "dengue": [],
                    "weather": [],
                    "population": [],
                },
            }

        dengue_rows = connection.execute(
            text("""
                select
                    barangay,
                    period,
                    report_date,
                    year,
                    month,
                    week,
                    cases,
                    deaths
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                order by period, barangay
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

        weather_rows = connection.execute(
            text("""
                select distinct on (period)
                    period,
                    report_date,
                    rainfall,
                    temperature,
                    humidity,
                    weather_match_status
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                order by period, barangay
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

        population_rows = connection.execute(
            text("""
                select distinct on (barangay_key)
                    barangay,
                    barangay_key,
                    population,
                    population_year,
                    density,
                    geometry_id,
                    population_match_status
                from public.integrated_dataset_rows
                where integration_run_id = :integration_run_id
                  and barangay_key is not null
                order by barangay_key, period
                limit :limit
            """),
            {
                "integration_run_id": latest_run["integration_run_id"],
                "limit": safe_limit,
            },
        ).mappings().all()

    def as_date(value):
        return str(value) if value else ""

    return {
        "message": "Saved dataset preview rows loaded from Supabase.",
        "has_saved_preview": True,
        "limit": safe_limit,
        "integration_run": {
            "integration_run_id": str(latest_run["integration_run_id"]),
            "row_count": latest_run["row_count"],
            "created_at": str(latest_run["created_at"]),
        },
        "previews": {
            "dengue": [
                {
                    "barangay": row["barangay"],
                    "period": row["period"],
                    "date": as_date(row["report_date"]),
                    "year": row["year"],
                    "month": row["month"],
                    "week": row["week"],
                    "cases": row["cases"],
                    "deaths": row["deaths"],
                }
                for row in dengue_rows
            ],
            "weather": [
                {
                    "period": row["period"],
                    "reporting_date": as_date(row["report_date"]) or row["period"],
                    "rainfall": row["rainfall"],
                    "temperature": row["temperature"],
                    "humidity": row["humidity"],
                    "status": row["weather_match_status"],
                }
                for row in weather_rows
            ],
            "population": [
                {
                    "barangay": row["barangay"],
                    "barangay_key": row["barangay_key"],
                    "population": row["population"],
                    "population_year": row["population_year"],
                    "density": row["density"],
                    "geometry_id": row["geometry_id"],
                    "status": row["population_match_status"],
                }
                for row in population_rows
            ],
        },
    }
