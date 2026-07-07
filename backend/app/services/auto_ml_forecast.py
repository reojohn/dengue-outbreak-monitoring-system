from fastapi import HTTPException, UploadFile
from datetime import datetime
import time

import numpy as np
import pandas as pd

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

from app.services.baseline_forecast import (
    classify_forecast_risk,
    get_recommendation,
    get_trend_direction,
)
from app.services.file_inspector import (
    make_json_safe_records,
    prepare_clean_dengue_dataframe,
    read_tabular_file,
)


def _cap_outliers(series: pd.Series) -> pd.Series:
    clean = pd.to_numeric(series, errors="coerce").fillna(0)
    upper = clean.quantile(0.99)
    if pd.isna(upper) or upper <= 0:
        return clean.clip(lower=0)
    return clean.clip(lower=0, upper=upper)


def _build_ml_dataset(valid_df: pd.DataFrame) -> pd.DataFrame:
    df = valid_df.copy()

    df["cases"] = _cap_outliers(df["cases"])
    df["sort_year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0)
    df["sort_month"] = pd.to_numeric(df["month"], errors="coerce").fillna(0)
    df["sort_week"] = pd.to_numeric(df["week"], errors="coerce").fillna(0)

    rows = []

    for barangay, group_df in df.groupby("barangay"):
        barangay_df = group_df.sort_values(
            by=["sort_year", "sort_month", "sort_week", "period"]
        ).reset_index(drop=True)

        barangay_df["lag_1"] = barangay_df["cases"].shift(1)
        barangay_df["lag_2"] = barangay_df["cases"].shift(2)
        barangay_df["lag_3"] = barangay_df["cases"].shift(3)
        barangay_df["rolling_mean_3"] = barangay_df["cases"].shift(1).rolling(3).mean()
        barangay_df["rolling_sum_3"] = barangay_df["cases"].shift(1).rolling(3).sum()
        barangay_df["target_next_cases"] = barangay_df["cases"].shift(-1)

        rows.append(barangay_df)

    ml_df = pd.concat(rows, ignore_index=True)
    ml_df = ml_df.dropna(
        subset=[
            "lag_1",
            "lag_2",
            "lag_3",
            "rolling_mean_3",
            "rolling_sum_3",
            "target_next_cases",
        ]
    )

    return ml_df


RANDOM_STATE = 42
TRAIN_TEST_SPLIT_LABEL = "80% / 20%"
TRAIN_RATIO = 0.8
TEST_RATIO = 0.2

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
    """Return baseline and optional advanced forecasting models.

    The advanced packages are optional so local demos and deployment do not fail
    when XGBoost, LightGBM, or CatBoost is not installed yet.
    """
    models = {
        "random_forest": RandomForestRegressor(
            n_estimators=45,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            max_depth=12,
        ),
        "extra_trees": ExtraTreesRegressor(
            n_estimators=45,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            max_depth=12,
        ),
        "gradient_boosting": GradientBoostingRegressor(random_state=RANDOM_STATE),
        "decision_tree": DecisionTreeRegressor(random_state=RANDOM_STATE, max_depth=10),
        "ridge_regression": Ridge(),
    }

    if XGBRegressor is not None:
        models["xgboost"] = XGBRegressor(
            n_estimators=90,
            max_depth=4,
            learning_rate=0.07,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )

    if LGBMRegressor is not None:
        models["lightgbm"] = LGBMRegressor(
            n_estimators=90,
            learning_rate=0.07,
            num_leaves=24,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbose=-1,
        )

    if CatBoostRegressor is not None:
        models["catboost"] = CatBoostRegressor(
            iterations=90,
            depth=5,
            learning_rate=0.07,
            loss_function="RMSE",
            random_seed=RANDOM_STATE,
            verbose=False,
            allow_writing_files=False,
        )

    return models


def _model_display_name(model_key: str) -> str:
    return MODEL_DISPLAY_NAMES.get(model_key, model_key.replace("_", " ").title())


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
        "sort_year": "Year",
        "sort_month": "Month",
        "sort_week": "Epidemiological Week",
        "lag_1": "Previous Period Cases",
        "lag_2": "Two-Period Case Lag",
        "lag_3": "Three-Period Case Lag",
        "rolling_mean_3": "3-Period Moving Average",
        "rolling_sum_3": "3-Period Rolling Sum",
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

    return sorted(
        [
            {"feature": feature, "label": _feature_label(feature), "importance": round((abs(float(value)) / total) * 100, 4)}
            for feature, value in zip(feature_columns, values)
        ],
        key=lambda item: item["importance"],
        reverse=True,
    )


def _selection_confidence(comparison):
    if not comparison:
        return {"score": 0, "label": "Unavailable", "margin_percent": 0}
    best = comparison[0]
    runner = comparison[1] if len(comparison) > 1 else None
    best_rmse = float(best.get("rmse") or 0)
    runner_rmse = float(runner.get("rmse") or best_rmse or 0) if runner else best_rmse
    margin = max(0, (runner_rmse - best_rmse) / runner_rmse) if runner_rmse > 0 and best_rmse > 0 else 0
    f1_component = max(0, min(float(best.get("f1_score") or 0), 1))
    score = int(round(min(98, max(50, 62 + (margin * 180) + (f1_component * 22)))))
    label = "High confidence" if score >= 85 else "Moderate confidence" if score >= 70 else "Review recommended"
    return {"score": score, "label": label, "margin_percent": round(margin * 100, 2)}


def _selection_explanation(comparison):
    if not comparison:
        return "No model comparison was available."
    best = comparison[0]
    return (
        f"{best.get('model_name', 'The selected model')} was selected because it achieved the lowest RMSE "
        f"({best.get('rmse', 'N/A')}) and MAE ({best.get('mae', 'N/A')}) among the evaluated machine learning models."
    )

def _evaluate_models(ml_df: pd.DataFrame):
    evaluated_at = datetime.utcnow().isoformat() if 'datetime' in globals() else ''
    total_started = time.perf_counter()
    feature_columns = [
        "sort_year",
        "sort_month",
        "sort_week",
        "lag_1",
        "lag_2",
        "lag_3",
        "rolling_mean_3",
        "rolling_sum_3",
    ]

    ml_df = ml_df.sort_values(by=["sort_year", "sort_month", "sort_week", "barangay"])
    split_index = max(int(len(ml_df) * TRAIN_RATIO), 1)

    train_df = ml_df.iloc[:split_index]
    test_df = ml_df.iloc[split_index:]

    if test_df.empty:
        test_df = train_df.tail(max(1, min(10, len(train_df))))
        train_df = train_df.iloc[:-len(test_df)]

    if train_df.empty or test_df.empty:
        raise ValueError("Not enough records for model testing.")

    x_train = train_df[feature_columns]
    y_train = train_df["target_next_cases"]
    x_test = test_df[feature_columns]
    y_test = test_df["target_next_cases"]

    results = []

    for model_key, model in _candidate_models().items():
        started = time.perf_counter()
        model.fit(x_train, y_train)
        predictions = np.maximum(model.predict(x_test), 0)
        duration = time.perf_counter() - started

        mae = mean_absolute_error(y_test, predictions)
        rmse = mean_squared_error(y_test, predictions) ** 0.5

        try:
            r2 = r2_score(y_test, predictions)
        except Exception:
            r2 = 0

        results.append(
            {
                "model_key": model_key,
                "model_name": _model_display_name(model_key),
                "model": model,
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
                "training_duration_seconds": round(float(duration), 4),
                "evaluated_at": evaluated_at,
                "feature_importance": _extract_feature_importance(model, feature_columns),
            }
        )

    results = sorted(results, key=lambda item: (item["rmse"], item["mae"]))
    best = results[0]

    final_model = _candidate_models()[best["model_key"]]
    final_model.fit(ml_df[feature_columns], ml_df["target_next_cases"])
    best["feature_importance"] = _extract_feature_importance(final_model, feature_columns) or best.get("feature_importance", [])
    best["selection_confidence"] = _selection_confidence(results)
    best["selection_explanation"] = _selection_explanation(results)
    best["total_model_training_duration_seconds"] = round(float(time.perf_counter() - total_started), 4)

    return best, results, final_model, feature_columns

def _fallback_forecast(valid_df: pd.DataFrame):
    forecast_rows = []

    working_df = valid_df.copy()
    working_df["cases"] = _cap_outliers(working_df["cases"])
    working_df["sort_year"] = working_df["year"].fillna(0)
    working_df["sort_month"] = working_df["month"].fillna(0)
    working_df["sort_week"] = working_df["week"].fillna(0)

    for barangay, group_df in working_df.groupby("barangay"):
        barangay_df = group_df.sort_values(
            by=["sort_year", "sort_month", "sort_week", "period"]
        )

        cases_series = barangay_df["cases"].tolist()
        recent_values = cases_series[-3:]
        previous_values = cases_series[-6:-3]

        recent_average = sum(recent_values) / len(recent_values) if recent_values else 0
        previous_average = (
            sum(previous_values) / len(previous_values)
            if previous_values
            else recent_average
        )

        trend_direction = get_trend_direction(recent_average, previous_average)

        if previous_average > 0:
            change_rate = (recent_average - previous_average) / previous_average
        elif recent_average > 0:
            change_rate = 0.25
        else:
            change_rate = 0

        capped_change_rate = max(min(change_rate, 0.30), -0.30)
        forecast_next_period = max(round(recent_average * (1 + capped_change_rate)), 0)
        forecast_next_4_periods = forecast_next_period * 4
        risk_level = classify_forecast_risk(forecast_next_4_periods)
        latest_row = barangay_df.iloc[-1]

        forecast_rows.append(
            {
                "barangay": barangay,
                "latest_period": latest_row["period"],
                "record_count": int(len(barangay_df)),
                "historical_total_cases": int(barangay_df["cases"].sum()),
                "recent_average_cases": round(float(recent_average), 2),
                "previous_average_cases": round(float(previous_average), 2),
                "trend_direction": trend_direction,
                "forecast_next_period": int(forecast_next_period),
                "forecast_next_4_periods": int(forecast_next_4_periods),
                "risk_level": risk_level,
                "recommendation": get_recommendation(risk_level, trend_direction),
                "model_used": "fallback_trend_baseline",
            }
        )

    return forecast_rows


def generate_auto_ml_dengue_forecast_from_dataframe(
    df: pd.DataFrame,
    *,
    file_type: str = "",
    filename: str = "dengue_dataset",
    prepared: dict | None = None,
):
    """Generate a forecast from an already-read dengue dataframe.

    The upload route uses this to avoid reading and cleaning the same large
    historical file twice. This keeps the model behavior the same, but cuts a
    large amount of request time during live uploads.
    """
    prepared = prepared or prepare_clean_dengue_dataframe(df)

    valid_df = prepared["valid_df"]
    invalid_preview_df = prepared["invalid_preview_df"]
    invalid_rows = prepared["invalid_rows"]
    validation_summary = prepared["validation_summary"]
    dengue_detection = prepared["dengue_detection"]

    if valid_df.empty:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No valid dengue records found for forecasting.",
                "validation_summary": validation_summary,
            },
        )

    model_comparison = []
    selected_model_name = "fallback_trend_baseline"
    selected_model_key = "fallback_trend_baseline"
    model_metrics = {}
    used_machine_learning = False

    try:
        ml_df = _build_ml_dataset(valid_df)

        if len(ml_df) >= 30:
            best, comparison, model, feature_columns = _evaluate_models(ml_df)

            selected_model_name = best["model_name"]
            selected_model_key = best["model_key"]
            model_metrics = {
                "model_key": best.get("model_key"),
                "model_name": best.get("model_name"),
                "mae": best.get("mae", 0),
                "rmse": best.get("rmse", 0),
                "r2": best.get("r2", 0),
                "accuracy": best.get("accuracy", 0),
                "precision": best.get("precision", 0),
                "recall": best.get("recall", 0),
                "f1_score": best.get("f1_score", 0),
            }
            model_comparison = [
                {
                    "model_key": item["model_key"],
                    "model_name": item["model_name"],
                    "model": item["model_name"],
                    "mae": item["mae"],
                    "rmse": item["rmse"],
                    "r2": item["r2"],
                    "accuracy": item.get("accuracy", 0),
                    "precision": item.get("precision", 0),
                    "recall": item.get("recall", 0),
                    "f1_score": item.get("f1_score", 0),
                    "status": item.get("status", "evaluated"),
                    "random_state": item.get("random_state", RANDOM_STATE),
                    "train_test_split": item.get("train_test_split", TRAIN_TEST_SPLIT_LABEL),
                    "training_row_count": item.get("training_row_count", 0),
                    "testing_row_count": item.get("testing_row_count", 0),
                    "training_duration_seconds": item.get("training_duration_seconds", 0),
                    "evaluated_at": item.get("evaluated_at"),
                    "feature_importance": item.get("feature_importance", []),
                }
                for item in comparison
            ]
            used_machine_learning = True

            forecast_rows = []

            working_df = valid_df.copy()
            working_df["cases"] = _cap_outliers(working_df["cases"])
            working_df["sort_year"] = pd.to_numeric(working_df["year"], errors="coerce").fillna(0)
            working_df["sort_month"] = pd.to_numeric(working_df["month"], errors="coerce").fillna(0)
            working_df["sort_week"] = pd.to_numeric(working_df["week"], errors="coerce").fillna(0)

            for barangay, group_df in working_df.groupby("barangay"):
                barangay_df = group_df.sort_values(
                    by=["sort_year", "sort_month", "sort_week", "period"]
                ).reset_index(drop=True)

                cases_series = barangay_df["cases"].tolist()
                if len(cases_series) < 3:
                    continue

                latest_row = barangay_df.iloc[-1]
                recent_values = cases_series[-3:]
                previous_values = cases_series[-6:-3]

                recent_average = sum(recent_values) / len(recent_values)
                previous_average = (
                    sum(previous_values) / len(previous_values)
                    if previous_values
                    else recent_average
                )

                trend_direction = get_trend_direction(recent_average, previous_average)

                prediction_input = pd.DataFrame(
                    [
                        {
                            "sort_year": latest_row["sort_year"],
                            "sort_month": latest_row["sort_month"],
                            "sort_week": latest_row["sort_week"],
                            "lag_1": cases_series[-1],
                            "lag_2": cases_series[-2],
                            "lag_3": cases_series[-3],
                            "rolling_mean_3": recent_average,
                            "rolling_sum_3": sum(recent_values),
                        }
                    ]
                )[feature_columns]

                forecast_next_period = int(round(max(float(model.predict(prediction_input)[0]), 0)))
                forecast_next_4_periods = forecast_next_period * 4
                risk_level = classify_forecast_risk(forecast_next_4_periods)

                forecast_rows.append(
                    {
                        "barangay": barangay,
                        "latest_period": latest_row["period"],
                        "record_count": int(len(barangay_df)),
                        "historical_total_cases": int(barangay_df["cases"].sum()),
                        "recent_average_cases": round(float(recent_average), 2),
                        "previous_average_cases": round(float(previous_average), 2),
                        "trend_direction": trend_direction,
                        "forecast_next_period": int(forecast_next_period),
                        "forecast_next_4_periods": int(forecast_next_4_periods),
                        "risk_level": risk_level,
                        "recommendation": get_recommendation(risk_level, trend_direction),
                        "model_used": selected_model_name,
                    }
                )
        else:
            forecast_rows = _fallback_forecast(valid_df)

    except Exception:
        forecast_rows = _fallback_forecast(valid_df)

    risk_priority = {"High": 3, "Moderate": 2, "Low": 1}

    forecast_rows = sorted(
        forecast_rows,
        key=lambda row: (
            risk_priority.get(row["risk_level"], 0),
            row["forecast_next_4_periods"],
            row["historical_total_cases"],
        ),
        reverse=True,
    )

    for index, row in enumerate(forecast_rows, start=1):
        row["priority_rank"] = index

    risk_counts = {
        "High": sum(1 for row in forecast_rows if row["risk_level"] == "High"),
        "Moderate": sum(1 for row in forecast_rows if row["risk_level"] == "Moderate"),
        "Low": sum(1 for row in forecast_rows if row["risk_level"] == "Low"),
    }

    total_forecast_next_4_periods = sum(
        row["forecast_next_4_periods"] for row in forecast_rows
    )

    return {
        "message": "Auto-selected dengue forecasting model generated successfully.",
        "note": (
            "The system tested multiple forecasting models and automatically selected "
            "the best-performing model based on validation error. Mock data is still for prototype testing only."
        ),
        "filename": filename,
        "file_type": file_type,
        "original_row_count": int(len(df)),
        "valid_row_count": int(len(valid_df)),
        "invalid_row_count": int(invalid_rows.sum()),
        "barangay_count": int(valid_df["barangay"].nunique()),
        "total_forecast_next_4_periods": int(total_forecast_next_4_periods),
        "risk_counts": risk_counts,
        "validation_summary": validation_summary,
        "dengue_detection": dengue_detection,
        "cleaned_preview": make_json_safe_records(valid_df.head(25)),
        "forecast_results": forecast_rows,
        "invalid_preview": make_json_safe_records(invalid_preview_df.head(10)),
        "model_name": f"auto_selected_{selected_model_key}",
        "model_display_name": selected_model_name,
        "model_version": "v1",
        "is_machine_learning": bool(used_machine_learning),
        "model_metrics": model_metrics,
        "model_comparison": model_comparison,
        "feature_importance": model_metrics.get("feature_importance", []),
        "selection_explanation": model_metrics.get("selection_explanation"),
        "selection_confidence": model_metrics.get("selection_confidence"),
        "random_state": RANDOM_STATE,
        "train_test_split": TRAIN_TEST_SPLIT_LABEL,
    }

async def generate_auto_ml_dengue_forecast(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)
    return generate_auto_ml_dengue_forecast_from_dataframe(
        df,
        file_type=file_type,
        filename=filename,
    )
