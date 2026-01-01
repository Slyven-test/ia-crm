"""
Routes pour les profils clients (customer 360).

Ce module fournit des endpoints pour lister les profils complets des
clients, consulter le profil détaillé d'un client et recalculer les
caractéristiques (RFM, préférences, profil aromatique) pour l'ensemble
des clients du tenant. Les données résultantes sont stockées dans la
table ``clients``.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Client
from ..routers.auth import get_current_user
from .. import schemas
from ..services import rfm_service, preference_service, aroma_service


router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/", response_model=List[schemas.ClientRead])
def list_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[schemas.ClientRead]:
    """Liste les profils complets de tous les clients du tenant courant."""
    clients = (
        db.query(Client)
        .filter(Client.tenant_id == current_user.tenant_id)
        .all()
    )
    return clients


@router.get("/{client_code}", response_model=schemas.ClientRead)
def get_profile(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientRead:
    """Retourne le profil 360 pour un client donné."""
    client = (
        db.query(Client)
        .filter(
            Client.tenant_id == current_user.tenant_id,
            Client.client_code == client_code,
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    return client


@router.post("/recalculate")
def recalculate_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Recalcule les scores RFM, préférences et profils aromatiques.

    Cette opération peut être coûteuse et doit être réservée aux
    administrateurs. Elle s'exécute séquentiellement : d'abord les
    mesures RFM, puis les préférences clients, puis les profils
    aromatiques.
    """
    tenant_id = current_user.tenant_id
    # Calculer RFM et mettre à jour les clients
    rfm_service.compute_rfm_for_tenant(db, tenant_id)
    # Calculer les préférences clients (familles, budget)
    preference_service.compute_client_preferences(db, tenant_id)
    # Calculer les profils aromatiques
    aroma_service.compute_client_aroma_profiles(db, tenant_id)
    return {"message": "Profils recalculés"}