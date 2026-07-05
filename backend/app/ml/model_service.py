import json
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import text

from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, mean_squared_error, precision_score, recall_score, r2_score
from sklearn.tree import DecisionTreeRegressor

from app.database import engine
from app.services.baseline_forecast import classify_forecast_risk, get_recommendation, get_trend_direction
from app.services.database_forecasts import save_forecast_result


FEATURE_COLUMNS = [
    "year", "month", "week",
    "lag_1", "lag_2", "lag_3",
    "moving_average_3", "moving_average_6", "rolling_sum_3",
    "rainfall", "temperature", "humidity",
    "population", "density",
]

MODEL_DIR = Path(__file__).resolve().parent.parent / "trained_models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _to_float(value: Any, fallback=0.0):
    try:
        if value is None or value == "":
            return fallback
        return float(str(value).replace(",", "").strip())
    except Exception:
        return fallback


def ensure_model_tables():
    with engine.begin() as connection:
        connection.execute(text("""
            create table if not exists public.model_training_runs (
                model_run_id uuid primary key default gen_random_uuid(),
                integration_run_id uuid null,
                best_model_key text not null,
                best_model_name text not null,
                model_version text not null default 'v1',
                status text not null default 'completed',
                training_row_count integer not null default 0,
                testing_row_count integer not null default 0,
                feature_columns jsonb not null default '[]'::jsonb,
                metrics jsonb not null default '{}'::jsonb,
                model_comparison jsonb not null default '[]'::jsonb,
                feature_importance jsonb not null default '[]'::jsonb,
                created_at timestamptz not null default now(),
                created_by text not null default 'demo_user'
            )
        """))


def _model_path(model_run_id: str):
    return MODEL_DIR / f"{model_run_id}.joblib"


def _get_latest_integration_run_id():
    with engine.connect() as connection:
        return connection.execute(text("""
            select integration_run_id
            from public.integration_runs
            order by created_at desc
            limit 1
        """)).scalar_one_or_none()


def _get_saved_model_run(integration_run_id: str):
    ensure_model_tables()

    with engine.connect() as connection:
        row = connection.execute(text("""
            select *
            from public.model_training_runs
            where integration_run_id = :integration_run_id
            order by created_at desc
            limit 1
        """), {"integration_run_id": integration_run_id}).mappings().first()

    if not row:
        return None

    model_file = _model_path(str(row["model_run_id"]))

    if not model_file.exists():
        return None

    return row


def _saved_model_response(row):
    return {
        "message": "Latest trained model loaded. No retraining was needed.",
        "model_run_id": str(row["model_run_id"]),
        "integration_run_id": str(row["integration_run_id"]) if row["integration_run_id"] else None,
        "best_model": row["metrics"] or {},
        "model_metrics": row["metrics"] or {},
        "model_comparison": row["model_comparison"] or [],
        "feature_columns": row["feature_columns"] or FEATURE_COLUMNS,
        "feature_importance": row["feature_importance"] or [],
        "training_row_count": row["training_row_count"],
        "testing_row_count": row["testing_row_count"],
        "used_cached_model": True,
    }


def _load_integrated_dataframe(integration_run_id=None):
    if integration_run_id is None:
        integration_run_id = _get_latest_integration_run_id()

    if not integration_run_id:
        raise HTTPException(status_code=400, detail="No integrated dataset found. Please upload and combine the datasets first.")

    with engine.connect() as connection:
        rows = connection.execute(text("""
            select
                integration_run_id, barangay, barangay_key, period,
                year, month, week, cases,
                rainfall, temperature, humidity,
                population, density, boundary_area_sqkm
            from public.integrated_dataset_rows
            where integration_run_id = :integration_run_id
            order by barangay, year, month, week, period
        """), {"integration_run_id": integration_run_id}).mappings().all()

    if not rows:
        raise HTTPException(status_code=400, detail="The latest integrated dataset has no rows available.")

    return pd.DataFrame([dict(row) for row in rows]), str(integration_run_id)


