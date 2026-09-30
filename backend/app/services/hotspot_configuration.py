import threading
from copy import deepcopy

from sqlalchemy import text

from app.database import engine

DEFAULT_LOCAL_WEIGHT = 60
DEFAULT_NEARBY_WEIGHT = 25
DEFAULT_SPATIAL_WEIGHT = 15
DEFAULT_RADIUS_KM = 3.0
DEFAULT_WATCH_THRESHOLD = 45
DEFAULT_EMERGING_THRESHOLD = 60
DEFAULT_CONFIRMED_THRESHOLD = 75
_CACHE_LOCK = threading.Lock()
_CACHE = None


def _defaults():
    return {
        "local_weight": DEFAULT_LOCAL_WEIGHT,
        "nearby_weight": DEFAULT_NEARBY_WEIGHT,
        "spatial_weight": DEFAULT_SPATIAL_WEIGHT,
        "radius_km": DEFAULT_RADIUS_KM,
        "watch_threshold": DEFAULT_WATCH_THRESHOLD,
        "emerging_threshold": DEFAULT_EMERGING_THRESHOLD,
        "confirmed_threshold": DEFAULT_CONFIRMED_THRESHOLD,
        "is_default": True,
        "updated_at": None,
        "updated_by": "System default",
    }


def ensure_hotspot_configuration_table():
    with engine.begin() as connection:
        connection.execute(text("""
            create table if not exists public.hotspot_analysis_config (
                id integer primary key,
                local_weight integer not null,
                nearby_weight integer not null,
                spatial_weight integer not null,
                radius_km numeric not null,
                watch_threshold integer not null,
                emerging_threshold integer not null,
                confirmed_threshold integer not null,
                updated_at timestamptz not null default now(),
                updated_by text not null default 'System default',
                constraint hotspot_analysis_config_singleton check (id = 1),
                constraint hotspot_analysis_config_weights check (
                    local_weight >= 0 and nearby_weight >= 0 and spatial_weight >= 0
                    and local_weight + nearby_weight + spatial_weight = 100
                ),
                constraint hotspot_analysis_config_radius check (radius_km >= 0.5 and radius_km <= 15),
                constraint hotspot_analysis_config_thresholds check (
                    watch_threshold >= 0 and emerging_threshold > watch_threshold
                    and confirmed_threshold > emerging_threshold and confirmed_threshold <= 100
                )
            )
        """))
        connection.execute(text("""
            insert into public.hotspot_analysis_config
                (id, local_weight, nearby_weight, spatial_weight, radius_km,
                 watch_threshold, emerging_threshold, confirmed_threshold, updated_by)
            values (1, :local_weight, :nearby_weight, :spatial_weight, :radius_km,
                    :watch_threshold, :emerging_threshold, :confirmed_threshold, 'System default')
            on conflict (id) do nothing
        """), _defaults())


def _load_from_database():
    try:
        with engine.connect() as connection:
            row = connection.execute(text("""
                select local_weight, nearby_weight, spatial_weight, radius_km,
                       watch_threshold, emerging_threshold, confirmed_threshold,
                       updated_at, updated_by
                from public.hotspot_analysis_config where id = 1
            """)).mappings().first()
        if not row:
            return _defaults()
        config = {
            "local_weight": int(row["local_weight"]),
            "nearby_weight": int(row["nearby_weight"]),
            "spatial_weight": int(row["spatial_weight"]),
            "radius_km": float(row["radius_km"]),
            "watch_threshold": int(row["watch_threshold"]),
            "emerging_threshold": int(row["emerging_threshold"]),
            "confirmed_threshold": int(row["confirmed_threshold"]),
            "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
            "updated_by": row.get("updated_by") or "CHO/Admin",
        }
        defaults = _defaults()
        config["is_default"] = all(config[key] == defaults[key] for key in (
            "local_weight", "nearby_weight", "spatial_weight", "radius_km",
            "watch_threshold", "emerging_threshold", "confirmed_threshold",
        ))
        return config
    except Exception:
        return _defaults()


