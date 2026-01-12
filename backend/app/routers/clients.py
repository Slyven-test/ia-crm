"""
Routes d'API pour la gestion des clients.

Permet de consulter la liste des clients et les détails d'un client.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import Client, ClientNote, Product, Recommendation, Sale, TasteDimension, User
from ..routers.auth import get_current_user
from ..services.client_metrics import recompute_client_metrics
from ..services.recommendations_v2 import compute_recommendations, persist_recommendations
from ..services.taste_scoring import client_vector, compute_weighted_similarity, product_vector
from .. import schemas

router = APIRouter(prefix="/clients", tags=["clients"])


def _accessible_clients_query(db: Session, current_user: User):
    query = db.query(Client).filter(Client.tenant_id == current_user.tenant_id)
    if current_user.is_superuser:
        return query
    return query.filter(
        or_(
            Client.owner_user_id == current_user.id,
            Client.visibility == "tenant",
            Client.owner_user_id.is_(None),
        )
    )


def _accessible_products_query(db: Session, current_user: User):
    query = db.query(Product).filter(Product.tenant_id == current_user.tenant_id)
    if current_user.is_superuser:
        return query
    return query.filter(
        or_(
            Product.owner_user_id == current_user.id,
            Product.visibility == "tenant",
            Product.owner_user_id.is_(None),
        )
    )


@router.get("/", response_model=list[schemas.ClientRead])
def list_clients(
    q: str | None = Query(None, description="Recherche texte (code, nom, email)"),
    limit: int = Query(100, ge=1, le=500, description="Nombre maximum de clients à retourner"),
    offset: int = Query(0, ge=0, description="Décalage pour la pagination"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ClientRead]:
    """Retourne tous les clients du tenant courant."""
    query = db.query(Client).filter(Client.tenant_id == current_user.tenant_id)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Client.client_code.ilike(search),
                Client.name.ilike(search),
                Client.email.ilike(search),
            )
        )
    return (
        query.order_by(Client.id.asc())
        .offset(offset)
        .limit(limit)
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Client déjà existant")
    client = Client(
        client_code=client_in.client_code,
        name=client_in.name,
        email=client_in.email,
        phone=client_in.phone,
        address_line1=client_in.address_line1,
        address_line2=client_in.address_line2,
        postal_code=client_in.postal_code,
        city=client_in.city,
        country=client_in.country,
        tags=client_in.tags,
        owner_user_id=current_user.id,
        visibility=visibility,
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
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    # Appliquer les mises à jour
    update_data = client_update.model_dump(exclude_unset=True)
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
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
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
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    return client


@router.get("/{client_code}/profile", response_model=schemas.ClientProfile)
def get_client_profile(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientProfile:
    """Retourne le profil enrichi d'un client avec ses dernières ventes."""
    client = (
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    client = recompute_client_metrics(
        db,
        tenant_id=current_user.tenant_id,
        client_code=client_code,
    )
    latest_sales = (
        db.query(Sale)
        .filter(Sale.tenant_id == current_user.tenant_id, Sale.client_code == client_code)
        .order_by(Sale.sale_date.desc(), Sale.id.desc())
        .limit(20)
        .all()
    )
    notes = (
        db.query(ClientNote)
        .filter(
            ClientNote.tenant_id == current_user.tenant_id,
            ClientNote.client_code == client_code,
        )
        .order_by(ClientNote.id.asc())
        .limit(50)
        .all()
    )
    kpis = schemas.ClientKPIs(
        last_purchase_date=client.last_purchase_date,
        total_spent=client.total_spent,
        total_orders=client.total_orders,
        average_order_value=client.average_order_value,
        recency=client.recency,
        frequency=client.frequency,
        monetary=client.monetary,
        rfm_score=client.rfm_score,
        rfm_segment=client.rfm_segment,
    )
    return schemas.ClientProfile(
        client=client,
        latest_sales=latest_sales,
        kpis=kpis,
        notes=notes,
    )


@router.get("/{client_code}/notes", response_model=list[schemas.ClientNoteRead])
def list_client_notes(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ClientNoteRead]:
    client = (
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    return (
        db.query(ClientNote)
        .filter(
            ClientNote.tenant_id == current_user.tenant_id,
            ClientNote.client_code == client_code,
        )
        .order_by(ClientNote.id.asc())
        .all()
    )


@router.post("/{client_code}/notes", response_model=schemas.ClientNoteRead, status_code=201)
def create_client_note(
    client_code: str,
    note_in: schemas.ClientNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientNoteRead:
    client = (
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    note = ClientNote(
        tenant_id=current_user.tenant_id,
        client_code=client_code,
        title=note_in.title,
        body=note_in.body,
        created_by_user_id=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.put("/{client_code}/notes/{note_id}", response_model=schemas.ClientNoteRead)
def update_client_note(
    client_code: str,
    note_id: int,
    note_update: schemas.ClientNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ClientNoteRead:
    client = (
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    return client
