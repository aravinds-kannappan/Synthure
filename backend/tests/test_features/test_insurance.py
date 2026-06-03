"""Insurance matcher pipeline tests."""


def test_insurance_pipeline_employed(client, auth_headers):
    resp = client.post(
        "/api/features/match-insurance",
        json={"age": 35, "annual_income": 55000, "employed": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0
    top = data["recommendations"][0]
    assert "plan" in top and "match_score" in top


def test_insurance_pipeline_medicare_age(client, auth_headers):
    resp = client.post(
        "/api/features/match-insurance",
        json={"age": 67, "annual_income": 28000, "employed": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    plans = [r["plan"] for r in resp.json()["recommendations"]]
    assert any("Medicare" in p for p in plans)
