from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services.recommendation_engine import generate_recommendations_run

router = APIRouter(prefix="/reco", tags=["reco"])


def _parse_summary(summary: models.RunSummary | None) -> Dict[str, Any]:
    if not summary or not summary.summary_json:
        return {}
    try:
        return json.loads(summary.summary_json)
    except Exception:
        return {}


@router.post("/run", response_model=schemas.RecoRunDetail)
def trigger_reco_run(
    top_n: int = Query(5, ge=1, le=20),
    silence_window_days: int = Query(7, ge=1, le=60),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.RecoRunDetail:
    """Lance un run de recommandations + audit et retourne un résumé immédiat."""
    result = generate_recommendations_run(
        db,
        tenant_id=current_user.tenant_id,
        top_n=top_n,
        silence_window_days=silence_window_days,
    )
    run = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.run_id == result["run_id"], models.RecoRun.tenant_id == current_user.tenant_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run introuvable après génération")
    next_actions = (
        db.query(models.NextActionOutput)
        .filter(models.NextActionOutput.run_id == run.run_id, models.NextActionOutput.tenant_id == current_user.tenant_id)
        .order_by(models.NextActionOutput.audit_score.asc().nulls_last())
        .limit(20)
        .all()
    )
    audit_rows = (
        db.query(models.AuditOutput)
        .filter(models.AuditOutput.run_id == run.run_id, models.AuditOutput.tenant_id == current_user.tenant_id)
        .limit(50)
        .all()
    )
    return schemas.RecoRunDetail(
        run=run,
        summary=result.get("summary"),
        next_actions=next_actions,
        top_audit=audit_rows,
    )


@router.get("/runs", response_model=list[schemas.RecoRunRead])
def list_runs(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.RecoRunRead]:
    runs = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.tenant_id == current_user.tenant_id)
        .order_by(models.RecoRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return runs


@router.get("/runs/{run_id}", response_model=schemas.RecoRunDetail)
def get_run_detail(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.RecoRunDetail:
    run = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.run_id == run_id, models.RecoRun.tenant_id == current_user.tenant_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run introuvable")
    summary = _parse_summary(run.summary)
    next_actions = (
        db.query(models.NextActionOutput)
        .filter(models.NextActionOutput.run_id == run_id, models.NextActionOutput.tenant_id == current_user.tenant_id)
        .order_by(models.NextActionOutput.audit_score.asc().nulls_last())
        .limit(50)
        .all()
    )
    audit_rows = (
        db.query(models.AuditOutput)
        .filter(models.AuditOutput.run_id == run_id, models.AuditOutput.tenant_id == current_user.tenant_id)
        .limit(50)
        .all()
    )
    return schemas.RecoRunDetail(run=run, summary=summary, next_actions=next_actions, top_audit=audit_rows)
