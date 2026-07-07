import json
import time
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

try:
    from xgboost import XGBRegressor
except Exception:  # Optional advanced model. The system still runs without it.
    XGBRegressor = None

try:
    from lightgbm import LGBMRegressor
except Exception:  # Optional advanced model. The system still runs without it.
    LGBMRegressor = None

try:
    from catboost import CatBoostRegressor
except Exception:  # Optional advanced model. The system still runs without it.
    CatBoostRegressor = None

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

RANDOM_STATE = 42
TRAIN_RATIO = 0.8
TEST_RATIO = 0.2
TRAIN_TEST_SPLIT_LABEL = "80% / 20%"


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

    if not _is_saved_model_complete(row):
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
        "training_summary": _training_summary({
            "best": row["metrics"] or {},
            "comparison": row["model_comparison"] or [],
            "train_count": row["training_row_count"],
            "test_count": row["testing_row_count"],
            "evaluated_at": str(row["created_at"]),
        }, str(row["model_run_id"]), str(row["integration_run_id"]) if row["integration_run_id"] else None),
        "selection_explanation": _selection_explanation(row["model_comparison"] or []),
        "selection_confidence": _selection_confidence(row["model_comparison"] or []),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
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


MODEL_DISPLAY_NAMES = {
    "random_forest": "Random Forest",
    "extra_trees": "Extra Trees",
    "gradient_boosting": "Gradient Boosting",
    "decision_tree": "Decision Tree",
    "ridge_regression": "Ridge Regression",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
    "catboost": "CatBoost",
}


def _candidate_models():
    """Return all usable forecasting models.

    XGBoost, LightGBM, and CatBoost are treated as optional advanced models.
    If one package is not installed on a machine, it is skipped instead of
    breaking the backend during a demo or deployment.
    """
    models = {
        "random_forest": RandomForestRegressor(n_estimators=120, random_state=RANDOM_STATE, n_jobs=-1, max_depth=14),
        "extra_trees": ExtraTreesRegressor(n_estimators=120, random_state=RANDOM_STATE, n_jobs=-1, max_depth=14),
        "gradient_boosting": GradientBoostingRegressor(random_state=RANDOM_STATE),
        "decision_tree": DecisionTreeRegressor(random_state=RANDOM_STATE, max_depth=10),
        "ridge_regression": Ridge(),
    }

    if XGBRegressor is not None:
        models["xgboost"] = XGBRegressor(
            n_estimators=160,
            max_depth=4,
            learning_rate=0.06,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )

    if LGBMRegressor is not None:
        models["lightgbm"] = LGBMRegressor(
            n_estimators=160,
            max_depth=-1,
            learning_rate=0.06,
            num_leaves=24,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbose=-1,
        )

    if CatBoostRegressor is not None:
        models["catboost"] = CatBoostRegressor(
            iterations=160,
            depth=5,
            learning_rate=0.06,
            loss_function="RMSE",
            random_seed=RANDOM_STATE,
            verbose=False,
            allow_writing_files=False,
        )

    return models


def _model_display_name(model_key: str) -> str:
    return MODEL_DISPLAY_NAMES.get(model_key, model_key.replace("_", " ").title())


def _available_model_keys():
    return set(_candidate_models().keys())


def _comparison_keys(comparison):
    if not isinstance(comparison, list):
        return set()

    keys = set()

    for item in comparison:
        if not isinstance(item, dict):
            continue

        raw_key = item.get("model_key") or item.get("model_name") or item.get("model") or ""
        normalized_key = str(raw_key).strip().lower().replace(" ", "_").replace("-", "_")

        if normalized_key:
            keys.add(normalized_key)

    return keys


def _is_saved_model_complete(row) -> bool:
    if not row:
        return False

    available_keys = _available_model_keys()
    comparison_keys = _comparison_keys(row.get("model_comparison") or [])

    if not available_keys:
        return False

    if not available_keys.issubset(comparison_keys):
        return False

    # Runs created before the explainability upgrade do not contain per-model
    # feature importance, reproducibility fields, or training metadata. Mark
    # those cached rows as stale so the next automatic forecast writes complete
    # Explainable AI details.
    for item in row.get("model_comparison") or []:
        if not isinstance(item, dict):
            return False
        if item.get("model_key") in available_keys and (
            "feature_importance" not in item or
            "random_state" not in item or
            "train_test_split" not in item or
            "training_duration_seconds" not in item
        ):
            return False

    return True


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



def _feature_label(feature: str) -> str:
    labels = {
        "year": "Year",
        "month": "Month",
        "week": "Epidemiological Week",
        "lag_1": "Previous Period Cases",
        "lag_2": "Two-Period Case Lag",
        "lag_3": "Three-Period Case Lag",
        "moving_average_3": "3-Period Moving Average",
        "moving_average_6": "6-Period Moving Average",
        "rolling_sum_3": "3-Period Rolling Sum",
        "rainfall": "Rainfall",
        "temperature": "Temperature",
        "humidity": "Humidity",
        "population": "Population",
        "density": "Population Density",
    }
    return labels.get(feature, feature.replace("_", " ").title())


