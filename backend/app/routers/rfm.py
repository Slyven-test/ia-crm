"""
Routes d'API pour le calcul et la consultation des segments RFM.

Ces routes permettent de déclencher le calcul des scores RFM et des
préférences clients, ainsi que de consulter la distribution des
segments pour un tenant donné.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..routers.auth import get_current_user
from ..services import rfm_service, preference_service, analytics_service

router = APIRouter(prefix="/rfm", tags=["rfm"])


@router.post("/run")
def run_rfm_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Déclenche le calcul des scores RFM et des préférences pour le tenant courant.

    Retourne un message de réussite avec le nombre total de clients impactés.
    """
    tenant_id = current_user.tenant_id
    rfm_service.compute_rfm_for_tenant(db, tenant_id)
    preference_service.compute_client_preferences(db, tenant_id)
    preference_service.compute_products_popularity(db, tenant_id)
    distribution = analytics_service.get_segment_distribution(db, tenant_id)
    return {"message": "RFM et préférences recalculés", "distribution": distribution}


@router.get("/distribution")
def get_rfm_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retourne la distribution des segments RFM pour le tenant courant."""
    dist = analytics_service.get_segment_distribution(db, current_user.tenant_id)
    return dist