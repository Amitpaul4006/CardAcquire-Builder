from pydantic import BaseModel, Field


class ExtractedIdentity(BaseModel):
    """Structured identity fields returned by OCR and optional LLM extraction."""

    name: str | None = None
    date_of_birth: str | None = None
    id_number: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class FraudSignals(BaseModel):
    """Basic document and applicant mismatch signals used by later risk scoring."""

    blurry_image: bool = False
    name_mismatch: bool = False
    ocr_unavailable: bool = False


class KycResult(BaseModel):
    """Auditable KYC response containing extracted fields and explainable flags."""

    extracted: ExtractedIdentity
    fraud_signals: FraudSignals
    ocr_text: str
    llm_used: bool = False


class RiskRequest(BaseModel):
    """Inputs to deterministic risk scoring and optional LLM explanation."""

    fraud_signals: FraudSignals
    recent_application_count: int = Field(default=0, ge=0)
    use_llm: bool = False


class RiskResult(BaseModel):
    """Risk score, flags, and explanation returned for audit and decisioning."""

    score: int = Field(ge=0, le=100)
    flags: list[str]
    explanation: str
    llm_used: bool = False