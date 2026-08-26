from io import BytesIO

import asyncio
import mimetypes
import os
import time
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.services.auto_ml_forecast import generate_auto_ml_dengue_forecast_from_dataframe
from app.services.boundary_inspector import validate_boundary_file
from app.services.database_boundaries import get_latest_boundary_geojson, save_boundary_geojson
from app.services.database_forecasts import save_forecast_result
from app.auth_security import get_current_user
from app.services.database_uploads import (
    get_current_dataset_source_file,
    get_latest_dataset_previews,
    get_latest_dataset_uploads,
    register_upload_in_current_cycle,
    save_dataset_source_file,
    save_dataset_source_payload,
    save_dataset_upload,
    start_fresh_upload_cycle,
)
from app.services.file_inspector import (
    build_clean_dengue_result_from_dataframe,
    clean_dengue_file,
    inspect_tabular_file,
    prepare_clean_dengue_dataframe,
    read_tabular_file,
    summarize_dengue_file,
)
from app.services.integration_state import clear_integration_sources, set_integration_source
from app.services.population_inspector import validate_population_file
from app.services.weather_inspector import validate_weather_file

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)

UPLOAD_JOBS = {}
MAX_UPLOAD_BYTES = max(1024 * 1024, int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024)
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
MAX_UPLOAD_JOBS = 200


async def _read_upload_bytes_limited(file: UploadFile) -> bytes:
    declared_size = getattr(file, "size", None)
    if declared_size is not None and int(declared_size) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB file-size limit.",
        )

    chunks = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB file-size limit.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _safe_filename(file: UploadFile, fallback: str) -> str:
    return str(file.filename or fallback).strip()[:255] or fallback


def _guess_content_type(filename: str) -> str:
    lowered = str(filename or "").lower()
    if lowered.endswith(".geojson"):
        return "application/geo+json"
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed or "application/octet-stream"


def _prune_upload_jobs():
    if len(UPLOAD_JOBS) < MAX_UPLOAD_JOBS:
        return
    ordered = sorted(UPLOAD_JOBS.values(), key=lambda item: item.get("updated_at") or item.get("created_at") or "")
    for job in ordered[: max(1, len(UPLOAD_JOBS) - MAX_UPLOAD_JOBS + 1)]:
        UPLOAD_JOBS.pop(job.get("job_id"), None)


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _start_upload_job(dataset_type: str, filename: str, size_bytes: int):
    _prune_upload_jobs()
    job_id = str(uuid.uuid4())
    UPLOAD_JOBS[job_id] = {
        "job_id": job_id,
        "dataset_type": dataset_type,
        "filename": filename,
        "size_bytes": size_bytes,
        "status": "processing",
        "message": "File received. Validation and database saving are running in the background.",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "result": None,
        "error": None,
    }
    return job_id


def _set_upload_job_done(job_id: str, result: dict):
    if job_id not in UPLOAD_JOBS:
        return
    UPLOAD_JOBS[job_id].update({
        "status": "completed",
        "message": "File checked successfully.",
        "updated_at": _now_iso(),
        "result": result,
        "error": None,
    })


def _set_upload_job_failed(job_id: str, error: Exception):
    if job_id not in UPLOAD_JOBS:
        return
    UPLOAD_JOBS[job_id].update({
        "status": "failed",
        "message": "File processing failed.",
        "updated_at": _now_iso(),
        "result": None,
        "error": str(error),
    })


def _processing_response(job_id: str, dataset_type: str, filename: str, size_bytes: int):
    return {
        "processing": True,
        "upload_job_id": job_id,
        "dataset_type": dataset_type,
        "filename": filename,
        "size_bytes": size_bytes,
        "status": "processing",
        "message": "File accepted. The system is processing and saving it in the background.",
        "original_row_count": 1,
        "valid_row_count": 1,
        "invalid_row_count": 0,
        "cleaned_preview": [],
        "invalid_preview": [],
    }


async def _run_upload_job(job_id: str, processor, *args):
    try:
        result = await processor(*args)
        _set_upload_job_done(job_id, result)
    except Exception as error:
        _set_upload_job_failed(job_id, error)



@router.post("/fresh-cycle")
def begin_fresh_upload_cycle(current_user=Depends(get_current_user)):
    """Persist an intentionally empty upload-card set without deleting history."""
    clear_integration_sources()
    cycle = start_fresh_upload_cycle(started_by=str(current_user.get("id") or ""))
    return {
        "message": "Fresh upload cycle started. Historical uploads and published forecasts were preserved.",
        "upload_cycle": cycle,
        "database_status": get_latest_dataset_uploads(),
    }


