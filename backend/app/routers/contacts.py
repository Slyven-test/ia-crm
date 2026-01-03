"""
Routes pour l’historique des contacts marketing.

Ce module gère l’enregistrement et la consultation des événements de contact
marketing (envoi, ouverture, clic, bounce, désinscription). Chaque
``ContactEvent`` est associé à un client, un canal, un statut et, le cas
échéant, à une campagne. L’API est multi‑tenant : les données sont filtrées
par ``tenant_id`` à partir de l’utilisateur authentifié.

Endoints :
* ``POST /contacts/`` : crée un nouvel événement de contact pour un client.
* ``GET /contacts/`` : liste les événements avec filtres facultatifs
  (client_code, status, depuis/avant).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .auth import get_current_user
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter(prefix="/contacts", tags=["contacts"])


class ContactCreate(BaseModel):
    """Schéma de création d’un événement de contact."""

    client_code: str = Field(..., description="Code client tel qu'utilisé dans la table clients")
    channel: str = Field(..., description="Canal de communication (email, sms, phone, etc.)")
    status: str = Field(..., description="Statut de l'événement (delivered, open, click, bounce, unsubscribe)")
    campaign_id: Optional[int] = Field(
        None, description="Identifiant de la campagne associée, si applicable"
    )
    contact_date: Optional[datetime] = Field(
        None,
        description="Date de l'événement (UTC). Si non fourni, la date courante sera utilisée",
    )


class ContactRead(BaseModel):
    """Schéma de lecture d’un événement de contact."""

    id: int
    client_id: int
    channel: str
    status: str
    contact_date: datetime
    campaign_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)


@router.post("/", response_model=ContactRead, status_code=201)
def create_contact_event(
    event: ContactCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContactRead:
    """Enregistre un nouvel événement de contact pour le client spécifié."""
    # Chercher le client par code et tenant
    client = (
        db.query(models.Client)
        .filter(
            models.Client.client_code == event.client_code,
            models.Client.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    contact = models.ContactEvent(
        client_id=client.id,
        contact_date=event.contact_date or datetime.utcnow(),
        channel=event.channel,
        status=event.status,
        campaign_id=event.campaign_id,
        tenant_id=current_user.tenant_id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/", response_model=List[ContactRead])
def list_contact_events(
    client_code: Optional[str] = Query(None, description="Filtrer par code client"),
    status: Optional[str] = Query(None, description="Filtrer par statut de l'événement"),
    since: Optional[datetime] = Query(
        None, description="Liste des événements survenus après cette date (UTC)"
    ),
    until: Optional[datetime] = Query(
        None, description="Liste des événements survenus avant cette date (UTC)"
    ),
    limit: int = Query(100, description="Nombre maximum de résultats à retourner"),
    offset: int = Query(0, description="Décalage dans la liste des résultats (pagination)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ContactRead]:
    """Retourne une liste d'événements de contact filtrés."""
    query = db.query(models.ContactEvent).join(models.Client).filter(
        models.ContactEvent.tenant_id == current_user.tenant_id
    )
    if client_code:
        query = query.filter(models.Client.client_code == client_code)
    if status:
        query = query.filter(models.ContactEvent.status == status)
    if since:
        query = query.filter(models.ContactEvent.contact_date >= since)
    if until:
        query = query.filter(models.ContactEvent.contact_date <= until)
    events = query.order_by(models.ContactEvent.contact_date.desc()).offset(offset).limit(limit).all()
    return events
