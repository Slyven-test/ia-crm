"""
Routes d'export de données pour ia‑crm.

Ce module fournit des endpoints permettant de télécharger des données au format
CSV ou JSON. Les exports disponibles sont :

* ``GET /export/recommendations`` : exporte les recommandations
  (client_code, product_key, score, scénario, validation, date de création)
  pour le tenant courant.
* ``GET /export/audit`` : exporte les logs d'audit (date d'exécution,
  nombre d'erreurs, avertissements, score, détails) pour le tenant courant.

L'utilisateur doit être authentifié ; son ``tenant_id`` est utilisé pour
filtrer les données. Un paramètre ``format`` permet de choisir entre
``csv`` (par défaut) et ``json``.
"""

from __future__ import annotations

import io
from typing import List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user


router = APIRouter(prefix="/export", tags=["export"])


def _export_as_csv(data: List[dict], filename: str) -> StreamingResponse:
    """Convertit une liste de dictionnaires en CSV et renvoie une réponse de streaming."""
    df = pd.DataFrame(data)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    response = StreamingResponse(
        iter([stream.getvalue()]), media_type="text/csv"
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@router.get("/recommendations", response_model=None)
def export_recommendations(
    format: str = Query("csv", regex="^(csv|json)$", description="Format de sortie (csv ou json)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse | JSONResponse:
    """Exporte les recommandations du tenant courant.

    Args:
        format: ``csv`` (par défaut) ou ``json`` pour choisir le type de réponse.

    Returns:
        StreamingResponse pour un CSV ou JSONResponse pour un tableau JSON.
    """
    recs = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.tenant_id == current_user.tenant_id)
        .all()
    )
    data = [
        {
            "client_code": r.client_code,
            "product_key": r.product_key,
            "score": r.score,
            "scenario": r.scenario,
            "is_approved": r.is_approved,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recs
    ]
    if format == "json":
        return JSONResponse(content=data)
    return _export_as_csv(data, "recommendations.csv")


@router.get("/audit", response_model=None)
def export_audit_logs(
    format: str = Query("csv", regex="^(csv|json)$", description="Format de sortie (csv ou json)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse | JSONResponse:
    """Exporte les logs d'audit du tenant courant."""
    logs = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.tenant_id == current_user.tenant_id)
        .all()
    )
    data = [
        {
            "executed_at": log.executed_at.isoformat() if log.executed_at else None,
            "errors": log.errors,
            "warnings": log.warnings,
            "score": log.score,
            "details": log.details,
        }
        for log in logs
    ]
    if format == "json":
        return JSONResponse(content=data)
    return _export_as_csv(data, "audit_logs.csv")