@router.get("/database-status")
async def get_upload_database_status():
    return get_latest_dataset_uploads()


@router.get("/database-preview")
async def get_upload_database_preview(limit: int = 300):
    return get_latest_dataset_previews(limit=limit)


@router.get("/source-file/{dataset_type}")
async def download_current_source_file(dataset_type: str):
    normalized_type = str(dataset_type or "").strip().lower()
    if normalized_type not in {"dengue", "weather", "population", "boundary"}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This source type is not available for download.",
        )

    source_file = get_current_dataset_source_file(normalized_type)
    if not source_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The exact uploaded source file is not stored for this saved upload yet. "
                "Upload this source once using the updated system, then it can be downloaded "
                "from any authorized computer."
            ),
        )

    filename = source_file.get("original_filename") or f"{normalized_type}_source"
    encoded_filename = quote(str(filename), safe="")
    return Response(
        content=source_file.get("content") or b"",
        media_type=source_file.get("content_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/latest-boundary-geojson")
async def get_latest_saved_boundary_geojson():
    return get_latest_boundary_geojson()


@router.get("/jobs/{job_id}")
async def get_upload_job_status(job_id: str):
    job = UPLOAD_JOBS.get(job_id)
    if not job:
        return {
            "job_id": job_id,
            "status": "not_found",
            "message": "Upload job was not found. Restarting the backend clears in-memory upload jobs.",
            "result": None,
            "error": "Job not found",
        }

    return job


def _store_dengue_result(clean_result: dict):
    set_integration_source(
        "dengue",
        {
            "filename": clean_result.get("filename", ""),
            "file_type": clean_result.get("file_type", ""),
            "record_count": int(clean_result.get("original_row_count", 0)),
            "valid_count": int(clean_result.get("valid_row_count", 0)),
            "invalid_count": int(clean_result.get("invalid_row_count", 0)),
            "records": clean_result.get("cleaned_records", []),
            "validation_summary": clean_result.get("validation_summary", {}),
            "detection": clean_result.get("dengue_detection", {}),
        },
    )


def _store_population_result(validate_result: dict):
    set_integration_source(
        "population",
        {
            "filename": validate_result.get("filename", ""),
            "file_type": validate_result.get("file_type", ""),
            "record_count": int(validate_result.get("original_row_count", 0)),
            "valid_count": int(validate_result.get("valid_row_count", 0)),
            "invalid_count": int(validate_result.get("invalid_row_count", 0)),
            "records": validate_result.get("cleaned_records", []),
            "validation_summary": validate_result.get("validation_summary", {}),
            "detection": validate_result.get("population_detection", {}),
        },
    )


def _store_weather_result(validate_result: dict):
    set_integration_source(
        "weather",
        {
            "filename": validate_result.get("filename", ""),
            "file_type": validate_result.get("file_type", ""),
            "record_count": int(validate_result.get("original_row_count", 0)),
            "valid_count": int(validate_result.get("valid_row_count", 0)),
            "invalid_count": int(validate_result.get("invalid_row_count", 0)),
            "records": validate_result.get("cleaned_records", []),
            "validation_summary": validate_result.get("validation_summary", {}),
            "detection": validate_result.get("weather_detection", {}),
        },
    )


def _store_boundary_result(validate_result: dict):
    set_integration_source(
        "boundary",
        {
            "filename": validate_result.get("filename", ""),
            "file_type": validate_result.get("file_type", ""),
            "record_count": int(validate_result.get("original_feature_count", 0)),
            "valid_count": int(validate_result.get("valid_feature_count", 0)),
            "invalid_count": int(validate_result.get("invalid_feature_count", 0)),
            "records": validate_result.get("cleaned_preview", []),
            "geojson": validate_result.get("cleaned_geojson", {}),
            "validation_summary": validate_result.get("validation_summary", {}),
            "detection": validate_result.get("boundary_detection", {}),
        },
    )



def _compact_validation_response(result: dict) -> dict:
    """Return a light response for the frontend while keeping full rows in backend memory."""
    compact = dict(result or {})
    compact.pop("cleaned_records", None)
    if "cleaned_preview" not in compact:
        compact["cleaned_preview"] = []
    return compact

def _upload_from_bytes(filename: str, content: bytes):
    return UploadFile(file=BytesIO(content), filename=filename)


def _save_population_upload(result: dict, fallback_filename: str, source_bytes: bytes | None = None):
    upload_id = save_dataset_upload(
        dataset_type="population",
        original_filename=result.get("filename", fallback_filename or "population_dataset"),
        file_type=result.get("file_type", ""),
        uploaded_by="demo_user",
        status="validated",
        original_row_count=result.get("original_row_count", 0),
        valid_row_count=result.get("valid_row_count", 0),
        invalid_row_count=result.get("invalid_row_count", 0),
        validation_summary=result.get("validation_summary", {}),
        detection_result=result.get("population_detection", {}),
        error_message=None,
    )
    if source_bytes is not None:
        source_filename = result.get("filename", fallback_filename or "population_dataset")
        save_dataset_source_file(
            dataset_type="population",
            upload_id=upload_id,
            original_filename=source_filename,
            content_bytes=source_bytes,
            content_type=_guess_content_type(source_filename),
        )
    save_dataset_source_payload(
        dataset_type="population",
        upload_id=upload_id,
        payload={
            "filename": result.get("filename", fallback_filename or "population_dataset"),
            "file_type": result.get("file_type", ""),
            "record_count": int(result.get("original_row_count", 0)),
            "valid_count": int(result.get("valid_row_count", 0)),
            "invalid_count": int(result.get("invalid_row_count", 0)),
            "records": result.get("cleaned_records", []),
            "validation_summary": result.get("validation_summary", {}),
            "detection": result.get("population_detection", {}),
        },
    )
    register_upload_in_current_cycle(dataset_type="population", upload_id=upload_id)
    return upload_id

def _save_weather_upload(result: dict, fallback_filename: str, source_bytes: bytes | None = None):
    upload_id = save_dataset_upload(
        dataset_type="weather",
        original_filename=result.get("filename", fallback_filename or "weather_dataset"),
        file_type=result.get("file_type", ""),
        uploaded_by="demo_user",
        status="validated",
        original_row_count=result.get("original_row_count", 0),
        valid_row_count=result.get("valid_row_count", 0),
        invalid_row_count=result.get("invalid_row_count", 0),
        validation_summary=result.get("validation_summary", {}),
        detection_result=result.get("weather_detection", {}),
        error_message=None,
    )
    if source_bytes is not None:
        source_filename = result.get("filename", fallback_filename or "weather_dataset")
        save_dataset_source_file(
            dataset_type="weather",
            upload_id=upload_id,
            original_filename=source_filename,
            content_bytes=source_bytes,
            content_type=_guess_content_type(source_filename),
        )
    save_dataset_source_payload(
        dataset_type="weather",
        upload_id=upload_id,
        payload={
            "filename": result.get("filename", fallback_filename or "weather_dataset"),
            "file_type": result.get("file_type", ""),
            "record_count": int(result.get("original_row_count", 0)),
            "valid_count": int(result.get("valid_row_count", 0)),
            "invalid_count": int(result.get("invalid_row_count", 0)),
            "records": result.get("cleaned_records", []),
            "validation_summary": result.get("validation_summary", {}),
            "detection": result.get("weather_detection", {}),
        },
    )
    register_upload_in_current_cycle(dataset_type="weather", upload_id=upload_id)
    return upload_id

def _save_boundary_upload(result: dict, fallback_filename: str, source_bytes: bytes | None = None):
    upload_id = save_dataset_upload(
        dataset_type="boundary",
        original_filename=result.get("filename", fallback_filename or "barangay_boundary_dataset"),
        file_type=result.get("file_type", ""),
        uploaded_by="demo_user",
        status="validated",
        original_row_count=result.get("original_feature_count", 0),
        valid_row_count=result.get("valid_feature_count", 0),
        invalid_row_count=result.get("invalid_feature_count", 0),
        validation_summary=result.get("validation_summary", {}),
        detection_result=result.get("boundary_detection", {}),
        error_message=None,
    )
    if source_bytes is not None:
        source_filename = result.get("filename", fallback_filename or "barangay_boundary_dataset")
        save_dataset_source_file(
            dataset_type="boundary",
            upload_id=upload_id,
            original_filename=source_filename,
            content_bytes=source_bytes,
            content_type=_guess_content_type(source_filename),
        )
    save_dataset_source_payload(
        dataset_type="boundary",
        upload_id=upload_id,
        payload={
            "filename": result.get("filename", fallback_filename or "barangay_boundary_dataset"),
            "file_type": result.get("file_type", ""),
            "record_count": int(result.get("original_feature_count", 0)),
            "valid_count": int(result.get("valid_feature_count", 0)),
            "invalid_count": int(result.get("invalid_feature_count", 0)),
            "records": result.get("cleaned_preview", []),
            "geojson": result.get("cleaned_geojson", {}),
            "validation_summary": result.get("validation_summary", {}),
            "detection": result.get("boundary_detection", {}),
        },
    )
    register_upload_in_current_cycle(dataset_type="boundary", upload_id=upload_id)
    return upload_id

def _save_dengue_upload(clean_result: dict, fallback_filename: str, source_bytes: bytes | None = None):
    upload_id = save_dataset_upload(
        dataset_type="dengue",
        original_filename=clean_result.get("filename", fallback_filename or "dengue_dataset"),
        file_type=clean_result.get("file_type", ""),
        uploaded_by="demo_user",
        status="validated",
        original_row_count=clean_result.get("original_row_count", 0),
        valid_row_count=clean_result.get("valid_row_count", 0),
        invalid_row_count=clean_result.get("invalid_row_count", 0),
        validation_summary=clean_result.get("validation_summary", {}),
        detection_result=clean_result.get("dengue_detection", {}),
        error_message=None,
    )
    if source_bytes is not None:
        source_filename = clean_result.get("filename", fallback_filename or "dengue_dataset")
        save_dataset_source_file(
            dataset_type="dengue",
            upload_id=upload_id,
            original_filename=source_filename,
            content_bytes=source_bytes,
            content_type=_guess_content_type(source_filename),
        )
    save_dataset_source_payload(
        dataset_type="dengue",
        upload_id=upload_id,
        payload={
            "filename": clean_result.get("filename", fallback_filename or "dengue_dataset"),
            "file_type": clean_result.get("file_type", ""),
            "record_count": int(clean_result.get("original_row_count", 0)),
            "valid_count": int(clean_result.get("valid_row_count", 0)),
            "invalid_count": int(clean_result.get("invalid_row_count", 0)),
            "records": clean_result.get("cleaned_records", []),
            "validation_summary": clean_result.get("validation_summary", {}),
            "detection": clean_result.get("dengue_detection", {}),
        },
    )
    register_upload_in_current_cycle(dataset_type="dengue", upload_id=upload_id)
    return upload_id


async def _process_dengue_validation_bytes(content: bytes, filename: str):
    """Validate dengue data and publish a preliminary historical-only forecast.

    This restores the original two-stage workflow:
    1) dengue history alone can produce a preliminary forecast immediately;
    2) when all four sources are ready, /models/auto-run replaces it with the
       authoritative multi-source forecast.

    The preliminary run is deliberately saved with no integration_run_id so an
    older four-source integration can never be mistaken for context belonging to
    this new dengue upload.
    """
    upload_file = _upload_from_bytes(filename, content)
    df, file_type, resolved_filename = await read_tabular_file(upload_file)
    prepared = prepare_clean_dengue_dataframe(df)
    clean_result = build_clean_dengue_result_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )

    _store_dengue_result(clean_result)
    upload_id = _save_dengue_upload(clean_result, filename, content)

    preliminary_forecast = generate_auto_ml_dengue_forecast_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )

    # Keep the stage explicit so the UI and database-status endpoint can
    # distinguish this historical-only result from the final four-source run.
    preliminary_summary = dict(preliminary_forecast.get("validation_summary") or {})
    preliminary_summary.update(
        {
            "forecast_scope": "historical_dengue_only",
            "forecast_stage": "preliminary",
            "source_dataset_count": 1,
            "source_dataset_types": ["dengue"],
            # Persist just enough model detail to reconstruct the historical
            # forecast page accurately after logout/login without relying on an
            # older integrated model run. This JSON is read only with /forecast/latest.
            "preliminary_model_metrics": preliminary_forecast.get("model_metrics") or {},
            "preliminary_model_comparison": preliminary_forecast.get("model_comparison") or [],
            "preliminary_training_summary": preliminary_forecast.get("training_summary") or {},
            "preliminary_selection_confidence": preliminary_forecast.get("selection_confidence") or {},
            "preliminary_selection_explanation": preliminary_forecast.get("selection_explanation") or {},
            "preliminary_feature_importance": preliminary_forecast.get("feature_importance") or [],
        }
    )
    preliminary_forecast["validation_summary"] = preliminary_summary
    preliminary_forecast["forecast_scope"] = "historical_dengue_only"
    preliminary_forecast["forecast_stage"] = "preliminary"
    preliminary_forecast["is_preliminary_forecast"] = True

    forecast_database_result = save_forecast_result(
        forecast_result=preliminary_forecast,
        dengue_upload_id=upload_id,
        integration_run_id=None,
        resolve_latest_integration_if_missing=False,
    )

    preliminary_forecast["database_forecast"] = forecast_database_result
    preliminary_forecast["database_forecast_run_id"] = forecast_database_result.get("forecast_run_id")

    clean_result["database_upload_id"] = upload_id
    clean_result["forecast_deferred"] = False
    clean_result["preliminary_forecast"] = preliminary_forecast
    clean_result["message"] = (
        "Dengue source validated and saved. A preliminary historical-only forecast "
        "was generated. Upload weather, population, and boundary sources to build "
        "the complete multi-source forecast."
    )

    return _compact_validation_response(clean_result)


