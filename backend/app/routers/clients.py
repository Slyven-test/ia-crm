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


@router.post("/", response_model=schemas.ClientRead, status_code=201)
def create_client(
    client_in: schemas.ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientRead:
    """Crée un nouveau client pour le tenant courant.

    Si un client avec le même ``client_code`` existe déjà, renvoie une erreur.
    """
    # Vérifier l'unicité du code
    existing = (
        db.query(Client)
        .filter(
            Client.tenant_id == current_user.tenant_id,
            Client.client_code == client_in.client_code,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Client déjà existant")
    client = Client(
        client_code=client_in.client_code,
        name=client_in.name,
        email=client_in.email,
        tenant_id=current_user.tenant_id,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put("/{client_code}", response_model=schemas.ClientRead)
def update_client(
    client_code: str,
    client_update: schemas.ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientRead:
    """Met à jour les informations d'un client existant.

    Seuls certains champs peuvent être mis à jour (nom, email, preferences…).
    """
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
    # Appliquer les mises à jour
    update_data = client_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_code}")
def delete_client(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Supprime un client de la base de données.

    Cette suppression est définitive ; dans une version future, on pourrait
    appliquer un flag ``is_archived`` pour conserver l'historique.
    """
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
    db.delete(client)
    db.commit()
    return {"message": "Client supprimé"}


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