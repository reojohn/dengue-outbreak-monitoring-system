from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth_security import get_current_user, require_roles
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

WRITE_ROLES = ("admin", "cho", "supervisor")
CLEAR_ROLES = ("admin", "cho")


class DecisionActionCreateRequest(BaseModel):
    barangay: str = Field(min_length=1, max_length=160)
    risk_level: str = Field(default="Pending", max_length=32)
    action: str = Field(min_length=1, max_length=1200)
    assigned_to: str = Field(default="Unassigned", max_length=240)
    status: str = Field(default="Pending", max_length=32)
    due_date: str = Field(default="", max_length=32)
    follow_up_date: str = Field(default="", max_length=32)
    intervention_type: str = Field(default="Barangay coordination", max_length=160)
    remarks: str = Field(default="", max_length=2000)
    source: str = Field(default="decision_support", max_length=80)


class DecisionActionUpdateRequest(BaseModel):
    barangay: Optional[str] = Field(default=None, max_length=160)
    risk_level: Optional[str] = Field(default=None, max_length=32)
    action: Optional[str] = Field(default=None, max_length=1200)
    assigned_to: Optional[str] = Field(default=None, max_length=240)
    status: Optional[str] = Field(default=None, max_length=32)
    due_date: Optional[str] = Field(default=None, max_length=32)
    follow_up_date: Optional[str] = Field(default=None, max_length=32)
    intervention_type: Optional[str] = Field(default=None, max_length=160)
    remarks: Optional[str] = Field(default=None, max_length=2000)
    source: Optional[str] = Field(default=None, max_length=80)


def _normalize_barangay(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _assert_bhw_can_view(current_user, action) -> None:
    if current_user.get("role") != "bhw":
        return
    assigned = _normalize_barangay(current_user.get("assigned_barangay"))
    action_barangay = _normalize_barangay((action or {}).get("barangay"))
    if not assigned or assigned != action_barangay:
        raise HTTPException(status_code=403, detail="You can only view decision actions for your assigned barangay.")


@router.get("")
def get_decision_actions(
    status: Optional[str] = Query(default=None),
    barangay: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    role = current_user.get("role")
    effective_barangay = barangay

    if role == "bhw":
        assigned = str(current_user.get("assigned_barangay") or "").strip()
        if not assigned:
            raise HTTPException(status_code=403, detail="Your BHW account is not assigned to a barangay.")
        if barangay and _normalize_barangay(barangay) != _normalize_barangay(assigned):
            raise HTTPException(status_code=403, detail="You can only view decision actions for your assigned barangay.")
        effective_barangay = assigned

    actions = list_decision_actions(status=status, barangay=effective_barangay)
    return {
        "message": "Decision support action records loaded.",
        "persistence": "supabase_postgresql",
        "summary": summarize_decision_actions(actions),
        "actions": actions,
    }


@router.get("/{action_id}")
def read_decision_action(action_id: str, current_user=Depends(get_current_user)):
    action = get_decision_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Decision action not found.")
    _assert_bhw_can_view(current_user, action)
    return {"message": "Decision support action loaded.", "action": action}


@router.post("")
def create_action(
    payload: DecisionActionCreateRequest,
    current_user=Depends(require_roles(*WRITE_ROLES)),
):
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
            "created_by_user_id": str(current_user["id"]),
            "created_by_role": current_user.get("role"),
        },
    })

    return {
        "message": "Decision support action created.",
        "action": action,
        "summary": summarize_decision_actions(),
    }


@router.patch("/{action_id}")
def update_action(
    action_id: str,
    payload: DecisionActionUpdateRequest,
    current_user=Depends(require_roles(*WRITE_ROLES)),
):
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
                "updated_by_user_id": str(current_user["id"]),
                "updated_by_role": current_user.get("role"),
            },
        })

    return {
        "message": "Decision support action updated.",
        "action": action,
        "summary": summarize_decision_actions(),
    }


@router.delete("/{action_id}")
def remove_action(
    action_id: str,
    current_user=Depends(require_roles(*WRITE_ROLES)),
):
    removed = delete_decision_action(action_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Decision action not found.")
    return {
        "message": "Decision support action removed.",
        "action": removed,
        "summary": summarize_decision_actions(),
    }


@router.delete("")
def reset_actions(current_user=Depends(require_roles(*CLEAR_ROLES))):
    clear_decision_actions()
    return {
        "message": "Decision support action records cleared.",
        "summary": summarize_decision_actions(),
        "actions": [],
    }
