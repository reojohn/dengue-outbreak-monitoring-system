from copy import deepcopy
from datetime import datetime, timezone


_SOURCE_KEYS = ["dengue", "weather", "population", "boundary"]

_INTEGRATION_STORE = {
    source_key: None
    for source_key in _SOURCE_KEYS
}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def set_integration_source(source_key: str, payload: dict):
    if source_key not in _INTEGRATION_STORE:
        raise ValueError(f"Unknown integration source: {source_key}")

    safe_payload = deepcopy(payload or {})
    safe_payload["source_key"] = source_key
    safe_payload["updated_at"] = _now_iso()
    _INTEGRATION_STORE[source_key] = safe_payload

    return deepcopy(safe_payload)


def get_integration_source(source_key: str):
    if source_key not in _INTEGRATION_STORE:
        raise ValueError(f"Unknown integration source: {source_key}")

    source = _INTEGRATION_STORE.get(source_key)
    return deepcopy(source) if source else None


def get_all_integration_sources():
    return {
        source_key: get_integration_source(source_key)
        for source_key in _SOURCE_KEYS
    }


def clear_integration_sources():
    for source_key in _SOURCE_KEYS:
        _INTEGRATION_STORE[source_key] = None

    return get_all_integration_sources()


def build_source_status_summary():
    sources = get_all_integration_sources()
    source_status = {}

    for source_key, source in sources.items():
        source_status[source_key] = {
            "loaded": bool(source),
            "filename": source.get("filename", "") if source else "",
            "record_count": int(source.get("record_count", 0)) if source else 0,
            "valid_count": int(source.get("valid_count", 0)) if source else 0,
            "invalid_count": int(source.get("invalid_count", 0)) if source else 0,
            "updated_at": source.get("updated_at") if source else None,
        }

    loaded_sources = [
        source_key
        for source_key, status in source_status.items()
        if status["loaded"]
    ]

    missing_sources = [
        source_key
        for source_key in _SOURCE_KEYS
        if source_key not in loaded_sources
    ]

    can_build_dataset = bool(source_status["dengue"]["loaded"])
    complete = len(missing_sources) == 0

    return {
        "status": "ready" if complete else "partial" if loaded_sources else "empty",
        "can_build_dataset": can_build_dataset,
        "complete": complete,
        "loaded_source_count": len(loaded_sources),
        "required_source_count": len(_SOURCE_KEYS),
        "loaded_sources": loaded_sources,
        "missing_sources": missing_sources,
        "sources": source_status,
        "message": (
            "All source datasets are loaded and ready for backend integration."
            if complete
            else "Backend integration is partially ready. Upload missing source datasets to complete the multi-source pipeline."
            if loaded_sources
            else "No source datasets have been loaded into the backend integration workspace."
        ),
    }
