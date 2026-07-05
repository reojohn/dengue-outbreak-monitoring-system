from io import BytesIO

import asyncio
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, File, UploadFile

from app.services.auto_ml_forecast import generate_auto_ml_dengue_forecast, generate_auto_ml_dengue_forecast_from_dataframe
from app.services.boundary_inspector import validate_boundary_file
from app.services.database_boundaries import get_latest_boundary_geojson, save_boundary_geojson
from app.services.database_forecasts import save_forecast_result
from app.services.database_uploads import get_latest_dataset_previews, get_latest_dataset_uploads, save_dataset_upload
from app.services.file_inspector import (
    build_clean_dengue_result_from_dataframe,
    clean_dengue_file,
    inspect_tabular_file,
    prepare_clean_dengue_dataframe,
    read_tabular_file,
    summarize_dengue_file,
)
from app.services.integration_state import set_integration_source, set_latest_forecast_result
from app.services.population_inspector import validate_population_file
from app.services.weather_inspector import validate_weather_file

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)

UPLOAD_JOBS = {}


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _start_upload_job(dataset_type: str, filename: str, size_bytes: int):
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



@router.get("/database-status")
async def get_upload_database_status():
    return get_latest_dataset_uploads()


@router.get("/database-preview")
async def get_upload_database_preview(limit: int = 300):
    return get_latest_dataset_previews(limit=limit)


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


def _save_population_upload(result: dict, fallback_filename: str):
    return save_dataset_upload(
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


def _save_weather_upload(result: dict, fallback_filename: str):
    return save_dataset_upload(
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


def _save_boundary_upload(result: dict, fallback_filename: str):
    return save_dataset_upload(
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


def _save_dengue_upload(clean_result: dict, fallback_filename: str):
    return save_dataset_upload(
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


async def _process_dengue_forecast_bytes(content: bytes, filename: str):
    upload_file = _upload_from_bytes(filename, content)
    df, file_type, resolved_filename = await read_tabular_file(upload_file)
    prepared = prepare_clean_dengue_dataframe(df)
    clean_result = build_clean_dengue_result_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )
    result = generate_auto_ml_dengue_forecast_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )

    _store_dengue_result(clean_result)
    set_latest_forecast_result(result)

    upload_id = _save_dengue_upload(clean_result, filename)
    forecast_database_result = save_forecast_result(
        forecast_result=result,
        dengue_upload_id=upload_id,
    )

    result["database_upload_id"] = upload_id
    result["database_forecast"] = forecast_database_result
    result["database_forecast_run_id"] = forecast_database_result.get("forecast_run_id")
    result["cleaned_preview"] = clean_result.get("cleaned_preview", [])
    result["invalid_preview"] = clean_result.get("invalid_preview", result.get("invalid_preview", []))
    result["standard_columns"] = clean_result.get("standard_columns", [])

    return _compact_validation_response(result)


async def _process_population_bytes(content: bytes, filename: str):
    result = await validate_population_file(_upload_from_bytes(filename, content))
    _store_population_result(result)
    upload_id = _save_population_upload(result, filename or "population_dataset")
    result["database_upload_id"] = upload_id
    return _compact_validation_response(result)


async def _process_weather_bytes(content: bytes, filename: str):
    result = await validate_weather_file(_upload_from_bytes(filename, content))
    _store_weather_result(result)
    upload_id = _save_weather_upload(result, filename or "weather_dataset")
    result["database_upload_id"] = upload_id
    return _compact_validation_response(result)


async def _process_boundary_bytes(content: bytes, filename: str):
    result = await validate_boundary_file(_upload_from_bytes(filename, content))
    _store_boundary_result(result)

    upload_id = _save_boundary_upload(result, filename or "barangay_boundary_dataset")
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
    content = await file.read()

    return {
        "message": "File received successfully.",
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
    }


@router.post("/inspect")
async def inspect_upload(file: UploadFile = File(...)):
    return await inspect_tabular_file(file)


@router.post("/clean-dengue")
async def clean_dengue_upload(file: UploadFile = File(...)):
    result = await clean_dengue_file(file)
    _store_dengue_result(result)
    return _compact_validation_response(result)


@router.post("/summarize-dengue")
async def summarize_dengue_upload(file: UploadFile = File(...)):
    return await summarize_dengue_file(file)


@router.post("/forecast-dengue")
async def forecast_dengue_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = file.filename or "dengue_dataset"
    content = await file.read()
    job_id = _start_upload_job("dengue", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_dengue_forecast_bytes, content, filename)
    return _processing_response(job_id, "dengue", filename, len(content))


@router.post("/validate-population")
async def validate_population_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = file.filename or "population_dataset"
    content = await file.read()
    job_id = _start_upload_job("population", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_population_bytes, content, filename)
    return _processing_response(job_id, "population", filename, len(content))


@router.post("/validate-weather")
async def validate_weather_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = file.filename or "weather_dataset"
    content = await file.read()
    job_id = _start_upload_job("weather", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_weather_bytes, content, filename)
    return _processing_response(job_id, "weather", filename, len(content))


@router.post("/validate-boundary")
async def validate_boundary_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    filename = file.filename or "barangay_boundary_dataset"
    content = await file.read()
    job_id = _start_upload_job("boundary", filename, len(content))
    background_tasks.add_task(_run_upload_job, job_id, _process_boundary_bytes, content, filename)
    return _processing_response(job_id, "boundary", filename, len(content))


@router.post("/dengue")
async def upload_dengue_source(file: UploadFile = File(...)):
    filename = file.filename or "dengue_dataset"
    df, file_type, resolved_filename = await read_tabular_file(file)
    prepared = prepare_clean_dengue_dataframe(df)

    clean_result = build_clean_dengue_result_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )
    forecast_result = generate_auto_ml_dengue_forecast_from_dataframe(
        df,
        file_type=file_type,
        filename=resolved_filename or filename,
        prepared=prepared,
    )

    _store_dengue_result(clean_result)
    set_latest_forecast_result(forecast_result)

    upload_id = _save_dengue_upload(clean_result, filename)

    forecast_database_result = save_forecast_result(
        forecast_result=forecast_result,
        dengue_upload_id=upload_id,
    )

    return {
        "message": "Dengue source uploaded, cleaned, forecasted, stored for backend integration, and saved to Supabase.",
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
    }


@router.post("/population")
async def upload_population_source(file: UploadFile = File(...)):
    result = await validate_population_file(file)
    _store_population_result(result)

    upload_id = _save_population_upload(result, file.filename or "population_dataset")

    return {
        "message": "Population source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": _compact_validation_response(result),
    }


@router.post("/weather")
async def upload_weather_source(file: UploadFile = File(...)):
    result = await validate_weather_file(file)
    _store_weather_result(result)

    upload_id = _save_weather_upload(result, file.filename or "weather_dataset")

    return {
        "message": "Weather source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": _compact_validation_response(result),
    }


@router.post("/boundary")
async def upload_boundary_source(file: UploadFile = File(...)):
    result = await validate_boundary_file(file)
    _store_boundary_result(result)

    upload_id = _save_boundary_upload(result, file.filename or "barangay_boundary_dataset")

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
