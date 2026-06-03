"""ML prediction model tests."""
from backend.ml.denial_predictor import predict_denial_risk
from backend.ml.prior_auth_predictor import predict_pa_approval
from backend.ml.readmission_scorer import score_readmission_risk


def test_denial_risk_rule_based():
    low_risk = predict_denial_risk({"diagnosis_codes": ["I10"], "amount": 200, "procedure_code": "99213"})
    high_risk = predict_denial_risk({"diagnosis_codes": ["I10"], "amount": 25000, "prior_denial": True, "out_of_network": True})
    assert low_risk < high_risk
    assert 0 <= low_risk <= 100
    assert 0 <= high_risk <= 100


def test_pa_approval_rule_based():
    score = predict_pa_approval("27447", ["M17.11"], patient_age=55)
    assert 0 <= score <= 100


def test_readmission_risk():
    low = score_readmission_risk(30, 1, 1, ["J06.9"])
    high = score_readmission_risk(78, 5, 8, ["I50.9", "E11.9", "N18.3"])
    assert high > low
    assert 0 <= high <= 100
