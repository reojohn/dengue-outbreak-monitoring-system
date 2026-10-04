import json
import threading
from copy import deepcopy

from sqlalchemy import text

from app.database import engine

DEFAULT_TEMPLATES = {
    "immediate_response": {
        "label": "Immediate Response",
        "recommendation": "Immediate coordinated response is recommended because high risk is reinforced by forecast, trend, exposure, or environmental pressure.",
        "response_plan": [
            "Activate barangay-level dengue alert and coordinate response within 24 to 48 hours.",
            "Conduct rapid source reduction and focused inspection in priority locations.",
            "Deploy BHWs for fever case checking, household advisories, and immediate reporting.",
            "Coordinate cleanup operations with barangay officials, sanitation teams, and community volunteers.",
        ],
    },
    "high_priority_response": {
        "label": "High Priority Response",
        "recommendation": "Prioritize this barangay for source reduction, case validation, and intensified dengue advisories within the current reporting cycle.",
        "response_plan": [
            "Schedule priority source reduction and environmental sanitation within the current reporting cycle.",
            "Inspect locations with repeated dengue reports and possible mosquito breeding sites.",
            "Strengthen barangay advisories through BHWs and community channels.",
            "Monitor each reporting update and escalate if pressure continues to increase.",
        ],
    },
    "escalated_watch": {
        "label": "Escalated Watch",
        "recommendation": "Escalate preventive action because moderate risk is combined with increasing trend, dense population exposure, or weather pressure.",
        "response_plan": [
            "Increase surveillance and targeted inspection in priority locations.",
            "Prepare cleanup and IEC activities before the barangay shifts into high-risk status.",
            "Validate new reports during the next reporting period and compare them with the forecast.",
        ],
    },
    "preventive_intensification": {
        "label": "Preventive Intensification",
        "recommendation": "Strengthen prevention because weather, case movement, or exposure indicators may allow risk to worsen.",
        "response_plan": [
            "Strengthen preventive messaging and reporting-period monitoring.",
            "Inspect common breeding areas and remind households to remove standing water.",
            "Coordinate with BHWs to watch for clustering of fever cases.",
            "Reassess the barangay after the next reporting period.",
        ],
    },
    "close_monitoring": {
        "label": "Close Monitoring",
        "recommendation": "Maintain close weekly monitoring and targeted inspection because the barangay remains at moderate risk.",
        "response_plan": [
            "Continue close monitoring and routine source reduction activities.",
            "Focus inspections on areas with previous dengue reports or poor drainage conditions.",
            "Keep barangay advisories active and encourage early consultation for fever symptoms.",
        ],
    },
    "early_warning_watch": {
        "label": "Early Warning Watch",
        "recommendation": "Place the barangay under early warning watch because case movement or environmental indicators are elevated even though current case risk is still low.",
        "response_plan": [
            "Flag the barangay for early warning while the current forecast risk remains low.",
            "Verify recent reports and check whether cases are clustered in one purok or household group.",
            "Send preventive reminders through BHWs and barangay communication channels.",
            "Monitor the next reporting period before deciding whether to escalate response.",
        ],
    },
    "routine_monitoring": {
        "label": "Routine Monitoring",
        "recommendation": "Maintain routine dengue monitoring, sanitation activities, and public reminders.",
        "response_plan": [
            "Maintain routine dengue surveillance and regular environmental sanitation activities.",
            "Continue household reminders on eliminating stagnant water and seeking early consultation for fever symptoms.",
            "Track the next reporting period to ensure cases do not increase.",
        ],
    },
}

_CACHE = None
_LOCK = threading.Lock()


def _defaults():
    return {"templates": deepcopy(DEFAULT_TEMPLATES), "is_default": True, "updated_at": None, "updated_by": "System default"}


def ensure_response_configuration_table():
    with engine.begin() as connection:
        connection.execute(text("""
            create table if not exists public.recommended_response_config (
                id integer primary key,
                templates jsonb not null,
                updated_at timestamptz not null default now(),
                updated_by text not null default 'System default',
                constraint recommended_response_config_singleton check (id = 1)
            )
        """))
        connection.execute(text("""
            insert into public.recommended_response_config (id, templates, updated_by)
            values (1, cast(:templates as jsonb), 'System default')
            on conflict (id) do nothing
        """), {"templates": json.dumps(DEFAULT_TEMPLATES)})


def _normalize_templates(value):
    source = value if isinstance(value, dict) else {}
    normalized = {}
    for key, default in DEFAULT_TEMPLATES.items():
        item = source.get(key) if isinstance(source.get(key), dict) else {}
        recommendation = str(item.get("recommendation") or default["recommendation"]).strip()
        raw_plan = item.get("response_plan") if isinstance(item.get("response_plan"), list) else default["response_plan"]
        plan = [str(step).strip() for step in raw_plan if str(step).strip()][:12]
        normalized[key] = {"label": default["label"], "recommendation": recommendation[:1200], "response_plan": [x[:800] for x in plan]}
    return normalized


def _load():
    try:
        ensure_response_configuration_table()
        with engine.connect() as connection:
            row = connection.execute(text("select templates, updated_at, updated_by from public.recommended_response_config where id=1")).mappings().first()
        if not row:
            return _defaults()
        templates = _normalize_templates(row["templates"])
        return {"templates": templates, "is_default": templates == DEFAULT_TEMPLATES, "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None, "updated_by": row.get("updated_by") or "CHO/Admin"}
    except Exception:
        return _defaults()


def get_response_configuration(force=False):
    global _CACHE
    with _LOCK:
        if _CACHE is None or force:
            _CACHE = _load()
        return deepcopy(_CACHE)


def save_response_configuration(templates, updated_by="CHO/Admin"):
    global _CACHE
    normalized = _normalize_templates(templates)
    if not all(normalized[k]["recommendation"] for k in DEFAULT_TEMPLATES):
        raise ValueError("Each response category must have a recommended response.")
    ensure_response_configuration_table()
    with engine.begin() as connection:
        connection.execute(text("""
            insert into public.recommended_response_config (id, templates, updated_at, updated_by)
            values (1, cast(:templates as jsonb), now(), :updated_by)
            on conflict (id) do update set templates=excluded.templates, updated_at=now(), updated_by=excluded.updated_by
        """), {"templates": json.dumps(normalized), "updated_by": str(updated_by or "CHO/Admin")[:160]})
    _CACHE = None
    return get_response_configuration(force=True)


def reset_response_configuration(updated_by="CHO/Admin"):
    return save_response_configuration(DEFAULT_TEMPLATES, updated_by)


def get_response_template_by_priority(priority):
    key = str(priority or "").strip().lower().replace(" ", "_")
    aliases = {
        "immediate_response": "immediate_response",
        "high_priority_response": "high_priority_response",
        "escalated_watch": "escalated_watch",
        "preventive_intensification": "preventive_intensification",
        "close_monitoring": "close_monitoring",
        "early_warning_watch": "early_warning_watch",
        "routine_monitoring": "routine_monitoring",
    }
    resolved = aliases.get(key, "routine_monitoring")
    config = get_response_configuration()
    return deepcopy(config["templates"].get(resolved) or DEFAULT_TEMPLATES[resolved])


def public_response_configuration():
    return get_response_configuration()
