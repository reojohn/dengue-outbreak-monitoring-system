from io import BytesIO

from fastapi import APIRouter, File, UploadFile

from app.services.baseline_forecast import generate_baseline_dengue_forecast
from app.services.boundary_inspector import validate_boundary_file
from app.services.file_inspector import (
    clean_dengue_file,
    inspect_tabular_file,
    summarize_dengue_file,
)
from app.services.integration_state import set_integration_source
from app.services.population_inspector import validate_population_file
from app.services.weather_inspector import validate_weather_file

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)


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
    return await generate_baseline_dengue_forecast(file)


@router.post("/validate-population")
async def validate_population_upload(file: UploadFile = File(...)):
    result = await validate_population_file(file)
    _store_population_result(result)
    return result


@router.post("/validate-weather")
async def validate_weather_upload(file: UploadFile = File(...)):
    result = await validate_weather_file(file)
    _store_weather_result(result)
    return result


@router.post("/validate-boundary")
async def validate_boundary_upload(file: UploadFile = File(...)):
    result = await validate_boundary_file(file)
    _store_boundary_result(result)
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

    return {
        "message": "Dengue source uploaded, cleaned, forecasted, and stored for backend integration.",
        "inspect_result": inspect_result,
        "clean_result": clean_result,
        "summary_result": summary_result,
        "forecast_result": forecast_result,
    }


@router.post("/population")
async def upload_population_source(file: UploadFile = File(...)):
    result = await validate_population_file(file)
    _store_population_result(result)

    return {
        "message": "Population source uploaded, validated, and stored for backend integration.",
        "validate_result": result,
    }


@router.post("/weather")
async def upload_weather_source(file: UploadFile = File(...)):
    result = await validate_weather_file(file)
    _store_weather_result(result)

    return {
        "message": "Weather source uploaded, validated, and stored for backend integration.",
        "validate_result": result,
    }


@router.post("/boundary")
async def upload_boundary_source(file: UploadFile = File(...)):
    result = await validate_boundary_file(file)
    _store_boundary_result(result)

    return {
        "message": "Boundary source uploaded, validated, and stored for backend integration.",
        "validate_result": result,
    }
