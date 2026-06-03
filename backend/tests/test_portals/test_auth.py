"""Auth endpoint tests."""


def test_login_demo_user(client):
    resp = client.post("/api/auth/login", json={"email": "demo@synthure.ai", "password": "demo1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["role"] == "physician"


def test_login_all_roles(client):
    for email, expected_role in [
        ("patient@synthure.ai", "patient"),
        ("doctor@synthure.ai", "physician"),
        ("admin@synthure.ai", "hospital_admin"),
        ("hr@synthure.ai", "employer_admin"),
    ]:
        resp = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
        assert resp.status_code == 200, f"Login failed for {email}"
        assert resp.json()["role"] == expected_role


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"email": "demo@synthure.ai", "password": "wrong"})
    assert resp.status_code == 401


def test_protected_endpoint_no_token(client):
    resp = client.post("/api/features/explain-jargon", json={"notes": "test"})
    assert resp.status_code == 403  # No auth header
