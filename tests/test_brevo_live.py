import os
from types import SimpleNamespace

from sqlalchemy.orm import sessionmaker

import backend.app.services.brevo_service as brevo_service
from tests.test_brevo import _setup


def _minimal_run(db_module, models, tenant_id: int):
    run = models.RecoRun(run_id="run-live", tenant_id=tenant_id)
    summary = models.RunSummary(run_id="run-live", tenant_id=tenant_id, summary_json='{"gate_export": true}')
    eligible = models.NextActionOutput(run_id="run-live", customer_code="C1", eligible=True, tenant_id=tenant_id)
    return run, summary, eligible


def test_dry_run_never_uses_http(monkeypatch, tmp_path):
    monkeypatch.setenv("BREVO_DRY_RUN", "1")
    db_url = f"sqlite:///{tmp_path/'brevo_live_dry.db'}"
    db_module, models, _ = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="t1", domain=None)
    client = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=1)
    db.add_all([tenant, client])
    db.commit()
    db.refresh(tenant)
    run, summary, eligible = _minimal_run(db_module, models, tenant.id)
    db.add_all([run, summary, eligible])
    db.commit()

    called = {"count": 0}

    def fail_send_batch(self, payload):
        called["count"] += 1
        raise AssertionError("HTTP client should not be invoked in dry run")

    monkeypatch.setattr(brevo_service.DummyBrevoClient, "send_batch", fail_send_batch)

    brevo_service.send_batch(
        db,
        tenant_id=tenant.id,
        run_id="run-live",
        template_id="tpl",
        batch_size=200,
        force_dry_run=True,
    )
    assert called["count"] == 0
    db.close()


def test_live_uses_injected_client_without_network(monkeypatch, tmp_path):
    monkeypatch.setenv("BREVO_DRY_RUN", "0")
    monkeypatch.setenv("BREVO_API_KEY", "secret-key")
    db_url = f"sqlite:///{tmp_path/'brevo_live.db'}"
    db_module, models, _ = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="t1", domain=None)
    client = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=1)
    db.add_all([tenant, client])
    db.commit()
    db.refresh(tenant)
    run, summary, eligible = _minimal_run(db_module, models, tenant.id)
    db.add_all([run, summary, eligible])
    db.commit()

    captured = {}

    class FakeClient:
        def send_batch(self, payload):
            captured.update(payload)
            return {"status": "sent"}

    resp = brevo_service.send_batch(
        db,
        tenant_id=tenant.id,
        run_id="run-live",
        template_id="tpl-live",
        batch_size=200,
        force_dry_run=False,
        preview_only=False,
        client=FakeClient(),
    )

    assert captured["template_id"] == "tpl-live"
    assert captured["run_id"] == "run-live"
    assert resp["dry_run"] is False
    db.close()


def test_real_client_retries_on_429(monkeypatch):
    responses = [
        SimpleNamespace(status_code=429, json=lambda: {}, text="too many"),
        SimpleNamespace(status_code=200, json=lambda: {"messageId": "abc"}, text="ok"),
    ]
    calls = {"count": 0}

    def fake_post(url, headers, json, timeout):
        calls["count"] += 1
        return responses[calls["count"] - 1]

    client = brevo_service.RealBrevoClient("key", http_post=fake_post, base_url="http://example.test")
    result = client.send_batch({"template_id": "tpl", "contacts": [], "batch_id": "b1", "run_id": "r1"})
    assert calls["count"] == 2
    assert result["status"] == "sent"
