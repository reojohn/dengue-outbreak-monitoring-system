from copy import deepcopy
from pathlib import Path
import json

from fastapi import HTTPException, UploadFile

from app.services.barangay_normalizer import (
    canonicalize_barangay_name,
    normalize_barangay_key,
)


BOUNDARY_NAME_FIELDS = [
    "barangay",
    "BARANGAY",
    "barangay_name",
    "BARANGAY_NAME",
    "brgy",
    "BRGY",
    "brgy_name",
    "BRGY_NAME",
    "name",
    "NAME",
    "adm4_name",
    "ADM4_NAME",
    "adm4_en",
    "ADM4_EN",
    "NAME_4",
    "name_4",
    "ADM4_PCODE",
    "adm4_pcode",
]


def get_boundary_name(feature: dict, index: int):
    properties = feature.get("properties") or {}

    for field in BOUNDARY_NAME_FIELDS:
        value = properties.get(field)

        if value is not None and str(value).strip():
            return str(value).strip()

    return f"Boundary {index + 1}"


def get_boundary_code(feature: dict):
    properties = feature.get("properties") or {}

    code_fields = [
        "psgc",
        "PSGC",
        "psgc_code",
        "PSGC_CODE",
        "code",
        "CODE",
        "barangay_code",
        "BARANGAY_CODE",
        "brgy_code",
        "BRGY_CODE",
        "ADM4_PCODE",
        "adm4_pcode",
    ]

    for field in code_fields:
        value = properties.get(field)

        if value is not None and str(value).strip():
            return str(value).strip()

    return ""


def has_valid_geometry(feature: dict):
    geometry = feature.get("geometry")

    if not isinstance(geometry, dict):
        return False

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if not geometry_type:
        return False

    if coordinates is None:
        return False

    if geometry_type not in [
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
    ]:
        return False

    return True


async def read_boundary_file(file: UploadFile):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in [".json", ".geojson"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported boundary file type. Please upload a GeoJSON or JSON file.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded boundary file is empty.")

    try:
        data = json.loads(content.decode("utf-8"))
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read boundary JSON file. Error: {str(error)}",
        )

    return data, filename, "geojson" if extension == ".geojson" else "json"


def prepare_clean_boundary_geojson(data: dict):
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail="Boundary file must be a valid GeoJSON FeatureCollection object.",
        )

    if data.get("type") != "FeatureCollection":
        raise HTTPException(
            status_code=400,
            detail="Boundary file must have type FeatureCollection.",
        )

    features = data.get("features")

    if not isinstance(features, list) or len(features) == 0:
        raise HTTPException(
            status_code=400,
            detail="Boundary file must contain a non-empty features array.",
        )

    cleaned_geojson = deepcopy(data)
    cleaned_features = []

    seen_barangay_keys = set()

    preview_rows = []
    valid_rows = []
    invalid_rows = []

    missing_name_count = 0
    invalid_geometry_count = 0
    duplicate_count = 0

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            raw_name = f"Boundary {index + 1}"
            barangay = raw_name
            barangay_key = normalize_barangay_key(raw_name)
            geometry_type = "Invalid feature"
            status = "Invalid feature"
            psgc = ""

            invalid_geometry_count += 1

            row = {
                "id": f"boundary-{index}",
                "barangay": barangay,
                "barangay_key": barangay_key,
                "barangay_raw": raw_name,
                "geometry_type": geometry_type,
                "psgc": psgc,
                "status": status,
            }

            preview_rows.append(row)
            invalid_rows.append(row)
            continue

        properties = feature.get("properties") or {}
        raw_name = get_boundary_name(feature, index)
        psgc = get_boundary_code(feature)

        barangay = canonicalize_barangay_name(raw_name)
        barangay_key = normalize_barangay_key(raw_name)

        geometry = feature.get("geometry") or {}
        geometry_type = geometry.get("type") or "No geometry"

        missing_name = raw_name == f"Boundary {index + 1}"
        invalid_geometry = not has_valid_geometry(feature)
        duplicate = barangay_key in seen_barangay_keys and not missing_name

        if not missing_name:
            seen_barangay_keys.add(barangay_key)

        if missing_name:
            missing_name_count += 1

        if invalid_geometry:
            invalid_geometry_count += 1

        if duplicate:
            duplicate_count += 1

        if missing_name:
            status = "Missing barangay name"
        elif invalid_geometry:
            status = "Missing or invalid geometry"
        elif duplicate:
            status = "Duplicate barangay boundary"
        else:
            status = "Valid"

        cleaned_feature = deepcopy(feature)
        cleaned_feature["properties"] = {
            **properties,
            "barangay": barangay,
            "barangay_key": barangay_key,
            "barangay_raw": raw_name,
            "psgc": psgc,
            "validation_status": status,
        }

        row = {
            "id": f"boundary-{index}",
            "barangay": barangay,
            "barangay_key": barangay_key,
            "barangay_raw": raw_name,
            "geometry_type": geometry_type,
            "psgc": psgc,
            "status": status,
        }

        preview_rows.append(row)

        if status == "Valid":
            valid_rows.append(row)
            cleaned_features.append(cleaned_feature)
        else:
            invalid_rows.append(row)

    cleaned_geojson["features"] = cleaned_features

    validation_summary = {
        "missing_barangay_name_rows": int(missing_name_count),
        "invalid_geometry_rows": int(invalid_geometry_count),
        "duplicate_boundary_rows": int(duplicate_count),
        "normalized_barangay_count": int(
            len({row["barangay_key"] for row in valid_rows})
        ),
        "feature_count": int(len(features)),
        "valid_feature_count": int(len(valid_rows)),
    }

    return {
        "cleaned_geojson": cleaned_geojson,
        "preview_rows": preview_rows,
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "validation_summary": validation_summary,
    }


async def validate_boundary_file(file: UploadFile):
    data, filename, file_type = await read_boundary_file(file)

    prepared = prepare_clean_boundary_geojson(data)

    validation_summary = prepared["validation_summary"]
    preview_rows = prepared["preview_rows"]
    valid_rows = prepared["valid_rows"]
    invalid_rows = prepared["invalid_rows"]
    cleaned_geojson = prepared["cleaned_geojson"]

    return {
        "message": "Boundary file validated successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_feature_count": int(validation_summary["feature_count"]),
        "valid_feature_count": int(validation_summary["valid_feature_count"]),
        "invalid_feature_count": int(
            validation_summary["feature_count"] - validation_summary["valid_feature_count"]
        ),
        "standard_columns": [
            "barangay",
            "barangay_key",
            "barangay_raw",
            "geometry_type",
            "psgc",
            "status",
        ],
        "validation_summary": validation_summary,
        "cleaned_preview": preview_rows[:25],
        "invalid_preview": invalid_rows[:25],
        "cleaned_geojson": cleaned_geojson,
        "boundary_detection": {
            "dataset_type": "likely_boundary_dataset",
            "readiness": "ready_for_mapping"
            if validation_summary["valid_feature_count"] > 0
            else "needs_review",
            "matched_fields": {
                "geojson_type": "FeatureCollection",
                "features": "features",
                "geometry": "geometry",
                "properties": "properties",
            },
            "missing_required_fields": [],
        },
    }