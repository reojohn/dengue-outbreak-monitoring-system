from fastapi import APIRouter, File, UploadFile

from app.services.file_inspector import (
    clean_dengue_file,
    inspect_tabular_file,
    summarize_dengue_file,
)

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)


@router.post("/test")
async def test_upload(file: UploadFile = File(...)):
    content = await file.read()

    return {
        "message": "File received successfully.",
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
    }


@router.post("/inspect")
async def inspect_upload(file: UploadFile = File(...)):
    return await inspect_tabular_file(file)


@router.post("/clean-dengue")
async def clean_dengue_upload(file: UploadFile = File(...)):
    return await clean_dengue_file(file)


@router.post("/summarize-dengue")
async def summarize_dengue_upload(file: UploadFile = File(...)):
    return await summarize_dengue_file(file)