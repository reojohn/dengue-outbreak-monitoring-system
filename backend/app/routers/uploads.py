from fastapi import APIRouter, File, UploadFile

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