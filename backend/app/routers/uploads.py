from io import BytesIO

from fastapi import APIRouter, File, UploadFile

from app.services.baseline_forecast import generate_baseline_dengue_forecast
from app.services.boundary_inspector import validate_boundary_file
from app.services.database_boundaries import get_latest_boundary_geojson, save_boundary_geojson
from app.services.database_forecasts import save_forecast_result
from app.services.database_uploads import get_latest_dataset_uploads, save_dataset_upload
from app.services.file_inspector import (
    clean_dengue_file,
    inspect_tabular_file,
    summarize_dengue_file,
)
from app.services.integration_state import set_integration_source, set_latest_forecast_result
from app.services.population_inspector import validate_population_file
from app.services.weather_inspector import validate_weather_file

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)


@router.get("/database-status")
async def get_upload_database_status():
    return get_latest_dataset_uploads()


@router.get("/latest-boundary-geojson")
async def get_latest_saved_boundary_geojson():
    return get_latest_boundary_geojson()


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
    return result


@router.post("/summarize-dengue")
async def summarize_dengue_upload(file: UploadFile = File(...)):
    return await summarize_dengue_file(file)


@router.post("/forecast-dengue")
async def forecast_dengue_upload(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "dengue_dataset"

    clean_result = await clean_dengue_file(_upload_from_bytes(filename, content))
    result = await generate_baseline_dengue_forecast(_upload_from_bytes(filename, content))

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

    return result


@router.post("/validate-population")
async def validate_population_upload(file: UploadFile = File(...)):
    result = await validate_population_file(file)
    _store_population_result(result)

    upload_id = _save_population_upload(result, file.filename or "population_dataset")

    result["database_upload_id"] = upload_id
    return result


@router.post("/validate-weather")
async def validate_weather_upload(file: UploadFile = File(...)):
    result = await validate_weather_file(file)
    _store_weather_result(result)

    upload_id = _save_weather_upload(result, file.filename or "weather_dataset")

    result["database_upload_id"] = upload_id
    return result


@router.post("/validate-boundary")
async def validate_boundary_upload(file: UploadFile = File(...)):
    result = await validate_boundary_file(file)
    _store_boundary_result(result)

    upload_id = _save_boundary_upload(result, file.filename or "barangay_boundary_dataset")

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


@router.post("/dengue")
async def upload_dengue_source(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "dengue_dataset"

    inspect_result = await inspect_tabular_file(_upload_from_bytes(filename, content))
    clean_result = await clean_dengue_file(_upload_from_bytes(filename, content))
    summary_result = await summarize_dengue_file(_upload_from_bytes(filename, content))
    forecast_result = await generate_baseline_dengue_forecast(_upload_from_bytes(filename, content))

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
        "inspect_result": inspect_result,
        "clean_result": clean_result,
        "summary_result": summary_result,
        "forecast_result": forecast_result,
    }


@router.post("/population")
async def upload_population_source(file: UploadFile = File(...)):
    result = await validate_population_file(file)
    _store_population_result(result)

    upload_id = _save_population_upload(result, file.filename or "population_dataset")

    return {
        "message": "Population source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": result,
    }


@router.post("/weather")
async def upload_weather_source(file: UploadFile = File(...)):
    result = await validate_weather_file(file)
    _store_weather_result(result)

    upload_id = _save_weather_upload(result, file.filename or "weather_dataset")

    return {
        "message": "Weather source uploaded, validated, stored for backend integration, and saved to Supabase.",
        "database_upload_id": upload_id,
        "validate_result": result,
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
