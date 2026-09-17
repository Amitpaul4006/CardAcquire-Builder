from fastapi.testclient import TestClient

from app.main import app
from app.models import FraudSignals
from app.risk import calculate_rule_score, explain_with_llm


class FakeMessages:
    def create(self, **_kwargs):
        return type("Response", (), {"content": [type("Block", (), {"text": '{"explanation":"Review the name mismatch."}'})()]})()


class FakeClient:
    messages = FakeMessages()


def test_clean_application_is_low_risk():
    score, flags = calculate_rule_score(FraudSignals(), 0)
    assert score == 0
    assert flags == []


def test_name_mismatch_is_flagged():
    score, flags = calculate_rule_score(FraudSignals(name_mismatch=True), 0)
    assert score == 40
    assert flags == ["NAME_MISMATCH"]


def test_blurry_document_is_flagged():
    score, flags = calculate_rule_score(FraudSignals(blurry_image=True), 0)
    assert score == 25
    assert flags == ["BLURRY_DOCUMENT"]


def test_rapid_repeat_applications_are_flagged():
    score, flags = calculate_rule_score(FraudSignals(), 3)
    assert score == 30
    assert flags == ["RAPID_REPEAT_APPLICATION"]


def test_risk_endpoint_returns_deterministic_result():
    response = TestClient(app).post(
        "/risk/score",
        json={
            "fraud_signals": {"name_mismatch": True, "blurry_image": True},
            "recent_application_count": 3,
            "use_llm": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["score"] == 95
    assert response.json()["flags"] == [
        "NAME_MISMATCH",
        "BLURRY_DOCUMENT",
        "RAPID_REPEAT_APPLICATION",
    ]


def test_llm_explanation_does_not_replace_deterministic_inputs():
    explanation = explain_with_llm(40, ["NAME_MISMATCH"], client=FakeClient())
    assert explanation == "Review the name mismatch."