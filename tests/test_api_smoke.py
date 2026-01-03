from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_health_and_docs_and_routes_exist() -> None:
    client = TestClient(create_app())

    health = client.get("/health")
    assert health.status_code == 200
    health_data = health.json()
    assert health_data.get("status") in {"ok", "degraded"}
    assert health_data.get("db") in {"ok", "error"}

    docs = client.get("/docs")
    assert docs.status_code == 200 or docs.status_code == 307

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json().get("paths", {})

    assert "/etl/ingest" in paths
    assert "/reco/run" in paths
    assert "/export/recommendations" in paths