def get_hotspot_configuration(force=False):
    global _CACHE
    with _CACHE_LOCK:
        if _CACHE is None or force:
            _CACHE = _load_from_database()
        return deepcopy(_CACHE)


def validate_hotspot_configuration(local_weight, nearby_weight, spatial_weight, radius_km,
                                   watch_threshold, emerging_threshold, confirmed_threshold):
    local, nearby, spatial = int(local_weight), int(nearby_weight), int(spatial_weight)
    radius = float(radius_km)
    watch, emerging, confirmed = int(watch_threshold), int(emerging_threshold), int(confirmed_threshold)
    if min(local, nearby, spatial) < 0 or local + nearby + spatial != 100:
        raise ValueError("Hotspot weights must be non-negative and total exactly 100%.")
    if not 0.5 <= radius <= 15:
        raise ValueError("Nearby radius must be between 0.5 km and 15 km.")
    if watch < 0 or not (watch < emerging < confirmed <= 100):
        raise ValueError("Hotspot thresholds must increase in order and the confirmed threshold cannot exceed 100.")
    return local, nearby, spatial, radius, watch, emerging, confirmed


def _invalidate_saved_hotspot_runs():
    # A settings change makes previously calculated hotspot results stale.
    # Delete only the compact derived hotspot cache; source/integration data is untouched.
    try:
        with engine.begin() as connection:
            connection.execute(text("delete from public.hotspot_runs"))
    except Exception:
        pass


def save_hotspot_configuration(local_weight, nearby_weight, spatial_weight, radius_km,
                               watch_threshold, emerging_threshold, confirmed_threshold,
                               updated_by="CHO/Admin"):
    global _CACHE
    local, nearby, spatial, radius, watch, emerging, confirmed = validate_hotspot_configuration(
        local_weight, nearby_weight, spatial_weight, radius_km,
        watch_threshold, emerging_threshold, confirmed_threshold,
    )
    with engine.begin() as connection:
        connection.execute(text("""
            insert into public.hotspot_analysis_config
                (id, local_weight, nearby_weight, spatial_weight, radius_km,
                 watch_threshold, emerging_threshold, confirmed_threshold, updated_at, updated_by)
            values (1, :local, :nearby, :spatial, :radius, :watch, :emerging, :confirmed, now(), :updated_by)
            on conflict (id) do update set
                local_weight=excluded.local_weight, nearby_weight=excluded.nearby_weight,
                spatial_weight=excluded.spatial_weight, radius_km=excluded.radius_km,
                watch_threshold=excluded.watch_threshold, emerging_threshold=excluded.emerging_threshold,
                confirmed_threshold=excluded.confirmed_threshold, updated_at=now(), updated_by=excluded.updated_by
        """), {"local": local, "nearby": nearby, "spatial": spatial, "radius": radius,
                 "watch": watch, "emerging": emerging, "confirmed": confirmed,
                 "updated_by": str(updated_by or "CHO/Admin")[:160]})
    _CACHE = None
    _invalidate_saved_hotspot_runs()
    return public_hotspot_configuration(force=True)


def reset_hotspot_configuration(updated_by="CHO/Admin"):
    return save_hotspot_configuration(
        DEFAULT_LOCAL_WEIGHT, DEFAULT_NEARBY_WEIGHT, DEFAULT_SPATIAL_WEIGHT, DEFAULT_RADIUS_KM,
        DEFAULT_WATCH_THRESHOLD, DEFAULT_EMERGING_THRESHOLD, DEFAULT_CONFIRMED_THRESHOLD, updated_by,
    )


def public_hotspot_configuration(force=False):
    config = get_hotspot_configuration(force=force)
    return {**config, "defaults": {
        "local_weight": DEFAULT_LOCAL_WEIGHT, "nearby_weight": DEFAULT_NEARBY_WEIGHT,
        "spatial_weight": DEFAULT_SPATIAL_WEIGHT, "radius_km": DEFAULT_RADIUS_KM,
        "watch_threshold": DEFAULT_WATCH_THRESHOLD, "emerging_threshold": DEFAULT_EMERGING_THRESHOLD,
        "confirmed_threshold": DEFAULT_CONFIRMED_THRESHOLD,
    }}