async def _process_population_bytes(content: bytes, filename: str):
    result = await validate_population_file(_upload_from_bytes(filename, content))
    _store_population_result(result)
    upload_id = _save_population_upload(result, filename or "population_dataset", content)
    result["database_upload_id"] = upload_id
    return _compact_validation_response(result)


async def _process_weather_bytes(content: bytes, filename: str):
    result = await validate_weather_file(_upload_from_bytes(filename, content))
    _store_weather_result(result)
    upload_id = _save_weather_upload(result, filename or "weather_dataset", content)
    result["database_upload_id"] = upload_id
    return _compact_validation_response(result)


async def _process_boundary_bytes(content: bytes, filename: str):
    result = await validate_boundary_file(_upload_from_bytes(filename, content))
    _store_boundary_result(result)

    upload_id = _save_boundary_upload(result, filename or "barangay_boundary_dataset", content)
    boundary_database_result = save_boundary_geojson(
        boundary_result=result,
        upload_id=upload_id,
    )

    result["database_upload_id"] = upload_id
    result["database_boundary"] = boundary_database_result
    result["database_boundary_feature_count"] = boundary_database_result.get(
        "saved_boundary_count",
        0,
    )

    return result


@router.post("/test")
async def test_upload(file: UploadFile = File(...)):
    content = await _read_upload_bytes_limited(file)

    return {
        "message": "File received successfully.",
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
    }


