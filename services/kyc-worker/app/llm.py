import json
import os

from anthropic import Anthropic

from .models import ExtractedIdentity


EXTRACTION_PROMPT = """Extract identity fields from this OCR text.
Return only valid JSON with exactly these keys: name, date_of_birth, id_number, confidence.
Use null when a field is absent or unreadable. Never guess or infer identity data.
Confidence must be a number from 0 to 1.

OCR text:
{ocr_text}
"""


def extract_with_llm(ocr_text: str, client: Anthropic | None = None) -> ExtractedIdentity:
    """Uses Anthropic for structured extraction when configured, preserving nulls for uncertainty."""

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key and client is None:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    anthropic_client = client or Anthropic(api_key=api_key)
    response = anthropic_client.messages.create(
        model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
        max_tokens=300,
        temperature=0,
        messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(ocr_text=ocr_text)}],
    )
    text = response.content[0].text
    return ExtractedIdentity.model_validate(json.loads(text))