"""
Routes d'API pour les analytics.

Ces endpoints fournissent les indicateurs clés (KPIs) et les séries
temporelles nécessaires à l'affichage du tableau de bord.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..routers.auth import get_current_user
from ..services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retourne les KPI pour le tenant courant."""
    return analytics_service.get_overview(db, current_user.tenant_id)


@router.get("/sales-trend")
def sales_trend(
    period: str = "month",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list:
    """Retourne la tendance des ventes (revenus) par mois ou semaine.

    Le paramètre ``period`` doit être ``month`` ou ``week``.
    """
    try:
        return analytics_service.get_sales_trend(db, current_user.tenant_id, period=period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))