def _extract_feature_importance(model, feature_columns):
    raw_values = None

    if hasattr(model, "feature_importances_"):
        raw_values = getattr(model, "feature_importances_", None)
    elif hasattr(model, "coef_"):
        raw_values = np.abs(np.ravel(getattr(model, "coef_", [])))

    if raw_values is None:
        return []

    values = np.nan_to_num(np.array(raw_values, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)

    if values.size != len(feature_columns):
        return []

    total = float(np.sum(np.abs(values)))
    if total <= 0:
        return []

    items = []
    for feature, value in zip(feature_columns, values):
        percentage = (abs(float(value)) / total) * 100
        items.append({
            "feature": feature,
            "label": _feature_label(feature),
            "importance": round(float(percentage), 4),
        })

    return sorted(items, key=lambda item: item["importance"], reverse=True)


def _selection_confidence(comparison):
    if not comparison:
        return {
            "score": 0,
            "label": "Unavailable",
            "margin_percent": 0,
            "summary": "Model confidence is unavailable because no comparison results were produced.",
        }

    best = comparison[0]
    runner_up = comparison[1] if len(comparison) > 1 else None
    best_rmse = float(best.get("rmse") or 0)
    runner_rmse = float(runner_up.get("rmse") or best_rmse or 0) if runner_up else best_rmse

    margin = 0
    if runner_rmse > 0 and best_rmse > 0:
        margin = max(0, (runner_rmse - best_rmse) / runner_rmse)

    f1_component = max(0, min(float(best.get("f1_score") or 0), 1))
    score = int(round(min(98, max(50, 62 + (margin * 180) + (f1_component * 22)))))

    if score >= 85:
        label = "High confidence"
    elif score >= 70:
        label = "Moderate confidence"
    else:
        label = "Review recommended"

    summary = (
        f"{best.get('model_name', 'The selected model')} was selected because it produced the lowest RMSE"
        f" and MAE among the evaluated algorithms."
    )

    return {
        "score": score,
        "label": label,
        "margin_percent": round(float(margin * 100), 2),
        "summary": summary,
    }


def _selection_explanation(comparison):
    if not comparison:
        return "No model comparison was available."

    best = comparison[0]
    runner_up = comparison[1] if len(comparison) > 1 else None

    explanation = (
        f"{best.get('model_name', 'The selected model')} was selected because it achieved the lowest RMSE "
        f"({best.get('rmse', 'N/A')}) and MAE ({best.get('mae', 'N/A')}) among the evaluated machine learning models. "
        "Lower RMSE and MAE indicate smaller forecasting errors, so the system automatically used this model for the dengue forecast."
    )

    if runner_up:
        explanation += (
            f" The next closest model was {runner_up.get('model_name', 'the runner-up model')} "
            f"with RMSE {runner_up.get('rmse', 'N/A')} and MAE {runner_up.get('mae', 'N/A')}."
        )

    return explanation


def _training_summary(training_result: dict, model_run_id: str | None = None, integration_run_id: str | None = None):
    comparison = training_result.get("comparison") or []
    best = training_result.get("best") or (comparison[0] if comparison else {})
    confidence = _selection_confidence(comparison)

    return {
        "model_run_id": model_run_id,
        "integration_run_id": integration_run_id,
        "models_evaluated": len(comparison),
        "selected_model_key": best.get("model_key"),
        "selected_model_name": best.get("model_name"),
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
        "train_ratio": TRAIN_RATIO,
        "test_ratio": TEST_RATIO,
        "random_state": RANDOM_STATE,
        "training_row_count": int(training_result.get("train_count") or 0),
        "testing_row_count": int(training_result.get("test_count") or 0),
        "total_model_training_duration_seconds": round(float(training_result.get("total_duration_seconds") or 0), 4),
        "evaluated_at": training_result.get("evaluated_at"),
        "selection_confidence": confidence,
        "selection_explanation": _selection_explanation(comparison),
    }

def _train_and_select_model(ml_df: pd.DataFrame):
    evaluated_at = datetime.utcnow().isoformat()
    training_started = time.perf_counter()
    ml_df = ml_df.sort_values(["year", "month", "week", "barangay"])

    split_index = max(int(len(ml_df) * TRAIN_RATIO), 1)
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
    trained_models = {}

    for model_key, model in _candidate_models().items():
        model_started = time.perf_counter()
        model.fit(x_train, y_train)
        predictions = np.maximum(model.predict(x_test), 0)
        model_duration = time.perf_counter() - model_started

        mae = mean_absolute_error(y_test, predictions)
        rmse = mean_squared_error(y_test, predictions) ** 0.5

        try:
            r2 = r2_score(y_test, predictions)
        except Exception:
            r2 = 0

        feature_importance = _extract_feature_importance(model, FEATURE_COLUMNS)

        comparison.append({
            "model_key": model_key,
            "model_name": _model_display_name(model_key),
            "mae": round(float(mae), 4),
            "rmse": round(float(rmse), 4),
            "r2": round(float(r2), 4),
            **_evaluate_regression_as_risk(y_test, predictions),
            "status": "evaluated",
            "random_state": RANDOM_STATE,
            "train_test_split": TRAIN_TEST_SPLIT_LABEL,
            "train_ratio": TRAIN_RATIO,
            "test_ratio": TEST_RATIO,
            "training_row_count": int(len(train_df)),
            "testing_row_count": int(len(test_df)),
            "training_duration_seconds": round(float(model_duration), 4),
            "evaluated_at": evaluated_at,
            "feature_importance": feature_importance,
        })
        trained_models[model_key] = model

    comparison = sorted(comparison, key=lambda item: (item["rmse"], item["mae"]))
    best = {
        **comparison[0],
        "selection_confidence": _selection_confidence(comparison),
        "selection_explanation": _selection_explanation(comparison),
    }

    final_model = _candidate_models()[best["model_key"]]
    final_started = time.perf_counter()
    final_model.fit(ml_df[FEATURE_COLUMNS], ml_df["target_next_cases"])
    final_duration = time.perf_counter() - final_started

    final_feature_importance = _extract_feature_importance(final_model, FEATURE_COLUMNS)
    best["feature_importance"] = final_feature_importance or best.get("feature_importance", [])
    best["final_training_duration_seconds"] = round(float(final_duration), 4)

    total_duration = time.perf_counter() - training_started

    return {
        "best": best,
        "comparison": comparison,
        "model": final_model,
        "train_count": len(train_df),
        "test_count": len(test_df),
        "feature_importance": best.get("feature_importance", []),
        "feature_importance_by_model": {
            item["model_key"]: item.get("feature_importance", [])
            for item in comparison
        },
        "total_duration_seconds": round(float(total_duration), 4),
        "evaluated_at": evaluated_at,
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
        "model_version": "v1",
        "metrics": best,
        "model_metrics": best,
        "model_comparison": training_result["comparison"],
        "feature_columns": FEATURE_COLUMNS,
        "feature_importance": training_result["feature_importance"],
        "feature_importance_by_model": training_result.get("feature_importance_by_model", {}),
        "training_summary": _training_summary(training_result, model_run_id, integration_run_id),
        "selection_explanation": _selection_explanation(training_result.get("comparison") or []),
        "selection_confidence": _selection_confidence(training_result.get("comparison") or []),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
        "training_row_count": training_result["train_count"],
        "testing_row_count": training_result["test_count"],
        "available_model_keys": sorted(_available_model_keys()),
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
        "feature_importance_by_model": training_result.get("feature_importance_by_model", {}),
        "training_summary": _training_summary(training_result, model_run_id, integration_run_id),
        "selection_explanation": _selection_explanation(training_result.get("comparison") or []),
        "selection_confidence": _selection_confidence(training_result.get("comparison") or []),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
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
        "training_summary": _training_summary({
            "best": saved_row["metrics"] or {},
            "comparison": saved_row["model_comparison"] or [],
            "train_count": saved_row["training_row_count"],
            "test_count": saved_row["testing_row_count"],
            "evaluated_at": str(saved_row["created_at"]),
        }, str(saved_row["model_run_id"]), str(saved_row["integration_run_id"]) if saved_row["integration_run_id"] else None),
        "selection_explanation": _selection_explanation(saved_row["model_comparison"] or []),
        "selection_confidence": _selection_confidence(saved_row["model_comparison"] or []),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
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
        "training_summary": artifact.get("training_summary"),
        "selection_explanation": artifact.get("selection_explanation"),
        "selection_confidence": artifact.get("selection_confidence"),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
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
        "training_summary": _training_summary({
            "best": row["metrics"] or {},
            "comparison": row["model_comparison"] or [],
            "train_count": row["training_row_count"],
            "test_count": row["testing_row_count"],
            "evaluated_at": str(row["created_at"]),
        }, str(row["model_run_id"]), str(row["integration_run_id"]) if row["integration_run_id"] else None),
        "selection_explanation": _selection_explanation(row["model_comparison"] or []),
        "selection_confidence": _selection_confidence(row["model_comparison"] or []),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
        "created_at": str(row["created_at"]),
        "model_file_available": _model_path(str(row["model_run_id"])).exists(),
    }
