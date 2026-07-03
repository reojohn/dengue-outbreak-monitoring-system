import json
from typing import Any

from sqlalchemy import text

from app.database import engine


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


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


def get_latest_dataset_uploads() -> dict:
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                select distinct on (dataset_type)
                    upload_id,
                    dataset_type,
                    original_filename,
                    file_type,
                    status,
                    original_row_count,
                    valid_row_count,
                    invalid_row_count,
                    uploaded_at
                from public.dataset_uploads
                order by dataset_type, uploaded_at desc
            """)
        )

        rows = result.mappings().all()

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
            "uploaded_at": str(row["uploaded_at"]),
        }

    required_types = ["dengue", "weather", "population", "boundary"]

    return {
        "required_types": required_types,
        "uploads": uploads,
        "completed_types": [item for item in required_types if item in uploads],
        "missing_types": [item for item in required_types if item not in uploads],
        "all_required_uploaded": all(item in uploads for item in required_types),
    }