import importlib
import os
from typing import Tuple

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker


def _setup(db_url: str) -> Tuple:
    os.environ["DATABASE_URL"] = db_url
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


def _seed_minimal(db, models):
    tenant = models.Tenant(name="t1", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    user = models.User(username="demo", email="demo@test.com", hashed_password="x", tenant_id=tenant.id)
    run = models.RecoRun(run_id="run1", tenant_id=tenant.id)
    summary = models.RunSummary(run_id="run1", tenant_id=tenant.id, summary_json='{"gate_export": true}')
    contacts = [
        models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id),
        models.Client(client_code="C2", name="Bob", email="bob@test.com", tenant_id=tenant.id, cluster="A"),
    ]
    eligibles = [
        models.NextActionOutput(run_id="run1", customer_code="C1", eligible=True, tenant_id=tenant.id),
        models.NextActionOutput(run_id="run1", customer_code="C2", eligible=True, tenant_id=tenant.id),
    ]
    reco = models.RecoOutput(run_id="run1", customer_code="C1", product_key="P1", score=0.9, tenant_id=tenant.id)
    db.add_all([user, run, summary, reco] + contacts + eligibles)
    db.commit()
    return tenant, user


def test_campaign_preview_and_send_dry_run(tmp_path):
    db_url = f"sqlite:///{tmp_path/'campaigns.db'}"
    db_module, models, main_module = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant, user = _seed_minimal(db, models)

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app)

    preview_resp = client.post(
        "/campaigns/preview",
        json={"template_id": "tpl", "batch_size": 200, "preview_only": True},
    )
    assert preview_resp.status_code == 200
    data = preview_resp.json()
    assert data["run_id"] == "run1"
    assert data["n_selected"] == 2
    assert data["n_in_batch"] == 2
    assert len(data["preview"]) == 2
    assert data["preview_only"] is True

    send_resp = client.post(
        "/campaigns/send",
        json={"template_id": "tpl", "batch_size": 200},
    )
    assert send_resp.status_code == 200
    send_data = send_resp.json()
    assert send_data["result"]["dry_run"] is True  # no API key => DRY RUN
    assert send_data["n_in_batch"] == 2
    app.dependency_overrides = {}
    db.close()


def test_campaign_filters_cluster(tmp_path):
    db_url = f"sqlite:///{tmp_path/'campaigns_filter.db'}"
    db_module, models, main_module = _setup(db_url)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant, user = _seed_minimal(db, models)

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app)

    resp = client.post(
        "/campaigns/preview",
        json={"template_id": "tpl", "cluster": "A"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["n_selected"] == 1
    assert data["n_in_batch"] == 1
    assert len(data["preview"]) == 1
    app.dependency_overrides = {}
    db.close()
