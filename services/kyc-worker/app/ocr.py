import re
from io import BytesIO

import pytesseract
from PIL import Image, ImageFilter, ImageStat


class OcrError(RuntimeError):
    """Raised when the document cannot be processed by the OCR runtime."""


def load_image(document_bytes: bytes) -> Image.Image:
    """Loads an uploaded image and rejects invalid bytes before OCR or LLM calls."""

    try:
        image = Image.open(BytesIO(document_bytes)).convert("RGB")
    except Exception as error:
        raise OcrError("Document is not a readable image") from error
    if image.width < 200 or image.height < 100:
        raise OcrError("Document image is too small for reliable extraction")
    return image


def is_blurry(image: Image.Image) -> bool:
    """Uses edge-detail variance as a cheap sanity check for blurry documents."""

    edges = image.convert("L").filter(ImageFilter.FIND_EDGES)
    statistics = ImageStat.Stat(edges)
    return statistics.mean[0] <= 4.0 or statistics.var[0] <= 18.0


def run_ocr(image: Image.Image) -> str:
    """Runs Tesseract OCR and converts missing-binary errors into an explicit failure."""

    try:
        return pytesseract.image_to_string(image).strip()
    except pytesseract.TesseractNotFoundError as error:
        raise OcrError("Tesseract is not installed in the worker runtime") from error
    except Exception as error:
        raise OcrError("OCR processing failed") from error


def parse_identity_fields(ocr_text: str) -> dict[str, str | None]:
    """Extracts conservative identity candidates from OCR text without inventing values."""

    lines = [line.strip() for line in ocr_text.splitlines() if line.strip()]
    name = next((line.split(":", 1)[1].strip() for line in lines if line.lower().startswith("name:")), None)
    date_match = re.search(r"\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b", ocr_text)
    id_match = re.search(r"(?:id|id number)\s*:\s*([A-Z0-9]{6,20})\b", ocr_text, flags=re.IGNORECASE)
    if not id_match:
        id_match = re.search(r"\b[A-Z0-9]{6,20}\b", ocr_text, flags=re.IGNORECASE)
    return {
        "name": name,
        "date_of_birth": date_match.group(1) if date_match else None,
        "id_number": id_match.group(1) if id_match and id_match.lastindex else (id_match.group(0) if id_match else None),
    }