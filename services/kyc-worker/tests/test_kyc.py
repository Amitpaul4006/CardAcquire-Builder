from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.ocr import is_blurry, parse_identity_fields


def image_bytes() -> bytes:
    image = Image.new("RGB", (400, 200), "white")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_parse_identity_fields_is_conservative():
    parsed = parse_identity_fields("NAME: Amit Paul\nDOB: 1990-01-01\nID: AB123456")
    assert parsed == {"name": "Amit Paul", "date_of_birth": "1990-01-01", "id_number": "AB123456"}


def test_blank_image_is_flagged_as_blurry():
    image = Image.new("RGB", (400, 200), "white")
    assert is_blurry(image) is True


def test_extract_endpoint_returns_structured_result():
    client = TestClient(app)
    with patch("app.main.run_ocr", return_value="NAME: Amit Paul\nDOB: 1990-01-01\nID: AB123456"):
        response = client.post(
            "/kyc/extract",
            files={"document": ("id.png", image_bytes(), "image/png")},
            data={"applicant_name": "Amit Paul", "use_llm": "false"},
        )
    assert response.status_code == 200
    assert response.json()["extracted"]["name"] == "Amit Paul"
    assert response.json()["fraud_signals"]["name_mismatch"] is False