from copy import deepcopy
from pathlib import Path
import json
import re

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
    "bgy",
    "BGY",
    "bgy_name",
    "BGY_NAME",
    "name",
    "NAME",
    "adm4_name",
    "ADM4_NAME",
    "adm4_ref_name",
    "ADM4_REF_NAME",
    "adm4_en",
    "ADM4_EN",
    "NAME_4",
    "name_4",
    "ADM4_PCODE",
    "adm4_pcode",
]

BOUNDARY_CODE_FIELDS = [
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
    "bgy_code",
    "BGY_CODE",
    "ADM4_PCODE",
    "adm4_pcode",
    "adm4_code",
    "ADM4_CODE",
]

BOUNDARY_STANDARD_SCHEMA = [
    "barangay",
    "barangay_key",
    "barangay_raw",
    "geometry_type",
    "psgc",
    "status",
]


def clean_property_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value).replace("\ufeff", "").strip().lower()).strip("_")


def compact_property_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", clean_property_name(value))


def has_text(value) -> bool:
    return value is not None and str(value).strip() and str(value).strip().lower() not in ["nan", "none", "null"]


def text_ratio(values) -> float:
    usable = [str(value).strip() for value in values if has_text(value)]
    if not usable:
        return 0.0
    return sum(bool(re.search(r"[A-Za-z]", value)) for value in usable) / len(usable)


def numeric_ratio(values) -> float:
    usable = [str(value).strip().replace(",", "") for value in values if has_text(value)]
    if not usable:
        return 0.0
    numeric_count = 0
    for value in usable:
        try:
            float(value)
            numeric_count += 1
        except Exception:
            pass
    return numeric_count / len(usable)


def collect_property_samples(features: list[dict], limit: int = 250):
    samples: dict[str, list] = {}

    for feature in features[:limit]:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties") or {}
        if not isinstance(properties, dict):
            continue
        for key, value in properties.items():
            samples.setdefault(key, []).append(value)

    return samples


def score_boundary_property(field: str, property_name: str, values: list) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    compact = compact_property_name(property_name)
    normalized = clean_property_name(property_name)

    if field == "name":
        aliases = BOUNDARY_NAME_FIELDS
        keywords = ["barangay", "brgy", "bgy", "village", "adm4", "name", "municipality", "locality"]
        negatives = ["code", "pcode", "psgc", "id", "area", "population", "pop", "geometry", "shape"]
    else:
        aliases = BOUNDARY_CODE_FIELDS
        keywords = ["psgc", "code", "pcode", "geocode", "adm4code", "brgycode", "barangaycode"]
        negatives = ["name", "barangayname", "brgyname", "population", "area", "geometry", "shape"]

    alias_norms = [clean_property_name(alias) for alias in aliases]
    alias_compacts = [compact_property_name(alias) for alias in aliases]

    if normalized in alias_norms or compact in alias_compacts:
        score += 95
        reasons.append("exact property match")

    for alias in alias_norms:
        alias_compact = compact_property_name(alias)
        if alias and len(alias_compact) >= 4 and (alias in normalized or normalized in alias):
            score += 30
            reasons.append(f"property resembles {alias}")
            break

    for keyword in keywords:
        key = compact_property_name(keyword)
        if key and key in compact:
            score += 18
            reasons.append(f"property contains {keyword}")

    for negative in negatives:
        key = compact_property_name(negative)
        if key and key in compact:
            score -= 24
            reasons.append(f"property conflicts with {negative}")

    usable_values = [value for value in values if has_text(value)]
    unique_count = len({str(value).strip().lower() for value in usable_values})

    if field == "name":
        value_text_ratio = text_ratio(usable_values)
        value_numeric_ratio = numeric_ratio(usable_values)
        if value_text_ratio >= 0.65 and value_numeric_ratio <= 0.25:
            score += 42
            reasons.append("values look like barangay names")
        if unique_count >= 2:
            score += min(18, unique_count * 1.4)
            reasons.append("multiple unique boundary names")

    if field == "code":
        code_like_count = 0
        for value in usable_values:
            raw = str(value).strip()
            if re.fullmatch(r"[A-Za-z0-9_\-]{4,40}", raw):
                code_like_count += 1
        if usable_values and code_like_count / len(usable_values) >= 0.65:
            score += 34
            reasons.append("values look like location codes")
        if numeric_ratio(usable_values) >= 0.65:
            score += 12
            reasons.append("numeric values look like PSGC/code values")

    return score, reasons[:5]


