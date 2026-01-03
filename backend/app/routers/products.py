"""
Routes d'API pour la gestion des produits.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Product, Sale
from ..routers.auth import get_current_user
from .. import schemas

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=list[schemas.ProductRead])
def list_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ProductRead]:
    """Retourne les produits pour le tenant courant."""
    return (
        db.query(Product)
        .filter(Product.tenant_id == current_user.tenant_id)
        .all()
    )


@router.post("/", response_model=schemas.ProductRead, status_code=201)
def create_product(
    product_in: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ProductRead:
    """Crée un nouveau produit pour le tenant courant.

    Si un produit avec la même clé existe déjà pour ce tenant, renvoie une erreur.
    """
    existing = (
        db.query(Product)
        .filter(
            Product.tenant_id == current_user.tenant_id,
            Product.product_key == product_in.product_key,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Produit déjà existant")
    product = Product(**product_in.dict(exclude={"tenant_id"}))
    product.tenant_id = current_user.tenant_id
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_key}", response_model=schemas.ProductRead)
def update_product(
    product_key: str,
    product_update: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ProductRead:
    """Met à jour un produit existant.

    Les champs ``product_key`` et ``tenant_id`` ne sont pas modifiables.
    """
    product = (
        db.query(Product)
        .filter(
            Product.tenant_id == current_user.tenant_id,
            Product.product_key == product_key,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    update_data = product_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_key}", response_model=schemas.ProductRead)
def get_product(
    product_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ProductRead:
    """Retourne un produit par son product_key."""
    prod = (
        db.query(Product)
        .filter(Product.tenant_id == current_user.tenant_id, Product.product_key == product_key)
        .first()
    )
    if not prod:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return prod


@router.delete(
    "/{product_key}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_product(
    product_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Supprime un produit pour le tenant courant.

    Cette action est irréversible et échouera si le produit n'existe
    pas ou s'il est référencé par des ventes. Une vérification simple
    est effectuée avant la suppression.
    """
    product = (
        db.query(Product)
        .filter(Product.tenant_id == current_user.tenant_id, Product.product_key == product_key)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    # Vérifier qu'aucune vente ne référence ce produit
    sale_exists = (
        db.query(Sale.id)
        .filter(Sale.tenant_id == current_user.tenant_id, Sale.product_key == product_key)
        .first()
    )
    if sale_exists:
        raise HTTPException(
            status_code=400,
            detail="Le produit est lié à des ventes et ne peut pas être supprimé",
        )
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
