from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text

from app.database import engine

_ALLOWED_STATUSES = {"Pending", "In Progress", "Completed"}
_TABLE = "decision_actions"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _safe_text(value, fallback=""):
    if value is None:
        return fallback
    text_value = str(value).strip()
    return text_value if text_value else fallback


def _normalize_status(value):
    status = _safe_text(value, "Pending")
    return status if status in _ALLOWED_STATUSES else "Pending"


def _columns(connection):
    rows = connection.execute(
        text(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = :table_name
            """
        ),
        {"table_name": _TABLE},
    ).mappings().all()
    return {row["column_name"] for row in rows}


def _pk_column(columns):
    if "action_id" in columns:
        return "action_id"
    if "id" in columns:
        return "id"
    return "action_id"


def _get_barangay_id(connection, barangay_name):
    if not barangay_name:
        return None

    try:
        barangay_columns = _table_columns(connection, "barangays")
        id_column = "barangay_id" if "barangay_id" in barangay_columns else "id"
        name_columns = [
            column for column in ["barangay_name", "name", "barangay", "display_name"]
            if column in barangay_columns
        ]

        for name_column in name_columns:
            row = connection.execute(
                text(
                    f"""
                    select {id_column} as barangay_id
                    from public.barangays
                    where lower(trim({name_column}::text)) = lower(trim(:barangay_name))
                    limit 1
                    """
                ),
                {"barangay_name": barangay_name},
            ).mappings().first()

            if row:
                return row["barangay_id"]
    except Exception:
        return None

    return None


def _table_columns(connection, table_name):
    rows = connection.execute(
        text(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).mappings().all()
    return {row["column_name"] for row in rows}


def _row_to_action(row):
    if not row:
        return None
    item = dict(row)
    action_id = item.get("action_id") or item.get("id")
    barangay_name = (
        item.get("barangay")
        or item.get("barangay_name")
        or item.get("name")
        or item.get("display_name")
        or item.get("barangay_id")
        or "Unassigned barangay"
    )
    action_text = (
        item.get("action")
        or item.get("recommended_action")
        or item.get("action_text")
        or item.get("description")
        or "Review dengue response recommendation."
    )

    return {
        "id": str(action_id),
        "action_id": str(action_id),
        "barangay": str(barangay_name),
        "barangay_id": str(item.get("barangay_id")) if item.get("barangay_id") else "",
        "risk_level": item.get("risk_level") or item.get("risk") or "Pending",
        "action": action_text,
        "assigned_to": item.get("assigned_to") or item.get("assignee") or "Unassigned",
        "status": _normalize_status(item.get("status")),
        "due_date": str(item.get("due_date") or "")[:10],
        "follow_up_date": str(item.get("follow_up_date") or item.get("due_date") or "")[:10],
        "intervention_type": item.get("intervention_type") or item.get("action_type") or "Barangay coordination",
        "remarks": item.get("remarks") or item.get("notes") or "",
        "source": item.get("source") or "decision_support",
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or item.get("created_at") or ""),
    }


def _insert_payload_for_columns(connection, columns, payload):
    now = _now_iso()
    action_id = payload.get("id") or payload.get("action_id") or str(uuid4())
    barangay = _safe_text(payload.get("barangay"), "Unassigned barangay")
    due_date = _safe_text(payload.get("due_date"), "")

    values = {}
    if "action_id" in columns:
        values["action_id"] = action_id
    elif "id" in columns:
        values["id"] = action_id

    direct_map = {
        "barangay": barangay,
        "risk_level": _safe_text(payload.get("risk_level"), "Pending"),
        "risk": _safe_text(payload.get("risk_level"), "Pending"),
        "action": _safe_text(payload.get("action"), "Review dengue response recommendation."),
        "recommended_action": _safe_text(payload.get("action"), "Review dengue response recommendation."),
        "action_text": _safe_text(payload.get("action"), "Review dengue response recommendation."),
        "assigned_to": _safe_text(payload.get("assigned_to"), "Unassigned"),
        "assignee": _safe_text(payload.get("assigned_to"), "Unassigned"),
        "status": _normalize_status(payload.get("status")),
        "due_date": due_date,
        "follow_up_date": _safe_text(payload.get("follow_up_date"), due_date),
        "intervention_type": _safe_text(payload.get("intervention_type"), "Barangay coordination"),
        "action_type": _safe_text(payload.get("intervention_type"), "Barangay coordination"),
        "remarks": _safe_text(payload.get("remarks"), ""),
        "notes": _safe_text(payload.get("remarks"), ""),
        "source": _safe_text(payload.get("source"), "decision_support"),
        "created_at": payload.get("created_at") or now,
        "updated_at": now,
    }

    for column, value in direct_map.items():
        if column in columns:
            values[column] = value

    if "barangay_id" in columns and payload.get("barangay_id"):
        values["barangay_id"] = payload.get("barangay_id")
    elif "barangay_id" in columns:
        barangay_id = _get_barangay_id(connection, barangay)
        if barangay_id:
            values["barangay_id"] = barangay_id

    return values


def create_decision_action(payload: dict):
    with engine.begin() as connection:
        columns = _columns(connection)
        values = _insert_payload_for_columns(connection, columns, payload)
        insert_columns = list(values.keys())
        placeholders = [f":{column}" for column in insert_columns]

        row = connection.execute(
            text(
                f"""
                insert into public.decision_actions ({', '.join(insert_columns)})
                values ({', '.join(placeholders)})
                returning *
                """
            ),
            values,
        ).mappings().first()

    return deepcopy(_row_to_action(row))


def list_decision_actions(status: str | None = None, barangay: str | None = None):
    with engine.connect() as connection:
        columns = _columns(connection)
        pk = _pk_column(columns)
        where = []
        params = {}

        if status and "status" in columns:
            where.append("da.status = :status")
            params["status"] = _normalize_status(status)

        if barangay:
            wanted_barangay = barangay.strip()
            if "barangay" in columns:
                where.append("lower(trim(da.barangay::text)) = lower(trim(:barangay))")
                params["barangay"] = wanted_barangay
            else:
                barangay_columns = _table_columns(connection, "barangays")
                name_column = next((c for c in ["barangay_name", "name", "barangay", "display_name"] if c in barangay_columns), None)
                if name_column and "barangay_id" in columns:
                    where.append(f"lower(trim(b.{name_column}::text)) = lower(trim(:barangay))")
                    params["barangay"] = wanted_barangay

        join_barangays = "barangay_id" in columns
        barangay_columns = _table_columns(connection, "barangays") if join_barangays else set()
        barangay_name_column = next((c for c in ["barangay_name", "name", "barangay", "display_name"] if c in barangay_columns), None)
        join_sql = ""
        select_extra = ""
        if join_barangays and barangay_name_column:
            barangay_pk = "barangay_id" if "barangay_id" in barangay_columns else "id"
            join_sql = f" left join public.barangays b on b.{barangay_pk} = da.barangay_id "
            select_extra = f", b.{barangay_name_column} as barangay_name"

        where_sql = f"where {' and '.join(where)}" if where else ""
        order_column = "updated_at" if "updated_at" in columns else ("created_at" if "created_at" in columns else pk)

        rows = connection.execute(
            text(
                f"""
                select da.* {select_extra}
                from public.decision_actions da
                {join_sql}
                {where_sql}
                order by da.{order_column} desc
                limit 300
                """
            ),
            params,
        ).mappings().all()

    return [deepcopy(_row_to_action(row)) for row in rows]


def get_decision_action(action_id: str):
    with engine.connect() as connection:
        columns = _columns(connection)
        pk = _pk_column(columns)
        row = connection.execute(
            text(f"select * from public.decision_actions where {pk}::text = :action_id limit 1"),
            {"action_id": action_id},
        ).mappings().first()

    return deepcopy(_row_to_action(row)) if row else None


def update_decision_action(action_id: str, payload: dict):
    with engine.begin() as connection:
        columns = _columns(connection)
        pk = _pk_column(columns)
        update_values = _insert_payload_for_columns(connection, columns, payload)
        update_values.pop("action_id", None)
        update_values.pop("id", None)
        update_values.pop("created_at", None)
        update_values["lookup_action_id"] = action_id

        if "updated_at" in columns:
            update_values["updated_at"] = _now_iso()

        if not update_values:
            return get_decision_action(action_id)

        set_sql = ", ".join([f"{column} = :{column}" for column in update_values if column != "lookup_action_id"])
        row = connection.execute(
            text(
                f"""
                update public.decision_actions
                set {set_sql}
                where {pk}::text = :lookup_action_id
                returning *
                """
            ),
            update_values,
        ).mappings().first()

    return deepcopy(_row_to_action(row)) if row else None


def delete_decision_action(action_id: str):
    with engine.begin() as connection:
        columns = _columns(connection)
        pk = _pk_column(columns)
        row = connection.execute(
            text(f"delete from public.decision_actions where {pk}::text = :action_id returning *"),
            {"action_id": action_id},
        ).mappings().first()

    return deepcopy(_row_to_action(row)) if row else None


def clear_decision_actions():
    with engine.begin() as connection:
        connection.execute(text("delete from public.decision_actions"))
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
