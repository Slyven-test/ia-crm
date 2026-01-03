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


def test_cors_headers_respect_allow_list(tmp_path: Path):
    allowed = "http://allowed.test"
    os.environ["CORS_ALLOW_ORIGINS"] = allowed
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'cors.db'}")
    app = main_module.create_app()
    client = TestClient(app)

    resp_allowed = client.get("/", headers={"origin": allowed})
    assert resp_allowed.headers.get("access-control-allow-origin") == allowed

    resp_blocked = client.get("/", headers={"origin": "http://blocked.test"})
    assert "access-control-allow-origin" not in resp_blocked.headers


def test_auth_required_and_granted_on_sensitive_endpoint(tmp_path: Path):
    db_url = f"sqlite:///{tmp_path/'auth.db'}"
    db_module, models, main_module = _reload_for_env(db_url)
    SessionLocal = db_module.SessionLocal
    db = SessionLocal()

    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    hashed = auth_service.get_password_hash("demo")
    user = models.User(username="demo", email="demo@test.com", hashed_password=hashed, tenant_id=tenant.id)
    client_row = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id)
    run = models.RecoRun(run_id="run1", tenant_id=tenant.id)
    summary = models.RunSummary(run_id="run1", tenant_id=tenant.id, summary_json='{"gate_export": true}')
    next_action = models.NextActionOutput(run_id="run1", customer_code="C1", eligible=True, tenant_id=tenant.id)
    db.add_all([user, client_row, run, summary, next_action])
    db.commit()
    db.close()

    app = main_module.create_app()
    client = TestClient(app)

    # Without token -> unauthorized
    resp_unauth = client.post(
        "/brevo/send_batch",
        json={"run_id": "run1", "template_id": "tpl", "batch_size": 200},
    )
    assert resp_unauth.status_code in {401, 403}

    # With token -> allowed (and DRY_RUN by default)
    token_resp = client.post(
        "/auth/token",
        data={"username": "demo", "password": "demo"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert token_resp.status_code == 200
    token = token_resp.json()["access_token"]

    resp_auth = client.post(
        "/brevo/send_batch",
        json={"run_id": "run1", "template_id": "tpl", "batch_size": 200},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_auth.status_code == 200


def test_logs_redact_secrets(caplog, tmp_path: Path):
    os.environ["BREVO_API_KEY"] = "SUPERSECRET"
    db_module, models, main_module = _reload_for_env(f"sqlite:///{tmp_path/'logs.db'}")
    app = main_module.create_app()
    client = TestClient(app)
    assert client.get("/health").status_code == 200

    logger = importlib.import_module("logging").getLogger("ia-crm-redaction")
    with caplog.at_level("INFO"):
        logger.info("Brevo key is SUPERSECRET")
    assert "SUPERSECRET" not in caplog.text
    assert "***" in caplog.text