@router.post("/inspect")
async def inspect_upload(file: UploadFile = File(...)):
    content = await _read_upload_bytes_limited(file)
    return await inspect_tabular_file(_upload_from_bytes(_safe_filename(file, "dataset"), content))


@router.post("/clean-dengue")
async def clean_dengue_upload(file: UploadFile = File(...)):
    content = await _read_upload_bytes_limited(file)
    result = await clean_dengue_file(_upload_from_bytes(_safe_filename(file, "dengue_dataset"), content))
    _store_dengue_result(result)
    return _compact_validation_response(result)


@router.post("/summarize-dengue")
async def summarize_dengue_upload(file: UploadFile = File(...)):
    content = await _read_upload_bytes_limited(file)
    return await summarize_dengue_file(_upload_from_bytes(_safe_filename(file, "dengue_dataset"), content))


@router.post("/validate-dengue")
async def validate_dengue_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = _safe_filename(file, "dengue_dataset")
    content = await _read_upload_bytes_limited(file)
    job_id = _start_upload_job("dengue", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_dengue_validation_bytes, content, filename)
    return _processing_response(job_id, "dengue", filename, len(content))


@router.post("/forecast-dengue")
async def forecast_dengue_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Backward-compatible alias for the historical-only first-stage forecast.

    The final authoritative multi-source forecast is still created by
    /models/auto-run after all four sources are integrated.
    """
    return await validate_dengue_upload(background_tasks, file)


@router.post("/validate-population")
async def validate_population_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = _safe_filename(file, "population_dataset")
    content = await _read_upload_bytes_limited(file)
    job_id = _start_upload_job("population", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_population_bytes, content, filename)
    return _processing_response(job_id, "population", filename, len(content))


@router.post("/validate-weather")
async def validate_weather_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = _safe_filename(file, "weather_dataset")
    content = await _read_upload_bytes_limited(file)
    job_id = _start_upload_job("weather", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_weather_bytes, content, filename)
    return _processing_response(job_id, "weather", filename, len(content))


@router.post("/validate-boundary")
async def validate_boundary_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = _safe_filename(file, "barangay_boundary_dataset")
    content = await _read_upload_bytes_limited(file)
    job_id = _start_upload_job("boundary", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_boundary_bytes, content, filename)
    return _processing_response(job_id, "boundary", filename, len(content))


@router.post("/dengue")
async def upload_dengue_source(file: UploadFile = File(...)):
    filename = _safe_filename(file, "dengue_dataset")
    content = await _read_upload_bytes_limited(file)
    df, file_type, resolved_filename = await read_tabular_file(_upload_from_bytes(filename, content))
    prepared = prepare_clean_dengue_dataframe(df)

    clean_result = build_clean_dengue_result_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )

    _store_dengue_result(clean_result)
    upload_id = _save_dengue_upload(clean_result, filename, content)

    forecast_result = generate_auto_ml_dengue_forecast_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )
    forecast_summary = dict(forecast_result.get("validation_summary") or {})
    forecast_summary.update({
        "forecast_scope": "historical_dengue_only",
        "forecast_stage": "preliminary",
        "source_dataset_count": 1,
        "source_dataset_types": ["dengue"],
        "preliminary_model_metrics": forecast_result.get("model_metrics") or {},
        "preliminary_model_comparison": forecast_result.get("model_comparison") or [],
        "preliminary_training_summary": forecast_result.get("training_summary") or {},
        "preliminary_selection_confidence": forecast_result.get("selection_confidence") or {},
        "preliminary_selection_explanation": forecast_result.get("selection_explanation") or {},
        "preliminary_feature_importance": forecast_result.get("feature_importance") or [],
    })
    forecast_result["validation_summary"] = forecast_summary
    forecast_result["forecast_scope"] = "historical_dengue_only"
    forecast_result["forecast_stage"] = "preliminary"
    forecast_result["is_preliminary_forecast"] = True
    forecast_database_result = save_forecast_result(
        forecast_result=forecast_result,
        dengue_upload_id=upload_id,
        integration_run_id=None,
        resolve_latest_integration_if_missing=False,
    )

    return {
        "message": "Dengue source uploaded, cleaned, and forecasted from historical dengue data. Upload the remaining three sources for the complete multi-source forecast.",
        "database_upload_id": upload_id,
        "database_forecast": forecast_database_result,
        "database_forecast_run_id": forecast_database_result.get("forecast_run_id"),
        "inspect_result": {
            "message": "File inspected successfully.",
            "filename": resolved_filename or filename,
            "file_type": file_type,
            "row_count": int(len(df)),
            "column_count": int(len(df.columns)),
            "columns": list(df.columns),
            "dengue_detection": prepared.get("dengue_detection", {}),
            "preview": df.head(5).fillna("").astype(str).to_dict(orient="records"),
        },
        "clean_result": _compact_validation_response(clean_result),
        "summary_result": {
            "message": "Summary skipped in fast upload mode to keep large live uploads responsive.",
            "row_count": int(len(df)),
        },
        "forecast_result": _compact_validation_response(forecast_result),
        "forecast_deferred": False,
    }


@router.post("/population")
async def upload_population_source(file: UploadFile = File(...)):
    filename = _safe_filename(file, "population_dataset")
    content = await _read_upload_bytes_limited(file)
    result = await validate_population_file(_upload_from_bytes(filename, content))
    _store_population_result(result)

    upload_id = _save_population_upload(result, filename, content)

    return {
        "message": "Population source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": _compact_validation_response(result),
    }


@router.post("/weather")
async def upload_weather_source(file: UploadFile = File(...)):
    filename = _safe_filename(file, "weather_dataset")
    content = await _read_upload_bytes_limited(file)
    result = await validate_weather_file(_upload_from_bytes(filename, content))
    _store_weather_result(result)

    upload_id = _save_weather_upload(result, filename, content)

    return {
        "message": "Weather source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": _compact_validation_response(result),
    }


@router.post("/boundary")
async def upload_boundary_source(file: UploadFile = File(...)):
    filename = _safe_filename(file, "barangay_boundary_dataset")
    content = await _read_upload_bytes_limited(file)
    result = await validate_boundary_file(_upload_from_bytes(filename, content))
    _store_boundary_result(result)

    upload_id = _save_boundary_upload(result, filename, content)

    boundary_database_result = save_boundary_geojson(
        boundary_result=result,
        upload_id=upload_id,
    )

    return {
        "message": "Boundary source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "database_boundary": boundary_database_result,
        "validate_result": result,
    }