def detect_boundary_fields(features: list[dict]):
    property_samples = collect_property_samples(features)
    matched_fields = {
        "geojson_type": "FeatureCollection",
        "features": "features",
        "geometry": "geometry",
        "properties": "properties",
    }
    field_confidence = {}
    field_detection_details = {}
    field_candidates = {}

    for field in ["name", "code"]:
        candidates = []
        for property_name, values in property_samples.items():
            score, reasons = score_boundary_property(field, property_name, values)
            candidates.append({
                "property": property_name,
                "score": round(max(score, 0), 2),
                "reasons": reasons,
            })
        candidates.sort(key=lambda item: item["score"], reverse=True)
        field_candidates[field] = candidates[:5]

    name_candidate = next((item for item in field_candidates.get("name", []) if item["score"] >= 42), None)

    def is_usable_code_candidate(item):
        if item["score"] < 38:
            return False
        if name_candidate and item.get("property") == name_candidate.get("property"):
            return False
        return True

    code_candidate = next((item for item in field_candidates.get("code", []) if is_usable_code_candidate(item)), None)

    if name_candidate:
        matched_fields["barangay_name_property"] = name_candidate["property"]
        confidence = int(max(0, min(100, round(name_candidate["score"]))))
        field_confidence["barangay_name_property"] = confidence
        field_detection_details["barangay_name_property"] = {
            "property": name_candidate["property"],
            "confidence": confidence,
            "reasons": name_candidate.get("reasons", []),
        }

    if code_candidate:
        matched_fields["code_property"] = code_candidate["property"]
        confidence = int(max(0, min(100, round(code_candidate["score"]))))
        field_confidence["code_property"] = confidence
        field_detection_details["code_property"] = {
            "property": code_candidate["property"],
            "confidence": confidence,
            "reasons": code_candidate.get("reasons", []),
        }

    has_name = "barangay_name_property" in matched_fields
    readiness = "ready_for_mapping" if has_name else "needs_review"
    dataset_type = "likely_boundary_dataset" if has_name else "possible_boundary_dataset"
    missing_required_fields = [] if has_name else ["barangay name property"]

    confidence_score = field_confidence.get("barangay_name_property", 0)
    mapping_summary = ", ".join(
        f"{field} → {source}"
        for field, source in matched_fields.items()
        if field not in ["geojson_type", "features", "geometry", "properties"]
    )

    return {
        "dataset_type": dataset_type,
        "readiness": readiness,
        "matched_fields": matched_fields,
        "missing_required_fields": missing_required_fields,
        "confidence_score": confidence_score,
        "field_confidence": field_confidence,
        "field_detection_details": field_detection_details,
        "field_candidates": field_candidates,
        "detection_method": "adaptive_boundary_property_detection",
        "mapping_summary": mapping_summary,
        "standard_schema": BOUNDARY_STANDARD_SCHEMA,
    }


def get_property_value(properties: dict, selected_field: str | None, fallback_fields: list[str]):
    if selected_field and has_text(properties.get(selected_field)):
        return str(properties.get(selected_field)).strip()

    for field in fallback_fields:
        value = properties.get(field)
        if has_text(value):
            return str(value).strip()

    # Case-insensitive fallback for files with unexpected property casing.
    lower_lookup = {str(key).lower(): value for key, value in properties.items()}
    for field in fallback_fields:
        value = lower_lookup.get(str(field).lower())
        if has_text(value):
            return str(value).strip()

    return ""


def get_boundary_name(feature: dict, index: int, name_field: str | None = None):
    properties = feature.get("properties") or {}
    value = get_property_value(properties, name_field, BOUNDARY_NAME_FIELDS)
    return value if value else f"Boundary {index + 1}"


def get_boundary_code(feature: dict, code_field: str | None = None):
    properties = feature.get("properties") or {}
    return get_property_value(properties, code_field, BOUNDARY_CODE_FIELDS)


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
        data = json.loads(content.decode("utf-8-sig"))
    except UnicodeDecodeError:
        data = json.loads(content.decode("latin-1"))
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

    boundary_detection = detect_boundary_fields(features)
    name_field = boundary_detection.get("matched_fields", {}).get("barangay_name_property")
    code_field = boundary_detection.get("matched_fields", {}).get("code_property")

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
        raw_name = get_boundary_name(feature, index, name_field)
        psgc = get_boundary_code(feature, code_field)

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
        "normalized_barangay_count": int(len({row["barangay_key"] for row in valid_rows})),
        "feature_count": int(len(features)),
        "valid_feature_count": int(len(valid_rows)),
    }

    if validation_summary["valid_feature_count"] == 0:
        boundary_detection["readiness"] = "needs_review"

    return {
        "cleaned_geojson": cleaned_geojson,
        "preview_rows": preview_rows,
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "validation_summary": validation_summary,
        "boundary_detection": boundary_detection,
    }


async def validate_boundary_file(file: UploadFile):
    data, filename, file_type = await read_boundary_file(file)

    prepared = prepare_clean_boundary_geojson(data)

    validation_summary = prepared["validation_summary"]
    preview_rows = prepared["preview_rows"]
    valid_rows = prepared["valid_rows"]
    invalid_rows = prepared["invalid_rows"]
    cleaned_geojson = prepared["cleaned_geojson"]
    boundary_detection = prepared["boundary_detection"]

    return {
        "message": "Boundary file validated successfully.",
        "filename": filename,
        "file_type": file_type,
        "original_feature_count": int(validation_summary["feature_count"]),
        "valid_feature_count": int(validation_summary["valid_feature_count"]),
        "invalid_feature_count": int(validation_summary["feature_count"] - validation_summary["valid_feature_count"]),
        "standard_columns": BOUNDARY_STANDARD_SCHEMA,
        "validation_summary": validation_summary,
        "cleaned_preview": preview_rows[:25],
        "invalid_preview": invalid_rows[:25],
        "cleaned_geojson": cleaned_geojson,
        "boundary_detection": boundary_detection,
    }