def _candidate_models():
    return {
        "random_forest": RandomForestRegressor(n_estimators=120, random_state=42, n_jobs=-1, max_depth=14),
        "extra_trees": ExtraTreesRegressor(n_estimators=120, random_state=42, n_jobs=-1, max_depth=14),
        "gradient_boosting": GradientBoostingRegressor(random_state=42),
        "decision_tree": DecisionTreeRegressor(random_state=42, max_depth=10),
        "ridge_regression": Ridge(),
    }


def _prepare_ml_dataframe(df: pd.DataFrame):
    working = df.copy()

    for column in ["year", "month", "week", "cases", "rainfall", "temperature", "humidity", "population", "density", "boundary_area_sqkm"]:
        working[column] = pd.to_numeric(working.get(column), errors="coerce").fillna(0)

    working["cases"] = working["cases"].clip(lower=0)

    missing_density = (working["density"] <= 0) & (working["population"] > 0) & (working["boundary_area_sqkm"] > 0)
    working.loc[missing_density, "density"] = working.loc[missing_density, "population"] / working.loc[missing_density, "boundary_area_sqkm"]

    model_rows = []

    for _, group_df in working.groupby("barangay_key"):
        barangay_df = group_df.sort_values(["year", "month", "week", "period"]).reset_index(drop=True)

        barangay_df["lag_1"] = barangay_df["cases"].shift(1)
        barangay_df["lag_2"] = barangay_df["cases"].shift(2)
        barangay_df["lag_3"] = barangay_df["cases"].shift(3)
        barangay_df["moving_average_3"] = barangay_df["cases"].shift(1).rolling(3).mean()
        barangay_df["moving_average_6"] = barangay_df["cases"].shift(1).rolling(6).mean()
        barangay_df["rolling_sum_3"] = barangay_df["cases"].shift(1).rolling(3).sum()
        barangay_df["target_next_cases"] = barangay_df["cases"].shift(-1)

        model_rows.append(barangay_df)

    ml_df = pd.concat(model_rows, ignore_index=True)
    ml_df = ml_df.dropna(subset=FEATURE_COLUMNS + ["target_next_cases"])

    if len(ml_df) < 30:
        raise HTTPException(status_code=400, detail=f"Not enough model-ready records. Found {len(ml_df)}.")

    return ml_df


def _risk_class_from_cases(cases):
    return classify_forecast_risk(int(round(max(float(cases), 0))) * 4)


def _evaluate_regression_as_risk(y_true, y_pred):
    actual_classes = [_risk_class_from_cases(value) for value in y_true]
    predicted_classes = [_risk_class_from_cases(value) for value in y_pred]

    return {
        "accuracy": round(float(accuracy_score(actual_classes, predicted_classes)), 4),
        "precision": round(float(precision_score(actual_classes, predicted_classes, average="weighted", zero_division=0)), 4),
        "recall": round(float(recall_score(actual_classes, predicted_classes, average="weighted", zero_division=0)), 4),
        "f1_score": round(float(f1_score(actual_classes, predicted_classes, average="weighted", zero_division=0)), 4),
    }


