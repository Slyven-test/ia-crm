import importlib
import os
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.services import auth_service


def _reload_for_env(db_url: str):
    os.environ["DATABASE_URL"] = db_url
    os.environ.setdefault("ENABLE_DEMO_DATA", "0")
    import backend.app.database as db_module
    import backend.app.models as models
    import backend.app.main as main_module

    for mod in [db_module, models, main_module]:
        importlib.reload(mod)

    db_module.Base.metadata.drop_all(bind=db_module.engine)
    db_module.Base.metadata.create_all(bind=db_module.engine)
    return db_module, models, main_module


def _auth_headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    token_resp = client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert token_resp.status_code == 200
    token = token_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_tenant_isolation_for_clients_and_products(tmp_path: Path) -> None:
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'tenant_isolation.db'}")
    db = db_module.SessionLocal()

    tenant_a = models.Tenant(name="tenant-a", domain=None)
    tenant_b = models.Tenant(name="tenant-b", domain=None)
    db.add_all([tenant_a, tenant_b])
    db.commit()
    db.refresh(tenant_a)
    db.refresh(tenant_b)
    tenant_a_id = tenant_a.id
    tenant_b_id = tenant_b.id

    user_a = models.User(
        username="user-a",
        email="a@test.com",
        hashed_password=auth_service.get_password_hash("pass-a"),
        tenant_id=tenant_a_id,
    )
    user_b = models.User(
        username="user-b",
        email="b@test.com",
        hashed_password=auth_service.get_password_hash("pass-b"),
        tenant_id=tenant_b_id,
    )
    db.add_all([user_a, user_b])
    db.commit()
    db.close()

    app = main_module.create_app()
    client = TestClient(app)
    headers_a = _auth_headers(client, "user-a", "pass-a")
    headers_b = _auth_headers(client, "user-b", "pass-b")

    create_client = client.post(
        "/api/clients/",
        json={
            "tenant_id": tenant_b_id,
            "client_code": "C100",
            "name": "Alice",
            "email": "alice@example.com",
        },
        headers=headers_a,
    )
    assert create_client.status_code == 201
    assert create_client.json()["tenant_id"] == tenant_a_id

    create_product = client.post(
        "/api/products/",
        json={
            "tenant_id": tenant_b_id,
            "product_key": "P100",
            "name": "Wine",
        },
        headers=headers_a,
    )
    assert create_product.status_code == 201
    assert create_product.json()["tenant_id"] == tenant_a_id

    list_clients_b = client.get("/api/clients/", headers=headers_b)
    assert list_clients_b.status_code == 200
    assert list_clients_b.json() == []

    list_products_b = client.get("/api/products/", headers=headers_b)
    assert list_products_b.status_code == 200
    assert list_products_b.json() == []

    get_client_b = client.get("/api/clients/C100", headers=headers_b)
    assert get_client_b.status_code == 404

    patch_client_b = client.patch("/api/clients/C100", json={"name": "Nope"}, headers=headers_b)
    assert patch_client_b.status_code == 404

    delete_client_b = client.delete("/api/clients/C100", headers=headers_b)
    assert delete_client_b.status_code == 404

    get_product_b = client.get("/api/products/P100", headers=headers_b)
    assert get_product_b.status_code == 404

    patch_product_b = client.patch("/api/products/P100", json={"description": "Nope"}, headers=headers_b)
    assert patch_product_b.status_code == 404

    delete_product_b = client.delete("/api/products/P100", headers=headers_b)
    assert delete_product_b.status_code == 404
