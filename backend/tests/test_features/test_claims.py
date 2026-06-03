"""Claim routing pipeline tests."""


def test_claim_submit_valid(client, auth_headers):
    resp = client.post(
        "/api/hospital/rcm/claims/submit",
        json={
            "patient_id": "test-001",
            "diagnosis_codes": ["I10", "E11.9"],
            "procedure_code": "99215",
            "amount": 350.0,
            "provider_npi": "1234567890",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "result" in data
    assert data["result"]["decision"] in ("approved", "pending_review", "denied")


def test_claim_submit_negative_amount(client, auth_headers):
    resp = client.post(
        "/api/hospital/rcm/claims/submit",
        json={"patient_id": "p1", "diagnosis_codes": ["I10"], "procedure_code": "99215", "amount": -100, "provider_npi": "123"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_claim_high_complexity_routes_frontier(client, auth_headers):
    resp = client.post(
        "/api/hospital/rcm/claims/submit",
        json={
            "patient_id": "p2",
            "diagnosis_codes": ["I10", "E11.9", "I50.9", "N18.3"],
            "procedure_code": "27447",
            "amount": 32000.0,
            "provider_npi": "123",
            "prior_denial": True,
            "out_of_network": True,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["route"] == "frontier"
