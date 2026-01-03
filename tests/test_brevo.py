import os
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.app.services.brevo_service as brevo_service


def _setup(db_url: str):
    os.environ["DATABASE_URL"] = db_url
    import importlib
    import backend.app.database as db_module
    import backend.app.models as models
    import backend.app.services.brevo_service as brevo_service
    import backend.app.main as main_module

    importlib.reload(db_module)
    importlib.reload(models)
    importlib.reload(brevo_service)
    importlib.reload(main_module)
    db_module.Base.metadata.drop_all(bind=db_module.engine)
    db_module.Base.metadata.create_all(bind=db_module.engine)
    return db_module, models, main_module


def test_sync_contacts_creates_log(tmp_path):
    db_url = f"sqlite:///{tmp_path/'brevo_sync.db'}"
    db_module, models, main_module = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    user = models.User(username="u", email="u@test.com", hashed_password="x", tenant_id=tenant.id)
    client = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id)
    db.add_all([user, client])
    db.commit()

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    http = TestClient(app)
    resp = http.post("/brevo/sync_contacts")
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1
    logs = db.query(models.BrevoLog).all()
    assert len(logs) == 1
    assert logs[0].action == "sync_contacts"
    app.dependency_overrides = {}
    db.close()


def test_send_batch_dry_run_creates_logs_and_history(tmp_path):
    os.environ["BREVO_DRY_RUN"] = "1"
    db_url = f"sqlite:///{tmp_path/'brevo_send.db'}"
    db_module, models, main_module = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    user = models.User(username="u", email="u@test.com", hashed_password="x", tenant_id=tenant.id)
    client = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id)
    run = models.RecoRun(run_id="run1", tenant_id=tenant.id)
    summary = models.RunSummary(run_id="run1", tenant_id=tenant.id, summary_json='{"gate_export": true}')
    next_action = models.NextActionOutput(run_id="run1", customer_code="C1", eligible=True, tenant_id=tenant.id)
    db.add_all([user, client, run, summary, next_action])
    db.commit()

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    http = TestClient(app)
    resp = http.post(
        "/brevo/send_batch",
        json={"run_id": "run1", "template_id": "tpl", "batch_size": 200, "dry_run": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dry_run"] is True
    logs = db.query(models.BrevoLog).filter_by(run_id="run1").all()
    assert logs, "A brevo log should be recorded"
    history = db.query(models.ContactHistory).all()
    assert history, "Contact history should be recorded even in dry run"
    app.dependency_overrides = {}
    db.close()


def test_send_batch_respects_gate_and_no_http_in_dry_run(monkeypatch, tmp_path):
    os.environ["BREVO_DRY_RUN"] = "1"
    db_url = f"sqlite:///{tmp_path/'brevo_gate.db'}"
    db_module, models, main_module = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    user = models.User(username="u", email="u@test.com", hashed_password="x", tenant_id=tenant.id)
    clients = [
        models.Client(client_code="C1", name="Ok", email="ok@test.com", tenant_id=tenant.id),
        models.Client(client_code="C2", name="Nope", email="nope@test.com", tenant_id=tenant.id),
    ]
    run = models.RecoRun(run_id="run1", tenant_id=tenant.id)
    summary = models.RunSummary(run_id="run1", tenant_id=tenant.id, summary_json='{"gate_export": true}')
    eligible = models.NextActionOutput(run_id="run1", customer_code="C1", eligible=True, tenant_id=tenant.id)
    ineligible = models.NextActionOutput(run_id="run1", customer_code="C2", eligible=False, tenant_id=tenant.id)
    db.add_all([user, run, summary, eligible, ineligible] + clients)
    db.commit()

    called = {"count": 0}

    def fake_send_batch(self, payload):
        called["count"] += 1
        return {"status": "noop"}

    monkeypatch.setattr(brevo_service.DummyBrevoClient, "send_batch", fake_send_batch)

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    http = TestClient(app)
    resp = http.post(
        "/brevo/send_batch",
        json={"run_id": "run1", "template_id": "tpl", "batch_size": 200, "dry_run": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1  # only eligible contact
    assert called["count"] == 0  # no HTTP when dry_run
    logs = db.query(models.BrevoLog).filter_by(run_id="run1").all()
    assert logs and all("api" not in logs[0].payload_redacted.lower() for _ in logs)
    app.dependency_overrides = {}
    db.close()
