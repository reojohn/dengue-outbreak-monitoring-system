from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.decision_action_state import (
    clear_decision_actions,
    create_decision_action,
    delete_decision_action,
    get_decision_action,
    list_decision_actions,
    summarize_decision_actions,
    update_decision_action,
)
from app.services.notification_state import add_notification_event

router = APIRouter(
    prefix="/decision-actions",
    tags=["decision action tracking"],
)


class DecisionActionCreateRequest(BaseModel):
    barangay: str
    risk_level: str = "Pending"
    action: str
    assigned_to: str = "Unassigned"
    status: str = "Pending"
    due_date: str = ""
    follow_up_date: str = ""
    intervention_type: str = "Barangay coordination"
    remarks: str = ""
    source: str = "decision_support"


class DecisionActionUpdateRequest(BaseModel):
    barangay: Optional[str] = None
    risk_level: Optional[str] = None
    action: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    follow_up_date: Optional[str] = None
    intervention_type: Optional[str] = None
    remarks: Optional[str] = None
    source: Optional[str] = None


@router.get("")
def get_decision_actions(
    status: Optional[str] = Query(default=None),
    barangay: Optional[str] = Query(default=None),
):
    actions = list_decision_actions(status=status, barangay=barangay)

    return {
        "message": "Decision support action records loaded.",
        "persistence": "supabase_postgresql",
        "summary": summarize_decision_actions(actions),
        "actions": actions,
    }


@router.get("/{action_id}")
def read_decision_action(action_id: str):
    action = get_decision_action(action_id)

    if not action:
        raise HTTPException(status_code=404, detail="Decision action not found.")

    return {
        "message": "Decision support action loaded.",
        "action": action,
    }


@router.post("")
def create_action(payload: DecisionActionCreateRequest):
    action = create_decision_action(payload.model_dump())

    add_notification_event({
        "title": "Decision action assigned",
        "message": f"{action['intervention_type']} action for {action['barangay']} was assigned to {action['assigned_to']}.",
        "severity": "info",
        "category": "decision_action_created",
        "to": "/forecast",
        "hash": "decision-action-tracking",
        "meta": {
            "action_id": action["id"],
            "barangay": action["barangay"],
            "status": action["status"],
            "intervention_type": action["intervention_type"],
        },
    })

    return {
        "message": "Decision support action created.",
        "action": action,
        "summary": summarize_decision_actions(),
    }


@router.patch("/{action_id}")
def update_action(action_id: str, payload: DecisionActionUpdateRequest):
    before = get_decision_action(action_id)
    action = update_decision_action(action_id, payload.model_dump(exclude_unset=True))

    if not action:
        raise HTTPException(status_code=404, detail="Decision action not found.")

    if before and before.get("status") != action.get("status"):
        severity = "success" if action.get("status") == "Completed" else "activity"
        add_notification_event({
            "title": "Decision action status updated",
            "message": f"Action for {action['barangay']} is now {action['status']}.",
            "severity": severity,
            "category": "decision_action_status",
            "to": "/forecast",
            "hash": "decision-action-tracking",
            "meta": {
                "action_id": action["id"],
                "barangay": action["barangay"],
                "previous_status": before.get("status"),
                "status": action["status"],
            },
        })

    return {
        "message": "Decision support action updated.",
        "action": action,
        "summary": summarize_decision_actions(),
    }


@router.delete("/{action_id}")
def remove_action(action_id: str):
    removed = delete_decision_action(action_id)

    if not removed:
        raise HTTPException(status_code=404, detail="Decision action not found.")

    return {
        "message": "Decision support action removed.",
        "action": removed,
        "summary": summarize_decision_actions(),
    }


@router.delete("")
def reset_actions():
    clear_decision_actions()

    return {
        "message": "Decision support action records cleared.",
        "summary": summarize_decision_actions(),
        "actions": [],
    }