def _train_and_select_model(ml_df: pd.DataFrame):
    ml_df = ml_df.sort_values(["year", "month", "week", "barangay"])

    split_index = max(int(len(ml_df) * 0.8), 1)
    train_df = ml_df.iloc[:split_index].copy()
    test_df = ml_df.iloc[split_index:].copy()

    if test_df.empty:
        test_size = max(1, min(10, len(train_df) // 4))
        test_df = train_df.tail(test_size)
        train_df = train_df.iloc[:-test_size]

    x_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_next_cases"]
    x_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_next_cases"]

    comparison = []

    for model_key, model in _candidate_models().items():
        model.fit(x_train, y_train)
        predictions = np.maximum(model.predict(x_test), 0)

        mae = mean_absolute_error(y_test, predictions)
        rmse = mean_squared_error(y_test, predictions) ** 0.5

        try:
            r2 = r2_score(y_test, predictions)
        except Exception:
            r2 = 0

        comparison.append({
            "model_key": model_key,
            "model_name": model_key.replace("_", " ").title(),
            "mae": round(float(mae), 4),
            "rmse": round(float(rmse), 4),
            "r2": round(float(r2), 4),
            **_evaluate_regression_as_risk(y_test, predictions),
        })

    comparison = sorted(comparison, key=lambda item: (item["rmse"], item["mae"]))
    best = comparison[0]

    final_model = _candidate_models()[best["model_key"]]
    final_model.fit(ml_df[FEATURE_COLUMNS], ml_df["target_next_cases"])

    feature_importance = []
    if hasattr(final_model, "feature_importances_"):
        feature_importance = sorted(
            [
                {"feature": feature, "importance": round(float(importance), 4)}
                for feature, importance in zip(FEATURE_COLUMNS, final_model.feature_importances_)
            ],
            key=lambda item: item["importance"],
            reverse=True,
        )

    return {
        "best": best,
        "comparison": comparison,
        "model": final_model,
        "train_count": len(train_df),
        "test_count": len(test_df),
        "feature_importance": feature_importance,
    }


def _save_model_run(training_result: dict, integration_run_id: str):
    ensure_model_tables()
    best = training_result["best"]

    with engine.begin() as connection:
        model_run_id = connection.execute(text("""
            insert into public.model_training_runs (
                integration_run_id, best_model_key, best_model_name,
                model_version, status, training_row_count, testing_row_count,
                feature_columns, metrics, model_comparison, feature_importance, created_by
            )
            values (
                :integration_run_id, :best_model_key, :best_model_name,
                :model_version, :status, :training_row_count, :testing_row_count,
                cast(:feature_columns as jsonb), cast(:metrics as jsonb),
                cast(:model_comparison as jsonb), cast(:feature_importance as jsonb), :created_by
            )
            returning model_run_id
        """), {
            "integration_run_id": integration_run_id,
            "best_model_key": best["model_key"],
            "best_model_name": best["model_name"],
            "model_version": "v1",
            "status": "completed",
            "training_row_count": training_result["train_count"],
            "testing_row_count": training_result["test_count"],
            "feature_columns": _to_json(FEATURE_COLUMNS),
            "metrics": _to_json(best),
            "model_comparison": _to_json(training_result["comparison"]),
            "feature_importance": _to_json(training_result["feature_importance"]),
            "created_by": "demo_user",
        }).scalar_one()

    model_run_id = str(model_run_id)
    joblib.dump(training_result["model"], _model_path(model_run_id))

    metadata_path = MODEL_DIR / "latest_metadata.json"
    metadata_path.write_text(_to_json({
        "model_run_id": model_run_id,
        "integration_run_id": integration_run_id,
        "best_model_key": best["model_key"],
        "best_model_name": best["model_name"],
        "trained_at": datetime.utcnow().isoformat(),
    }), encoding="utf-8")

    return model_run_id


def train_latest_model(force_retrain=False):
    _, integration_run_id = _load_integrated_dataframe()

    saved_row = _get_saved_model_run(integration_run_id)
    if saved_row and not force_retrain:
        return _saved_model_response(saved_row)

    df, integration_run_id = _load_integrated_dataframe(integration_run_id)
    ml_df = _prepare_ml_dataframe(df)
    training_result = _train_and_select_model(ml_df)
    model_run_id = _save_model_run(training_result, integration_run_id)

    return {
        "message": "Machine learning models trained successfully.",
        "model_run_id": model_run_id,
        "integration_run_id": integration_run_id,
        "best_model": training_result["best"],
        "model_metrics": training_result["best"],
        "model_comparison": training_result["comparison"],
        "feature_columns": FEATURE_COLUMNS,
        "feature_importance": training_result["feature_importance"],
        "training_row_count": training_result["train_count"],
        "testing_row_count": training_result["test_count"],
        "used_cached_model": False,
    }


def evaluate_latest_model():
    _, integration_run_id = _load_integrated_dataframe()
    saved_row = _get_saved_model_run(integration_run_id)

    if saved_row:
        return _saved_model_response(saved_row)

    return train_latest_model()


def _load_model_and_metadata(integration_run_id: str):
    saved_row = _get_saved_model_run(integration_run_id)

    if not saved_row:
        training_response = train_latest_model()
        saved_row = _get_saved_model_run(integration_run_id)

        if not saved_row:
            raise HTTPException(status_code=500, detail="Model training completed but saved model file was not found.")

    model = joblib.load(_model_path(str(saved_row["model_run_id"])))

    return {
        "model": model,
        "model_run_id": str(saved_row["model_run_id"]),
        "best": saved_row["metrics"] or {},
        "comparison": saved_row["model_comparison"] or [],
        "feature_importance": saved_row["feature_importance"] or [],
        "used_cached_model": True,
    }


def forecast_with_latest_model():
    df, integration_run_id = _load_integrated_dataframe()
    artifact = _load_model_and_metadata(integration_run_id)

    model = artifact["model"]
    best = artifact["best"]
    model_run_id = artifact["model_run_id"]

    working = df.copy()

    for column in ["year", "month", "week", "cases", "rainfall", "temperature", "humidity", "population", "density", "boundary_area_sqkm"]:
        working[column] = pd.to_numeric(working.get(column), errors="coerce").fillna(0)

    working["cases"] = working["cases"].clip(lower=0)

    missing_density = (working["density"] <= 0) & (working["population"] > 0) & (working["boundary_area_sqkm"] > 0)
    working.loc[missing_density, "density"] = working.loc[missing_density, "population"] / working.loc[missing_density, "boundary_area_sqkm"]

    forecast_rows = []

    for barangay_key, group_df in working.groupby("barangay_key"):
        barangay_df = group_df.sort_values(["year", "month", "week", "period"]).reset_index(drop=True)

        if len(barangay_df) < 6:
            continue

        latest_row = barangay_df.iloc[-1]
        cases_series = barangay_df["cases"].tolist()
        recent_values = cases_series[-3:]
        previous_values = cases_series[-6:-3]

        recent_average = sum(recent_values) / len(recent_values) if recent_values else 0
        previous_average = sum(previous_values) / len(previous_values) if previous_values else recent_average

        prediction_input = pd.DataFrame([{
            "year": _to_float(latest_row["year"]),
            "month": _to_float(latest_row["month"]),
            "week": _to_float(latest_row["week"]),
            "lag_1": cases_series[-1],
            "lag_2": cases_series[-2],
            "lag_3": cases_series[-3],
            "moving_average_3": recent_average,
            "moving_average_6": sum(cases_series[-6:]) / 6,
            "rolling_sum_3": sum(recent_values),
            "rainfall": _to_float(latest_row["rainfall"]),
            "temperature": _to_float(latest_row["temperature"]),
            "humidity": _to_float(latest_row["humidity"]),
            "population": _to_float(latest_row["population"]),
            "density": _to_float(latest_row["density"]),
        }])[FEATURE_COLUMNS]

        forecast_next_period = int(round(max(float(model.predict(prediction_input)[0]), 0)))
        forecast_next_4_periods = forecast_next_period * 4
        risk_level = classify_forecast_risk(forecast_next_4_periods)
        trend_direction = get_trend_direction(recent_average, previous_average)

        forecast_rows.append({
            "barangay": latest_row["barangay"],
            "barangay_key": barangay_key,
            "latest_period": latest_row["period"],
            "record_count": int(len(barangay_df)),
            "historical_total_cases": int(barangay_df["cases"].sum()),
            "recent_average_cases": round(float(recent_average), 2),
            "previous_average_cases": round(float(previous_average), 2),
            "trend_direction": trend_direction,
            "forecast_next_period": forecast_next_period,
            "forecast_next_4_periods": forecast_next_4_periods,
            "risk_level": risk_level,
            "recommendation": get_recommendation(risk_level, trend_direction),
            "model_used": best.get("model_name", "Auto-selected model"),
        })

    risk_priority = {"High": 3, "Moderate": 2, "Low": 1}
    forecast_rows = sorted(
        forecast_rows,
        key=lambda row: (risk_priority.get(row["risk_level"], 0), row["forecast_next_4_periods"], row["historical_total_cases"]),
        reverse=True,
    )

    for index, row in enumerate(forecast_rows, start=1):
        row["priority_rank"] = index

    risk_counts = {
        "High": sum(1 for row in forecast_rows if row["risk_level"] == "High"),
        "Moderate": sum(1 for row in forecast_rows if row["risk_level"] == "Moderate"),
        "Low": sum(1 for row in forecast_rows if row["risk_level"] == "Low"),
    }

    forecast_result = {
        "message": "Machine learning forecast generated successfully.",
        "filename": "latest_integrated_dataset",
        "file_type": "database",
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(df)),
        "invalid_row_count": 0,
        "barangay_count": len(forecast_rows),
        "total_forecast_next_4_periods": int(sum(row["forecast_next_4_periods"] for row in forecast_rows)),
        "risk_counts": risk_counts,
        "validation_summary": {
            "source": "latest integrated dataset",
            "generated_at": datetime.utcnow().isoformat(),
        },
        "forecast_results": forecast_rows,
        "invalid_preview": [],
        "model_name": f"auto_selected_{best.get('model_key', 'model')}",
        "model_display_name": best.get("model_name", "Auto-selected model"),
        "model_version": "v1",
        "is_machine_learning": True,
        "model_metrics": best,
        "model_comparison": artifact["comparison"],
        "feature_columns": FEATURE_COLUMNS,
        "feature_importance": artifact["feature_importance"],
        "model_run_id": model_run_id,
        "used_cached_model": artifact["used_cached_model"],
    }

    database_forecast = save_forecast_result(
        forecast_result=forecast_result,
        integration_run_id=integration_run_id,
    )

    forecast_result["database_forecast"] = database_forecast
    forecast_result["database_forecast_run_id"] = database_forecast.get("forecast_run_id")

    return forecast_result


def auto_run_latest_model():
    training_result = train_latest_model()
    forecast_result = forecast_with_latest_model()

    forecast_result["auto_run"] = {
        "message": "Automatic model training, evaluation, and forecasting completed.",
        "training_message": training_result.get("message"),
        "used_cached_model": training_result.get("used_cached_model", False),
        "model_run_id": training_result.get("model_run_id"),
    }

    return forecast_result

def get_latest_metrics():
    ensure_model_tables()

    with engine.connect() as connection:
        row = connection.execute(text("""
            select *
            from public.model_training_runs
            order by created_at desc
            limit 1
        """)).mappings().first()

    if not row:
        return {
            "message": "No saved model metrics found yet.",
            "has_metrics": False,
            "metrics": None,
        }

    return {
        "message": "Latest model metrics loaded successfully.",
        "has_metrics": True,
        "model_run_id": str(row["model_run_id"]),
        "integration_run_id": str(row["integration_run_id"]) if row["integration_run_id"] else None,
        "best_model_key": row["best_model_key"],
        "best_model_name": row["best_model_name"],
        "model_version": row["model_version"],
        "training_row_count": row["training_row_count"],
        "testing_row_count": row["testing_row_count"],
        "feature_columns": row["feature_columns"] or [],
        "metrics": row["metrics"] or {},
        "model_comparison": row["model_comparison"] or [],
        "feature_importance": row["feature_importance"] or [],
        "created_at": str(row["created_at"]),
        "model_file_available": _model_path(str(row["model_run_id"])).exists(),
    }
