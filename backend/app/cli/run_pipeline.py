from __future__ import annotations

import csv
import importlib
import json
import os
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..services.recommendation_engine import generate_recommendations_run
from ..services.rfm_service import compute_rfm_for_tenant
from etl.config import get_tenant_paths, BASE_DATA_DIR
from etl.main_multi import run_etl_multi_tenant


SAMPLES_DIR = Path(__file__).resolve().parents[3] / "samples" / "isavigne"


def _ensure_sample_raw(tenant_id: str) -> None:
    base_dir = BASE_DATA_DIR / tenant_id
    if base_dir.exists():
        shutil.rmtree(base_dir)
    raw_dir, _, _ = get_tenant_paths(tenant_id)
    raw_dir.mkdir(parents=True, exist_ok=True)
    for file in SAMPLES_DIR.glob("*.csv"):
        shutil.copy(file, raw_dir / file.name)


def _ensure_tenant(db: Session, models_module, tenant_id: int) -> None:
    tenant = db.query(models_module.Tenant).filter(models_module.Tenant.id == tenant_id).first()
    if tenant is None:
        tenant = models_module.Tenant(id=tenant_id, name=f"Tenant{tenant_id}", domain=None)
        db.add(tenant)
        db.commit()


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def run_pipeline(output_dir: str | Path = "exports", tenant_id: int = 1) -> dict[str, object]:
    os.environ.setdefault("DATA_DIR", "./data")
    os.environ.setdefault("DATABASE_URL", "sqlite:///./data/pipeline.db")

    import backend.app.database as db_module
    import backend.app.models as models_module

    importlib.reload(db_module)
    importlib.reload(models_module)

    SessionLocal = db_module.SessionLocal
    Base = db_module.Base
    engine = db_module.engine

    tenant_key = str(tenant_id)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _ensure_sample_raw(tenant_key)
    etl_results = run_etl_multi_tenant([tenant_key])

    db = SessionLocal()
    try:
        _ensure_tenant(db, models_module, tenant_id)
        compute_rfm_for_tenant(db, tenant_id)
        reco_result = generate_recommendations_run(db, tenant_id=tenant_id)
        run_id = reco_result["run_id"]

        run_dir = Path(output_dir) / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        reco_rows = [
            {
                "run_id": r.run_id,
                "customer_code": r.customer_code,
                "scenario": r.scenario,
                "rank": r.rank,
                "product_key": r.product_key,
                "score": r.score,
                "explain_short": r.explain_short,
            }
            for r in db.query(models_module.RecoOutput).filter(models_module.RecoOutput.run_id == run_id).all()
        ]
        audit_rows = [
            {
                "run_id": r.run_id,
                "customer_code": r.customer_code,
                "severity": r.severity,
                "rule_code": r.rule_code,
                "details": r.details_json,
            }
            for r in db.query(models_module.AuditOutput).filter(models_module.AuditOutput.run_id == run_id).all()
        ]
        next_rows = [
            {
                "run_id": r.run_id,
                "customer_code": r.customer_code,
                "eligible": r.eligible,
                "reason": r.reason,
                "scenario": r.scenario,
                "audit_score": r.audit_score,
            }
            for r in db.query(models_module.NextActionOutput).filter(models_module.NextActionOutput.run_id == run_id).all()
        ]

        exports = {
            "reco_output": str(run_dir / "reco_output.csv"),
            "audit_output": str(run_dir / "audit_output.csv"),
            "next_action_output": str(run_dir / "next_action_output.csv"),
            "run_summary": str(run_dir / "run_summary.json"),
        }
        _write_csv(Path(exports["reco_output"]), reco_rows)
        _write_csv(Path(exports["audit_output"]), audit_rows)
        _write_csv(Path(exports["next_action_output"]), next_rows)

        summary = reco_result.get("summary", {}) or {}
        summary["exports"] = exports
        summary_path = Path(exports["run_summary"])
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

        summary_row = (
            db.query(models_module.RunSummary)
            .filter(models_module.RunSummary.run_id == run_id)
            .first()
        )
        if summary_row:
            summary_row.summary_json = json.dumps(summary)
            db.commit()

        etl_payload = json.loads(json.dumps(etl_results, default=str))

        return {
            "run_id": run_id,
            "etl_results": etl_payload,
            "exports": exports,
        }
    finally:
        db.close()


def main() -> None:
    result = run_pipeline()
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
