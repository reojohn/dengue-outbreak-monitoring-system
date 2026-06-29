from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile


async def inspect_tabular_file(file: UploadFile):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if extension == ".csv":
            df = pd.read_csv(BytesIO(content))
            file_type = "csv"

        elif extension in [".xlsx", ".xls"]:
            df = pd.read_excel(BytesIO(content))
            file_type = "excel"

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a CSV or Excel file.",
            )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file. Error: {str(error)}",
        )

    preview = df.head(5).fillna("").astype(str).to_dict(orient="records")

    missing_values = {
        column: int(df[column].isna().sum())
        for column in df.columns
    }

    return {
        "message": "File inspected successfully.",
        "filename": filename,
        "file_type": file_type,
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": list(df.columns),
        "missing_values": missing_values,
        "preview": preview,
    }