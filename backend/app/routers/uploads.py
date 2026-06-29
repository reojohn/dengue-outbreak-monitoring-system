from fastapi import APIRouter, File, UploadFile

from app.services.file_inspector import inspect_tabular_file

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