import json
import os

from anthropic import Anthropic

from .models import FraudSignals


RISK_WEIGHTS = {
    "name_mismatch": 40,
    "blurry_image": 25,
    "ocr_unavailable": 15,
    "rapid_repeat_application": 30,
}


def calculate_rule_score(signals: FraudSignals, recent_application_count: int) -> tuple[int, list[str]]:
    """Calculates a bounded, deterministic score and the flags that caused it."""

    flags: list[str] = []
    score = 0
    if signals.name_mismatch:
        score += RISK_WEIGHTS["name_mismatch"]
        flags.append("NAME_MISMATCH")
    if signals.blurry_image:
        score += RISK_WEIGHTS["blurry_image"]
        flags.append("BLURRY_DOCUMENT")
    if signals.ocr_unavailable:
        score += RISK_WEIGHTS["ocr_unavailable"]
        flags.append("OCR_UNAVAILABLE")
    if recent_application_count >= 3:
        score += RISK_WEIGHTS["rapid_repeat_application"]
        flags.append("RAPID_REPEAT_APPLICATION")
    return min(score, 100), flags


def build_rule_explanation(flags: list[str], score: int) -> str:
    """Builds a stable explanation suitable for audit records and operator review."""

    if not flags:
        return f"No configured risk signals were detected; rule score is {score}."
    return f"Rule score is {score} because of: {', '.join(flags)}."


def explain_with_llm(
    score: int,
    flags: list[str],
    client: Anthropic | None = None,
) -> str:
    """Asks Anthropic for plain-language reasoning over flags without changing the score."""

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key and client is None:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    anthropic_client = client or Anthropic(api_key=api_key)
    prompt = (
        "Explain this KYC risk result for an operations reviewer. "
        "Do not invent facts, change the numeric score, or make a final approval decision. "
        "Return JSON with exactly one key, explanation. "
        f"Score: {score}. Flags: {json.dumps(flags)}"
    )
    response = anthropic_client.messages.create(
        model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
        max_tokens=250,
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    result = json.loads(response.content[0].text)
    explanation = result.get("explanation")
    if not isinstance(explanation, str) or not explanation.strip():
        raise ValueError("LLM response did not contain an explanation")
    return explanation.strip()