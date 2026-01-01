"""
Routes d'API pour la gestion des clients.

Permet de consulter la liste des clients et les détails d'un client.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Client
from ..routers.auth import get_current_user
from .. import schemas

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/", response_model=list[schemas.ClientRead])
def list_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ClientRead]:
    """Retourne tous les clients du tenant courant."""
    return (
        db.query(Client)
        .filter(Client.tenant_id == current_user.tenant_id)
        .all()
    )


@router.get("/{client_code}", response_model=schemas.ClientRead)
def get_client(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientRead:
    """Retourne les informations détaillées pour un client."""
    client = (
        db.query(Client)
        .filter(Client.tenant_id == current_user.tenant_id, Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    return client