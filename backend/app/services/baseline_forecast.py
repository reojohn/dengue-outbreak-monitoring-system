from fastapi import HTTPException, UploadFile

from app.services.file_inspector import (
    make_json_safe_records,
    prepare_clean_dengue_dataframe,
    read_tabular_file,
)


def classify_forecast_risk(forecast_next_4_periods: int):
    if forecast_next_4_periods >= 60:
        return "High"

    if forecast_next_4_periods >= 25:
        return "Moderate"

    return "Low"


def get_trend_direction(recent_average: float, previous_average: float):
    if previous_average == 0 and recent_average > 0:
        return "Increasing"

    if previous_average == 0 and recent_average == 0:
        return "Stable"

    change_rate = (recent_average - previous_average) / previous_average

    if change_rate >= 0.15:
        return "Increasing"

    if change_rate <= -0.15:
        return "Decreasing"

    return "Stable"


def get_recommendation(risk_level: str, trend_direction: str):
    if risk_level == "High":
        return (
            "Prioritize immediate vector-control activities, intensified cleanup drives, "
            "and close monitoring of reported dengue cases."
        )

    if risk_level == "Moderate" and trend_direction == "Increasing":
        return (
            "Increase monitoring frequency, prepare barangay-level prevention activities, "
            "and check possible breeding sites before cases rise further."
        )

    if risk_level == "Moderate":
        return (
            "Maintain regular monitoring, continue prevention campaigns, and observe case trends."
        )

    if trend_direction == "Increasing":
        return (
            "Monitor closely because cases are increasing even though the current risk level is low."
        )

    return (
        "Maintain routine monitoring and continue standard dengue prevention reminders."
    )


async def generate_baseline_dengue_forecast(file: UploadFile):
    df, file_type, filename = await read_tabular_file(file)

    prepared = prepare_clean_dengue_dataframe(df)

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

    working_df = valid_df.copy()

    working_df["sort_year"] = working_df["year"].fillna(0)
    working_df["sort_month"] = working_df["month"].fillna(0)
    working_df["sort_week"] = working_df["week"].fillna(0)

    forecast_rows = []

    for barangay, group_df in working_df.groupby("barangay"):
        barangay_df = group_df.sort_values(
            by=["sort_year", "sort_month", "sort_week", "period"]
        )

        cases_series = barangay_df["cases"].tolist()

        recent_values = cases_series[-3:]
        previous_values = cases_series[-6:-3]

        recent_average = (
            sum(recent_values) / len(recent_values)
            if recent_values
            else 0
        )

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

        # Keep the baseline forecast conservative.
        # This avoids extreme jumps while we are still waiting for the real historical dataset.
        capped_change_rate = max(min(change_rate, 0.30), -0.30)

        forecast_next_period = round(recent_average * (1 + capped_change_rate))
        forecast_next_period = max(forecast_next_period, 0)

        forecast_next_4_periods = forecast_next_period * 4

        risk_level = classify_forecast_risk(forecast_next_4_periods)

        latest_row = barangay_df.iloc[-1]

        forecast_rows.append(
            {
                "barangay": barangay,
                "latest_period": latest_row["period"],
                "record_count": int(len(barangay_df)),
                "historical_total_cases": int(barangay_df["cases"].sum()),
                "recent_average_cases": round(recent_average, 2),
                "previous_average_cases": round(previous_average, 2),
                "trend_direction": trend_direction,
                "forecast_next_period": int(forecast_next_period),
                "forecast_next_4_periods": int(forecast_next_4_periods),
                "risk_level": risk_level,
                "recommendation": get_recommendation(risk_level, trend_direction),
            }
        )

    risk_priority = {
        "High": 3,
        "Moderate": 2,
        "Low": 1,
    }

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
        row["forecast_next_4_periods"]
        for row in forecast_rows
    )

    return {
        "message": "Baseline dengue forecast generated successfully.",
        "note": (
            "This is a rule-based baseline forecast, not a trained machine learning model. "
            "It is intended for prototype testing until the official historical dataset is available."
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
        "forecast_results": forecast_rows,
        "invalid_preview": make_json_safe_records(invalid_preview_df.head(10)),
    }