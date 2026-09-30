import threading
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import text

from app.database import engine

DEFAULT_MODERATE_THRESHOLD = 25
DEFAULT_HIGH_THRESHOLD = 60
_CACHE_LOCK = threading.Lock()
_CACHE = None


def _defaults():
    return {
        "moderate_threshold": DEFAULT_MODERATE_THRESHOLD,
        "high_threshold": DEFAULT_HIGH_THRESHOLD,
        "is_default": True,
        "updated_at": None,
        "updated_by": "System default",
    }


def ensure_risk_configuration_table():
    with engine.begin() as connection:
        connection.execute(text("""
            create table if not exists public.risk_classification_config (
                id integer primary key,
                moderate_threshold integer not null,
                high_threshold integer not null,
                updated_at timestamptz not null default now(),
                updated_by text not null default 'System default',
                constraint risk_classification_config_singleton check (id = 1),
                constraint risk_classification_config_nonnegative check (moderate_threshold >= 0),
                constraint risk_classification_config_order check (high_threshold > moderate_threshold)
            )
        """))
        connection.execute(text("""
            insert into public.risk_classification_config
                (id, moderate_threshold, high_threshold, updated_by)
            values (1, :moderate, :high, 'System default')
            on conflict (id) do nothing
        """), {"moderate": DEFAULT_MODERATE_THRESHOLD, "high": DEFAULT_HIGH_THRESHOLD})


def _load_from_database():
    try:
        with engine.connect() as connection:
            row = connection.execute(text("""
                select moderate_threshold, high_threshold, updated_at, updated_by
                from public.risk_classification_config
                where id = 1
            """)).mappings().first()
        if not row:
            return _defaults()
        moderate = int(row["moderate_threshold"])
        high = int(row["high_threshold"])
        return {
            "moderate_threshold": moderate,
            "high_threshold": high,
            "is_default": moderate == DEFAULT_MODERATE_THRESHOLD and high == DEFAULT_HIGH_THRESHOLD,
            "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
            "updated_by": row.get("updated_by") or "CHO/Admin",
        }
    except Exception:
        # Configuration must never make forecasting unavailable. The original
        # 25/60 behavior remains the safe fallback if persistence is unavailable.
        return _defaults()


def get_risk_configuration(force=False):
    global _CACHE
    with _CACHE_LOCK:
        if _CACHE is None or force:
            _CACHE = _load_from_database()
        return deepcopy(_CACHE)


def validate_thresholds(moderate_threshold, high_threshold):
    moderate = int(moderate_threshold)
    high = int(high_threshold)
    if moderate < 0:
        raise ValueError("Moderate threshold cannot be negative.")
    if high <= moderate:
        raise ValueError("High threshold must be greater than the moderate threshold.")
    if high > 1_000_000:
        raise ValueError("High threshold is outside the supported range.")
    return moderate, high


def save_risk_configuration(moderate_threshold, high_threshold, updated_by="CHO/Admin"):
    global _CACHE
    moderate, high = validate_thresholds(moderate_threshold, high_threshold)
    with engine.begin() as connection:
        connection.execute(text("""
            insert into public.risk_classification_config
                (id, moderate_threshold, high_threshold, updated_at, updated_by)
            values (1, :moderate, :high, now(), :updated_by)
            on conflict (id) do update set
                moderate_threshold = excluded.moderate_threshold,
                high_threshold = excluded.high_threshold,
                updated_at = now(),
                updated_by = excluded.updated_by
        """), {"moderate": moderate, "high": high, "updated_by": str(updated_by or "CHO/Admin")[:160]})
    _CACHE = None
    return get_risk_configuration(force=True)


def reset_risk_configuration(updated_by="CHO/Admin"):
    return save_risk_configuration(DEFAULT_MODERATE_THRESHOLD, DEFAULT_HIGH_THRESHOLD, updated_by)


def classify_forecast_cases(value):
    config = get_risk_configuration()
    cases = int(round(max(float(value or 0), 0)))
    if cases >= config["high_threshold"]:
        return "High"
    if cases >= config["moderate_threshold"]:
        return "Moderate"
    return "Low"


def public_risk_configuration():
    config = get_risk_configuration()
    return {
        **config,
        "default_moderate_threshold": DEFAULT_MODERATE_THRESHOLD,
        "default_high_threshold": DEFAULT_HIGH_THRESHOLD,
        "ranges": {
            "low": {"min": 0, "max_exclusive": config["moderate_threshold"]},
            "moderate": {"min": config["moderate_threshold"], "max_exclusive": config["high_threshold"]},
            "high": {"min": config["high_threshold"], "max": None},
        },
    }
