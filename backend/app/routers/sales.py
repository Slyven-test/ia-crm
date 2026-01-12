"""
Routes pour la gestion des ventes (sales).

Cette API permet de consulter l'historique des ventes, de filtrer les ventes
par client, produit ou plage de dates et d'enregistrer de nouvelles ventes.
Les ventes servent de source pour le calcul des scores RFM et des moteurs
de recommandations.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Client, Product, Sale, User
from ..routers.auth import get_current_user
from ..services.client_metrics import recompute_client_metrics
from .. import schemas


router = APIRouter(prefix="/sales", tags=["sales"])


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


def _get_accessible_client(db: Session, current_user: User, client_code: str) -> Client | None:
    return (
        _accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )


def _get_accessible_product(db: Session, current_user: User, product_key: str) -> Product | None:
    return (
        _accessible_products_query(db, current_user)
        .filter(Product.product_key == product_key)
        .first()
    )


@router.get("/", response_model=List[schemas.SaleRead])
def list_sales(
    client_code: Optional[str] = Query(None),
    product_key: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[schemas.SaleRead]:
    """Retourne les ventes du tenant courant, avec filtres optionnels.

    Les filtres disponibles permettent de sélectionner les ventes par code client
    ou par clé produit. Les paramètres sont optionnels.
    """
    query = db.query(Sale).filter(Sale.tenant_id == current_user.tenant_id)
    if not current_user.is_superuser:
        query = query.join(
            Client,
            and_(
                Client.tenant_id == Sale.tenant_id,
                Client.client_code == Sale.client_code,
            ),
        ).filter(
            or_(
                Client.owner_user_id == current_user.id,
                Client.visibility == "tenant",
                Client.owner_user_id.is_(None),
            )
        )
    if client_code:
        query = query.filter(Sale.client_code == client_code)
    if product_key:
        query = query.filter(Sale.product_key == product_key)
    return (
        query.order_by(Sale.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/customer/{client_code}", response_model=List[schemas.SaleRead])
def get_sales_by_customer(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[schemas.SaleRead]:
    """Retourne l'historique des ventes pour un client donné."""
    if not _get_accessible_client(db, current_user, client_code):
        raise HTTPException(status_code=404, detail="Client introuvable")
    sales = (
        db.query(Sale)
        .filter(
            Sale.tenant_id == current_user.tenant_id,
            Sale.client_code == client_code,
        )
        .order_by(Sale.sale_date.desc(), Sale.id.desc())
        .all()
    )
    return sales


@router.post("/", response_model=schemas.SaleRead, status_code=201)
def create_sale(
    sale_in: schemas.SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.SaleRead:
    """Enregistre une nouvelle vente dans la base.

    Le ``tenant_id`` est automatiquement renseigné à partir de l'utilisateur
    courant. Si le corps de la requête fournit un tenant_id différent,
    celui-ci est ignoré.
    """
    client = _get_accessible_client(db, current_user, sale_in.client_code)
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")
    product = _get_accessible_product(db, current_user, sale_in.product_key)
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    sale = Sale(
        document_id=sale_in.document_id,
        product_key=sale_in.product_key,
        client_code=sale_in.client_code,
        quantity=sale_in.quantity,
        amount=sale_in.amount,
        sale_date=sale_in.sale_date,
        tenant_id=current_user.tenant_id,
        created_by_user_id=current_user.id,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    recompute_client_metrics(
        db,
        tenant_id=current_user.tenant_id,
        client_code=sale.client_code,
    )
    return sale


@router.put("/{sale_id}", response_model=schemas.SaleRead)
def update_sale(
    sale_id: int,
    sale_update: schemas.SaleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.SaleRead:
    """Met à jour une vente existante.

    Seuls les champs spécifiés dans le corps de la requête seront
    modifiés. Le ``tenant_id`` et l'identifiant de la vente ne sont
    jamais changés.
    """
    sale = (
        db.query(Sale)
        .filter(Sale.tenant_id == current_user.tenant_id, Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Vente introuvable")
    if not _get_accessible_client(db, current_user, sale.client_code):
        raise HTTPException(status_code=404, detail="Vente introuvable")
    update_data = sale_update.model_dump(exclude_unset=True)
    old_client_code = sale.client_code
    if "client_code" in update_data and update_data["client_code"]:
        if not _get_accessible_client(db, current_user, update_data["client_code"]):
            raise HTTPException(status_code=404, detail="Client introuvable")
    if "product_key" in update_data and update_data["product_key"]:
        if not _get_accessible_product(db, current_user, update_data["product_key"]):
            raise HTTPException(status_code=404, detail="Produit introuvable")
    for field, value in update_data.items():
        setattr(sale, field, value)
    db.add(sale)
    db.commit()
    db.refresh(sale)
    if old_client_code != sale.client_code:
        recompute_client_metrics(
            db,
            tenant_id=current_user.tenant_id,
            client_code=old_client_code,
        )
    recompute_client_metrics(
        db,
        tenant_id=current_user.tenant_id,
        client_code=sale.client_code,
    )
    return sale


@router.delete(
    "/{sale_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Supprime une vente pour le tenant courant.

    La suppression est irréversible. Si la vente n'existe pas, une
    erreur 404 est renvoyée.
    """
    sale = (
        db.query(Sale)
        .filter(Sale.tenant_id == current_user.tenant_id, Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Vente introuvable")
    if not _get_accessible_client(db, current_user, sale.client_code):
        raise HTTPException(status_code=404, detail="Vente introuvable")
    client_code = sale.client_code
    db.delete(sale)
    db.commit()
    recompute_client_metrics(
        db,
        tenant_id=current_user.tenant_id,
        client_code=client_code,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
