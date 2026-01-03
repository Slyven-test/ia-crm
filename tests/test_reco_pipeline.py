import importlib
import os
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _reload_modules(db_url: str):
    os.environ["DATABASE_URL"] = db_url
    import backend.app.database as db_module
    import backend.app.models as models_module
    import backend.app.services.recommendation_engine as reco_module
    import backend.app.main as main_module

    importlib.reload(db_module)
    importlib.reload(models_module)
    importlib.reload(reco_module)
    importlib.reload(main_module)
    return db_module, models_module, reco_module, main_module


def _prepare_db(db_module):
    db_module.Base.metadata.drop_all(bind=db_module.engine)
    db_module.Base.metadata.create_all(bind=db_module.engine)


def test_reco_run_generates_outputs_and_exports(tmp_path):
    db_url = f"sqlite:///{tmp_path/'reco.db'}"
    db_module, models, reco_module, main_module = _reload_modules(db_url)
    _prepare_db(db_module)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()

    tenant = models.Tenant(name="TestCo", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    products = [
        models.Product(product_key="P1", name="Rouge", family_crm="Rouge", price_ttc=12, tenant_id=tenant.id, global_popularity_score=0.4),
        models.Product(product_key="P2", name="Blanc", family_crm="Blanc", price_ttc=15, tenant_id=tenant.id, global_popularity_score=0.6),
        models.Product(product_key="P3", name="Rouge Premium", family_crm="Rouge", price_ttc=25, tenant_id=tenant.id, global_popularity_score=0.8, sucrosite_niveau="sec"),
    ]
    db.add_all(products)
    client = models.Client(client_code="C1", name="Alice", email="alice@test.com", tenant_id=tenant.id, average_order_value=10)
    db.add(client)
    db.commit()
    db.refresh(client)

    sale_date = datetime.utcnow() - timedelta(days=45)
    db.add_all(
        [
            models.Sale(document_id="D1", product_key="P1", client_code="C1", quantity=2, amount=24, sale_date=sale_date, tenant_id=tenant.id),
            models.Sale(document_id="D2", product_key="P2", client_code="C1", quantity=1, amount=15, sale_date=sale_date, tenant_id=tenant.id),
        ]
    )
    user = models.User(username="u", email="u@test.com", hashed_password="x", tenant_id=tenant.id)
    db.add(user)
    db.commit()

    run = reco_module.generate_recommendations_run(db, tenant_id=tenant.id, top_n=3)
    run_id = run["run_id"]
    rec_outputs = db.query(models.RecoOutput).filter_by(run_id=run_id).all()
    assert rec_outputs
    next_actions = db.query(models.NextActionOutput).filter_by(run_id=run_id).all()
    assert next_actions

    app = main_module.app
    from backend.app.routers.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    client_http = TestClient(app)
    resp = client_http.get(f"/export/runs/{run_id}/reco_output.csv")
    assert resp.status_code == 200
    assert run_id in resp.text
    resp_summary = client_http.get(f"/export/runs/{run_id}/run_summary.json")
    assert resp_summary.status_code == 200
    assert resp_summary.json()["summary"].get("total_recommendations", 0) > 0
    app.dependency_overrides = {}
    db.close()


def test_gating_marks_missing_email_ineligible(tmp_path):
    db_url = f"sqlite:///{tmp_path/'gating.db'}"
    db_module, models, reco_module, _ = _reload_modules(db_url)
    _prepare_db(db_module)
    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()

    tenant = models.Tenant(name="Tenant", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    db.add_all(
        [
            models.Product(product_key="P1", name="Basique", family_crm="Rouge", price_ttc=8, tenant_id=tenant.id, sucrosite_niveau="sec"),
            models.Product(product_key="P2", name="Premium", family_crm="Rouge", price_ttc=20, tenant_id=tenant.id, sucrosite_niveau="sec"),
        ]
    )
    db.add_all(
        [
            models.Client(client_code="C1", name="Ok", email="ok@test.com", tenant_id=tenant.id, average_order_value=10),
            models.Client(client_code="C2", name="NoEmail", email=None, tenant_id=tenant.id, average_order_value=10),
        ]
    )
    db.commit()
    sale_date = datetime.utcnow() - timedelta(days=60)
    db.add_all(
        [
            models.Sale(document_id="S1", product_key="P1", client_code="C1", quantity=1, amount=8, sale_date=sale_date, tenant_id=tenant.id),
            models.Sale(document_id="S2", product_key="P1", client_code="C2", quantity=1, amount=8, sale_date=sale_date, tenant_id=tenant.id),
        ]
    )
    db.commit()

    run = reco_module.generate_recommendations_run(db, tenant_id=tenant.id, top_n=2)
    run_id = run["run_id"]
    next_actions = db.query(models.NextActionOutput).filter_by(run_id=run_id).all()
    missing = {na.customer_code: na for na in next_actions}
    assert missing["C2"].eligible is False
    assert missing["C2"].reason in {"MISSING_EMAIL", "AUDIT_SCORE_BELOW_THRESHOLD"}
    db.close()
