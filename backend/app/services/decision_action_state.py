from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

_ALLOWED_STATUSES = {"Pending", "In Progress", "Completed"}

_DECISION_ACTIONS = []


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _safe_text(value, fallback=""):
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def _normalize_status(value):
    status = _safe_text(value, "Pending")
    return status if status in _ALLOWED_STATUSES else "Pending"


def create_decision_action(payload: dict):
    now = _now_iso()
    action = {
        "id": payload.get("id") or f"action-{uuid4().hex}",
        "barangay": _safe_text(payload.get("barangay"), "Unassigned barangay"),
        "risk_level": _safe_text(payload.get("risk_level"), "Pending"),
        "action": _safe_text(payload.get("action"), "Review dengue response recommendation."),
        "assigned_to": _safe_text(payload.get("assigned_to"), "Unassigned"),
        "status": _normalize_status(payload.get("status")),
        "due_date": _safe_text(payload.get("due_date"), ""),
        "follow_up_date": _safe_text(payload.get("follow_up_date"), _safe_text(payload.get("due_date"), "")),
        "intervention_type": _safe_text(payload.get("intervention_type"), "Barangay coordination"),
        "remarks": _safe_text(payload.get("remarks"), ""),
        "source": _safe_text(payload.get("source"), "decision_support"),
        "created_at": payload.get("created_at") or now,
        "updated_at": now,
    }

    _DECISION_ACTIONS.insert(0, action)
    del _DECISION_ACTIONS[200:]

    return deepcopy(action)


def list_decision_actions(status: str | None = None, barangay: str | None = None):
    actions = deepcopy(_DECISION_ACTIONS)

    if status:
        wanted_status = _normalize_status(status)
        actions = [action for action in actions if action.get("status") == wanted_status]

    if barangay:
        wanted_barangay = barangay.strip().lower()
        actions = [
            action for action in actions
            if action.get("barangay", "").strip().lower() == wanted_barangay
        ]

    return actions


def get_decision_action(action_id: str):
    for action in _DECISION_ACTIONS:
        if action.get("id") == action_id:
            return deepcopy(action)
    return None


def update_decision_action(action_id: str, payload: dict):
    for index, action in enumerate(_DECISION_ACTIONS):
        if action.get("id") != action_id:
            continue

        updated = deepcopy(action)
        editable_fields = [
            "barangay",
            "risk_level",
            "action",
            "assigned_to",
            "due_date",
            "follow_up_date",
            "intervention_type",
            "remarks",
            "source",
        ]

        for field in editable_fields:
            if field in payload and payload[field] is not None:
                updated[field] = _safe_text(payload.get(field), updated.get(field, ""))

        if "status" in payload and payload.get("status") is not None:
            updated["status"] = _normalize_status(payload.get("status"))

        if not updated.get("follow_up_date") and updated.get("due_date"):
            updated["follow_up_date"] = updated.get("due_date")

        updated["updated_at"] = _now_iso()
        _DECISION_ACTIONS[index] = updated
        return deepcopy(updated)

    return None


def delete_decision_action(action_id: str):
    for index, action in enumerate(_DECISION_ACTIONS):
        if action.get("id") == action_id:
            removed = _DECISION_ACTIONS.pop(index)
            return deepcopy(removed)
    return None


def clear_decision_actions():
    _DECISION_ACTIONS.clear()
    return []


def summarize_decision_actions(actions=None):
    actions = actions if actions is not None else list_decision_actions()
    summary = {
        "total": len(actions),
        "pending": 0,
        "in_progress": 0,
        "completed": 0,
        "overdue": 0,
    }

    today = datetime.now(timezone.utc).date().isoformat()

    for action in actions:
        status = action.get("status")
        if status == "Pending":
            summary["pending"] += 1
        elif status == "In Progress":
            summary["in_progress"] += 1
        elif status == "Completed":
            summary["completed"] += 1

        due_date = action.get("due_date") or action.get("follow_up_date")
        if due_date and due_date < today and status != "Completed":
            summary["overdue"] += 1

    return summary
