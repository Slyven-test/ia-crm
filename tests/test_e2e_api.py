import csv
import importlib
import os
import shutil
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker


def _reload_all(db_url: str, data_dir: Path):
    os.environ["DATABASE_URL"] = db_url
    os.environ["DATA_DIR"] = str(data_dir)
    os.environ["ENABLE_DEMO_DATA"] = "0"

    import etl.config as etl_config
    import etl.ingest_raw as ingest_raw
    import etl.load_postgres_multi as load_multi
    import etl.main_multi as main_multi
    import etl.transform_sales as transform_sales

    import backend.app.database as db_module
    import backend.app.models as models
    import backend.app.services.recommendation_engine as reco_engine
    import backend.app.main as main_module

    for mod in [
        etl_config,
        ingest_raw,
        transform_sales,
        load_multi,
        main_multi,
        db_module,
        models,
        reco_engine,
        main_module,
    ]:
        importlib.reload(mod)

    return {
        "etl_config": etl_config,
        "ingest_raw": ingest_raw,
        "load_multi": load_multi,
        "main_multi": main_multi,
        "db_module": db_module,
        "models": models,
        "reco_engine": reco_engine,
        "main_module": main_module,
    }


def test_e2e_pipeline_with_exports(tmp_path: Path) -> None:
    db_path = tmp_path / "e2e.db"
    modules = _reload_all(f"sqlite:///{db_path}", tmp_path / "data")

    db_module = modules["db_module"]
    models = modules["models"]
    main_module = modules["main_module"]
    main_multi = modules["main_multi"]

    db_module.Base.metadata.drop_all(bind=db_module.engine)
    db_module.Base.metadata.create_all(bind=db_module.engine)

    SessionLocal = sessionmaker(bind=db_module.engine)
    db = SessionLocal()
    tenant = models.Tenant(name="Demo", domain=None)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    tenant_id = tenant.id

    db.expunge(tenant)
    db.close()

    # Copy fixture dataset into raw folder
    sample_dir = Path(__file__).resolve().parent.parent / "samples" / "isavigne"
    raw_dir, _, _ = modules["etl_config"].get_tenant_paths(str(tenant_id))
    raw_dir.mkdir(parents=True, exist_ok=True)
    for file in sample_dir.glob("*.csv"):
        shutil.copy(file, raw_dir / file.name)

    # Run full ETL for this tenant
    results = main_multi.run_etl_multi_tenant([str(tenant_id)])
    assert results and results[0]["verification"]["success"]

    # Launch API and trigger reco run
    app = main_module.create_app()
    from backend.app.routers.auth import get_current_user

    class _DummyUser:
        def __init__(self, tenant_id: int):
            self.tenant_id = tenant_id

    app.dependency_overrides[get_current_user] = lambda: _DummyUser(tenant_id)
    client = TestClient(app)

    reco_resp = client.post("/reco/run")
    assert reco_resp.status_code == 200
    payload = reco_resp.json()
    run_id = payload["run"]["run_id"]
    summary = payload.get("summary", {})
    assert summary.get("total_recommendations", 0) > 0
    assert summary.get("gate_export") is False  # at least one client ineligible (no email)

    # Exports
    reco_csv = client.get(f"/export/runs/{run_id}/reco_output.csv")
    audit_csv = client.get(f"/export/runs/{run_id}/audit_output.csv")
    next_action_csv = client.get(f"/export/runs/{run_id}/next_action_output.csv")
    run_summary = client.get(f"/export/runs/{run_id}/run_summary.json")

    assert reco_csv.status_code == 200 and len(reco_csv.text.splitlines()) > 1
    assert audit_csv.status_code == 200 and len(audit_csv.text.splitlines()) > 1
    assert next_action_csv.status_code == 200 and len(next_action_csv.text.splitlines()) > 1
    assert run_summary.status_code == 200
    exported_summary = run_summary.json().get("summary", {})
    assert exported_summary.get("gate_export") is False

    reader = csv.DictReader(next_action_csv.text.splitlines())
    eligibility = [row.get("eligible") for row in reader]
    assert "True" in eligibility and "False" in eligibility
