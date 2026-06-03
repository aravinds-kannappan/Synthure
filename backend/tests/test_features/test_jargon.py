"""Jargon decoder pipeline tests."""


def test_jargon_pipeline_demo_mode(client, auth_headers):
    resp = client.post(
        "/api/features/explain-jargon",
        json={"notes": "Patient presents with essential hypertension I10 and dyslipidemia E78.5. Started lisinopril 10mg."},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "summary" in data["data"]
    assert "conditions" in data["data"]
    assert isinstance(data["data"]["conditions"], list)


def test_jargon_pipeline_empty_notes(client, auth_headers):
    resp = client.post("/api/features/explain-jargon", json={"notes": ""}, headers=auth_headers)
    assert resp.status_code == 400


def test_jargon_pipeline_too_long(client, auth_headers):
    resp = client.post("/api/features/explain-jargon", json={"notes": "x" * 6000}, headers=auth_headers)
    assert resp.status_code == 422
