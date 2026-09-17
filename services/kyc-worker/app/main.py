from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .llm import extract_with_llm
from .models import ExtractedIdentity, FraudSignals, KycResult, RiskRequest, RiskResult
from .ocr import OcrError, is_blurry, load_image, parse_identity_fields, run_ocr
from .risk import build_rule_explanation, calculate_rule_score, explain_with_llm

app = FastAPI(title="CardAcquire KYC Worker", version="0.1.0")


def names_match(form_name: str, extracted_name: str | None) -> bool:
    """Compares normalized names so obvious OCR/form mismatches become risk signals."""

    if not extracted_name:
        return False
    return " ".join(form_name.lower().split()) == " ".join(extracted_name.lower().split())


@app.get("/health")
def health() -> dict[str, str]:
    """Reports worker availability for container orchestration and deployment checks."""

    return {"status": "ok"}


@app.post("/kyc/extract", response_model=KycResult)
async def extract_kyc(
    document: Annotated[UploadFile, File(...)],
    applicant_name: Annotated[str, Form(...)],
    use_llm: Annotated[bool, Form()] = False,
) -> KycResult:
    """Runs document sanity checks, OCR, and optional structured LLM extraction."""

    document_bytes = await document.read()
    try:
        image = load_image(document_bytes)
        blurry = is_blurry(image)
        ocr_text = run_ocr(image)
    except OcrError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    parsed = parse_identity_fields(ocr_text)
    extracted = ExtractedIdentity(**parsed, confidence=0.6 if ocr_text else 0.0)
    llm_used = False
    if use_llm:
        try:
            extracted = extract_with_llm(ocr_text)
            llm_used = True
        except Exception as error:
            raise HTTPException(status_code=502, detail="Structured KYC extraction failed") from error

    return KycResult(
        extracted=extracted,
        fraud_signals=FraudSignals(
            blurry_image=blurry,
            name_mismatch=bool(extracted.name and not names_match(applicant_name, extracted.name)),
            ocr_unavailable=not bool(ocr_text),
        ),
        ocr_text=ocr_text,
        llm_used=llm_used,
    )


@app.post("/risk/score", response_model=RiskResult)
def score_risk(request: RiskRequest) -> RiskResult:
    """Scores KYC flags deterministically and optionally enriches their explanation."""

    score, flags = calculate_rule_score(request.fraud_signals, request.recent_application_count)
    explanation = build_rule_explanation(flags, score)
    llm_used = False
    if request.use_llm:
        try:
            explanation = explain_with_llm(score, flags)
            llm_used = True
        except Exception as error:
            raise HTTPException(status_code=502, detail="Risk explanation failed") from error
    return RiskResult(score=score, flags=flags, explanation=explanation, llm_used=llm_used)