"""pytest fixtures for Synthure backend tests."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from backend.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    resp = client.post("/api/auth/login", json={"email": "demo@synthure.ai", "password": "demo1234"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def patient_headers(client):
    resp = client.post("/api/auth/login", json={"email": "patient@synthure.ai", "password": "demo1234"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['token']}"}
