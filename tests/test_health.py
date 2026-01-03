import os

from fastapi.testclient import TestClient

# Use SQLite for lightweight health checks during tests
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from backend.app.main import app  # noqa: E402


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") in {"ok", "degraded"}
    assert "db" in data
