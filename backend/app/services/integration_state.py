from copy import deepcopy
from datetime import datetime, timezone


_INTEGRATION_SOURCES = {
    "dengue": None,
    "weather": None,
    "population": None,
    "boundary": None,
}

_LATEST_FORECAST_RESULT = None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _safe_int(value, fallback=0):
    try:
        if value is None or value == "":
            return fallback
        return int(round(float(value)))
    except Exception:
        return fallback


def _safe_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in ["", "none", "nan", "null", "nat"]:
        return ""
    return text


def _source_loaded(source_key, source):
    if not source:
        return False

    if source.get("records"):
        return True

    if source_key == "boundary" and source.get("geojson"):
        features = (source.get("geojson") or {}).get("features")
        if isinstance(features, list) and len(features) > 0:
            return True

    if _safe_int(source.get("valid_count"), 0) > 0:
        return True

    if _safe_int(source.get("record_count"), 0) > 0:
        return True

    return False


def _summarize_source(source_key, source):
    source = source or {}
    loaded = _source_loaded(source_key, source)

    record_count = _safe_int(source.get("record_count"), 0)
    valid_count = _safe_int(source.get("valid_count"), 0)
    invalid_count = _safe_int(source.get("invalid_count"), 0)

    if record_count <= 0 and isinstance(source.get("records"), list):
        record_count = len(source.get("records") or [])

    if valid_count <= 0 and isinstance(source.get("records"), list):
        valid_count = len(source.get("records") or [])

    if source_key == "boundary":
        geojson = source.get("geojson") or {}
        features = geojson.get("features") if isinstance(geojson, dict) else []
        if isinstance(features, list) and features:
            if record_count <= 0:
                record_count = len(features)
            if valid_count <= 0:
                valid_count = len(features)

    return {
        "loaded": loaded,
        "filename": _safe_text(source.get("filename")),
        "file_type": _safe_text(source.get("file_type")),
        "record_count": record_count,
        "valid_count": valid_count,
        "invalid_count": invalid_count,
        "updated_at": source.get("updated_at") or source.get("timestamp"),
        "validation_summary": deepcopy(source.get("validation_summary") or {}),
        "detection": deepcopy(source.get("detection") or {}),
    }


def set_integration_source(source_key: str, payload: dict):
    safe_key = _safe_text(source_key).lower()

    if safe_key not in _INTEGRATION_SOURCES:
        _INTEGRATION_SOURCES[safe_key] = None

    stored_payload = deepcopy(payload or {})
    stored_payload["updated_at"] = stored_payload.get("updated_at") or now_iso()
    _INTEGRATION_SOURCES[safe_key] = stored_payload

    return deepcopy(stored_payload)


def get_integration_source(source_key: str):
    safe_key = _safe_text(source_key).lower()
    return deepcopy(_INTEGRATION_SOURCES.get(safe_key))


def get_all_integration_sources():
    return deepcopy(_INTEGRATION_SOURCES)


def clear_integration_sources():
    for key in list(_INTEGRATION_SOURCES.keys()):
        _INTEGRATION_SOURCES[key] = None
    return get_all_integration_sources()


def set_latest_forecast_result(forecast_result: dict):
    global _LATEST_FORECAST_RESULT

    stored_result = deepcopy(forecast_result or {})
    stored_result["updated_at"] = stored_result.get("updated_at") or now_iso()
    _LATEST_FORECAST_RESULT = stored_result

    return deepcopy(stored_result)


def get_latest_forecast_result():
    return deepcopy(_LATEST_FORECAST_RESULT)


def clear_latest_forecast_result():
    global _LATEST_FORECAST_RESULT
    _LATEST_FORECAST_RESULT = None
    return None


def build_source_status_summary():
    required_sources = ["dengue", "weather", "population", "boundary"]

    sources = {
        source_key: _summarize_source(source_key, _INTEGRATION_SOURCES.get(source_key))
        for source_key in required_sources
    }

    loaded_sources = [
        source_key
        for source_key in required_sources
        if sources[source_key].get("loaded")
    ]

    missing_sources = [
        source_key
        for source_key in required_sources
        if source_key not in loaded_sources
    ]

    total_valid_records = sum(
        _safe_int(sources[source_key].get("valid_count"), 0)
        for source_key in required_sources
    )

    all_required_loaded = len(missing_sources) == 0
    readiness_score = round((len(loaded_sources) / len(required_sources)) * 100)

    return {
        "message": "Backend source status summary generated successfully.",
        "generated_at": now_iso(),
        "ready": all_required_loaded,
        "all_required_loaded": all_required_loaded,
        "readiness_score": readiness_score,
        "required_sources": required_sources,
        "loaded_sources": loaded_sources,
        "missing_sources": missing_sources,
        "source_count": len(required_sources),
        "loaded_source_count": len(loaded_sources),
        "missing_source_count": len(missing_sources),
        "total_valid_records": total_valid_records,
        "sources": sources,
    }
