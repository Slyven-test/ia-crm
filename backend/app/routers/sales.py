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
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Sale
from ..routers.auth import get_current_user
from .. import schemas


router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("/", response_model=List[schemas.SaleRead])
def list_sales(
    customer_code: Optional[str] = Query(None, alias="customer"),
    product_key: Optional[str] = Query(None, alias="product"),
    start_date: Optional[dt.datetime] = Query(None),
    end_date: Optional[dt.datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[schemas.SaleRead]:
    """Retourne les ventes du tenant courant, avec filtres optionnels.

    Les filtres disponibles permettent de sélectionner les ventes par code client,
    par clé produit et par intervalle de dates. Les paramètres sont optionnels.
    """
    query = db.query(Sale).filter(Sale.tenant_id == current_user.tenant_id)
    if customer_code:
        query = query.filter(Sale.client_code == customer_code)
    if product_key:
        query = query.filter(Sale.product_key == product_key)
    if start_date:
        query = query.filter(Sale.sale_date >= start_date)
    if end_date:
        query = query.filter(Sale.sale_date <= end_date)
    return query.all()


@router.get("/customer/{client_code}", response_model=List[schemas.SaleRead])
def get_sales_by_customer(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[schemas.SaleRead]:
    """Retourne l'historique des ventes pour un client donné."""
    sales = (
        db.query(Sale)
        .filter(
            Sale.tenant_id == current_user.tenant_id,
            Sale.client_code == client_code,
        )
        .order_by(Sale.sale_date.desc())
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
    sale = Sale(
        document_id=sale_in.document_id,
        product_key=sale_in.product_key,
        client_code=sale_in.client_code,
        quantity=sale_in.quantity,
        amount=sale_in.amount,
        sale_date=sale_in.sale_date,
        tenant_id=current_user.tenant_id,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
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
    update_data = sale_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sale, field, value)
    db.add(sale)
    db.commit()
    db.refresh(sale)
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
    db.delete(sale)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
