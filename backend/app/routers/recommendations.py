"""
Routes pour générer et consulter les recommandations.

Ces endpoints permettent d’invoquer le moteur de recommandations pour un
tenant donné et de consulter les recommandations existantes d’un client.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services.recommendation_engine import generate_recommendations

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/generate", response_model=list[schemas.RecommendationRead])
def generate_recos_for_tenant(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.RecommendationRead]:
    """Génère des recommandations pour tous les clients du tenant courant."""
    recos = generate_recommendations(db, tenant_id=current_user.tenant_id)
    return recos


@router.get("/client/{client_code}", response_model=list[schemas.RecommendationRead])
def get_recommendations_for_client(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.RecommendationRead]:
    """Retourne les recommandations pour un client donné dans le tenant courant."""
    recos = (
        db.query(models.Recommendation)
        .filter(
            models.Recommendation.tenant_id == current_user.tenant_id,
            models.Recommendation.client_code == client_code,
        )
        .all()
    )
    return recos