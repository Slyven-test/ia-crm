import importlib
import os
from pathlib import Path

import pytest
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


def test_patch_client_updates_fields(tmp_path: Path) -> None:
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'clients.db'}")
    db = db_module.SessionLocal()

    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = models.User(
        username="demo",
        email="demo@test.com",
        hashed_password=auth_service.get_password_hash("demo"),
        tenant_id=tenant.id,
    )
    client_row = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id)
    db.add_all([user, client_row])
    db.commit()
    db.close()

    app = main_module.create_app()
    client = TestClient(app)
    headers = _auth_headers(client, "demo", "demo")

    resp = client.patch("/api/clients/C1", json={"name": "Alice Updated"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alice Updated"


def test_delete_client_conflict_when_sales_exist(tmp_path: Path) -> None:
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'client_sales.db'}")
    db = db_module.SessionLocal()

    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = models.User(
        username="demo",
        email="demo@test.com",
        hashed_password=auth_service.get_password_hash("demo"),
        tenant_id=tenant.id,
    )
    client_row = models.Client(client_code="C2", name="Bob", email="bob@test.com", tenant_id=tenant.id)
    sale = models.Sale(
        document_id="INV-1",
        product_key="P1",
        client_code="C2",
        tenant_id=tenant.id,
    )
    db.add_all([user, client_row, sale])
    db.commit()
    db.close()

    app = main_module.create_app()
    client = TestClient(app)
    headers = _auth_headers(client, "demo", "demo")

    resp = client.delete("/api/clients/C2", headers=headers)
    assert resp.status_code == 409


def test_patch_product_updates_fields(tmp_path: Path) -> None:
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'products.db'}")
    db = db_module.SessionLocal()

    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = models.User(
        username="demo",
        email="demo@test.com",
        hashed_password=auth_service.get_password_hash("demo"),
        tenant_id=tenant.id,
    )
    product = models.Product(
        product_key="P1",
        name="Wine",
        tenant_id=tenant.id,
    )
    db.add_all([user, product])
    db.commit()
    db.close()

    app = main_module.create_app()
    client = TestClient(app)
    headers = _auth_headers(client, "demo", "demo")

    resp = client.patch("/api/products/P1", json={"description": "Updated"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated"
