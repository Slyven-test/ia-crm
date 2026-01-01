"""
Routes d'API pour la gestion des produits.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Product
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