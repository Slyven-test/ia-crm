"""
Routes pour la consultation des runs de recommandations.

Les endpoints définis dans ce module permettent de lister les exécutions du
moteur de recommandation (``RecoRun``) et de consulter le détail des
recommandations individuelles générées (``RecoItem``). Les données sont
filtrées par ``tenant_id`` en fonction de l’utilisateur authentifié afin
d’assurer l’isolation multi‑tenant.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user


router = APIRouter(prefix="/reco-runs", tags=["reco-runs"])


@router.get("/", response_model=List[schemas.RecoRunRead])
def list_reco_runs(
    limit: int = Query(100, description="Nombre maximum de runs à retourner"),
    offset: int = Query(0, description="Décalage pour la pagination"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.RecoRunRead]:
    """Retourne la liste des runs de recommandations pour le tenant courant."""
    runs = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.tenant_id == current_user.tenant_id)
        .order_by(models.RecoRun.executed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return runs


@router.get("/{run_id}/items", response_model=List[schemas.RecoItemRead])
def list_reco_items_for_run(
    run_id: int,
    client_id: Optional[int] = Query(
        None, description="Filtrer les recommandations par identifiant de client"
    ),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.RecoItemRead]:
    """Retourne les recommandations générées lors d’un run spécifique."""
    # Vérifier que le run appartient au tenant
    run = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.id == run_id, models.RecoRun.tenant_id == current_user.tenant_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run introuvable")
    query = db.query(models.RecoItem).filter(
        models.RecoItem.run_id == run_id, models.RecoItem.tenant_id == current_user.tenant_id
    )
    if client_id:
        query = query.filter(models.RecoItem.client_id == client_id)
    items = query.order_by(models.RecoItem.rank.asc()).all()
    return items