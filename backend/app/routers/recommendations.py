"""
Routes pour générer et consulter les recommandations.

Ces endpoints permettent d’invoquer le moteur de recommandations pour un
client donné et de consulter les recommandations persistées.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services.recommendations_v2 import get_accessible_clients_query, get_accessible_products_query

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/", response_model=list[schemas.RecommendationRead])
def list_recommendations(
    scenario: str | None = None,
    approved_only: bool = False,
    client_code: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.RecommendationRead]:
    query = db.query(models.Recommendation).filter(
        models.Recommendation.tenant_id == current_user.tenant_id
    )
    if scenario:
        query = query.filter(models.Recommendation.scenario == scenario)
    if approved_only:
        query = query.filter(models.Recommendation.is_approved.is_(True))
    if client_code:
        query = query.filter(models.Recommendation.client_code == client_code)
    if not current_user.is_superuser:
        query = (
            query.join(
                models.Client,
                and_(
                    models.Client.tenant_id == models.Recommendation.tenant_id,
                    models.Client.client_code == models.Recommendation.client_code,
                ),
            )
            .join(
                models.Product,
                and_(
                    models.Product.tenant_id == models.Recommendation.tenant_id,
                    models.Product.product_key == models.Recommendation.product_key,
                ),
            )
            .filter(
                or_(
                    models.Client.owner_user_id == current_user.id,
                    models.Client.visibility == "tenant",
                    models.Client.owner_user_id.is_(None),
                ),
                or_(
                    models.Product.owner_user_id == current_user.id,
                    models.Product.visibility == "tenant",
                    models.Product.owner_user_id.is_(None),
                ),
            )
        )
    else:
        query = query.join(
            models.Product,
            and_(
                models.Product.tenant_id == models.Recommendation.tenant_id,
                models.Product.product_key == models.Recommendation.product_key,
            ),
        )
    return (
        query.order_by(models.Recommendation.score.desc(), models.Recommendation.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.patch("/{reco_id}", response_model=schemas.RecommendationRead)
def update_recommendation(
    reco_id: int,
    reco_update: schemas.RecommendationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.RecommendationRead:
    reco = (
        db.query(models.Recommendation)
        .filter(
            models.Recommendation.tenant_id == current_user.tenant_id,
            models.Recommendation.id == reco_id,
        )
        .first()
    )
    if not reco:
        raise HTTPException(status_code=404, detail="Recommandation introuvable")

    client = (
        get_accessible_clients_query(db, current_user)
        .filter(models.Client.client_code == reco.client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Recommandation introuvable")
    product = (
        get_accessible_products_query(db, current_user)
        .filter(models.Product.product_key == reco.product_key)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Recommandation introuvable")

    reco.is_approved = reco_update.is_approved
    db.add(reco)
    db.commit()
    db.refresh(reco)
    return reco
