"""
Routes d'API pour la gestion des alias de produits.

Ces routes permettent de consulter, ajouter, modifier et supprimer des
correspondances entre les labels bruts (normalisés) et les clés
``product_key``. Elles sont utilisées lors de l'ingestion pour
remplacer les libellés incohérents par des identifiants produits.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import unicodedata
import re
from difflib import get_close_matches

from ..database import get_db
from ..models import User, Product, ProductAlias
from ..routers.auth import get_current_user
from .. import schemas

router = APIRouter(prefix="/aliases", tags=["aliases"])


def normalize_label(label: str) -> str:
    label = label.strip().lower()
    label = "".join(ch for ch in unicodedata.normalize("NFD", label) if unicodedata.category(ch) != "Mn")
    label = re.sub(r"[^a-z0-9\s]", " ", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label


@router.get("/", response_model=list[schemas.ProductAliasRead])
def list_aliases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ProductAliasRead]:
    """Retourne la liste des alias pour le locataire courant."""
    aliases = (
        db.query(ProductAlias)
        .filter(ProductAlias.tenant_id == current_user.tenant_id)
        .order_by(ProductAlias.label_norm)
        .all()
    )
    return aliases


@router.post("/", response_model=schemas.ProductAliasRead, status_code=status.HTTP_201_CREATED)
def create_alias(
    alias_in: schemas.ProductAliasCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ProductAliasRead:
    """Crée un nouvel alias de produit.

    Vérifie que la clé de produit existe et que l'alias n'est pas déjà
    utilisé dans ce tenant. Le champ ``label_norm`` doit être normalisé
    (minuscules, accents supprimés) avant l'appel.
    """
    # Vérifier l'existence du produit
    product = (
        db.query(Product)
        .filter(Product.tenant_id == current_user.tenant_id, Product.product_key == alias_in.product_key)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    # Vérifier la duplicité de l'alias
    exists = (
        db.query(ProductAlias)
        .filter(
            ProductAlias.tenant_id == current_user.tenant_id,
            ProductAlias.label_norm == alias_in.label_norm,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Alias already exists")
    alias = ProductAlias(
        label_raw=alias_in.label_raw or alias_in.label_norm,
        label_norm=normalize_label(alias_in.label_norm),
        product_key=alias_in.product_key,
        confidence=alias_in.confidence or 1.0,
        source=alias_in.source or "manual",
        tenant_id=current_user.tenant_id,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


@router.put("/{alias_id}", response_model=schemas.ProductAliasRead)
def update_alias(
    alias_id: int,
    alias_update: schemas.ProductAliasUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ProductAliasRead:
    """Met à jour un alias de produit.

    Permet de modifier le label ou la clé produit. Vérifie que le
    nouveau produit existe. Les champs non fournis ne sont pas modifiés.
    """
    alias = (
        db.query(ProductAlias)
        .filter(ProductAlias.id == alias_id, ProductAlias.tenant_id == current_user.tenant_id)
        .first()
    )
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
    if alias_update.label_norm:
        # Vérifier qu'aucun autre alias n'a cette clé
        other = (
            db.query(ProductAlias)
            .filter(
                ProductAlias.tenant_id == current_user.tenant_id,
                ProductAlias.label_norm == normalize_label(alias_update.label_norm),
                ProductAlias.id != alias_id,
            )
            .first()
        )
        if other:
            raise HTTPException(status_code=400, detail="Another alias with this label already exists")
        alias.label_norm = normalize_label(alias_update.label_norm)
        alias.label_raw = alias_update.label_raw or alias_update.label_norm
    if alias_update.product_key:
        prod = (
            db.query(Product)
            .filter(Product.tenant_id == current_user.tenant_id, Product.product_key == alias_update.product_key)
            .first()
        )
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")
        alias.product_key = alias_update.product_key
    if alias_update.confidence is not None:
        alias.confidence = alias_update.confidence
    if alias_update.source is not None:
        alias.source = alias_update.source
    db.commit()
    db.refresh(alias)
    return alias


@router.delete("/{alias_id}")
def delete_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Supprime un alias de produit."""
    alias = (
        db.query(ProductAlias)
        .filter(ProductAlias.id == alias_id, ProductAlias.tenant_id == current_user.tenant_id)
        .first()
    )
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
    db.delete(alias)
    db.commit()
    return {"message": "Alias deleted"}


@router.post("/suggest", response_model=list[schemas.ProductAliasBase])
def suggest_aliases(
    label: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.ProductAliasBase]:
    """Suggest mappings for a raw label based on existing products."""
    label_norm = normalize_label(label)
    products = (
        db.query(Product)
        .filter(Product.tenant_id == current_user.tenant_id)
        .all()
    )
    product_keys = {p.product_key: normalize_label(p.name) for p in products}
    matches = get_close_matches(label_norm, product_keys.values(), n=5, cutoff=0.5)
    suggestions: list[schemas.ProductAliasBase] = []
    for match in matches:
        for key, norm in product_keys.items():
            if norm == match:
                suggestions.append(
                    schemas.ProductAliasBase(
                        label_raw=label,
                        label_norm=label_norm,
                        product_key=key,
                        confidence=0.8,
                        source="suggest",
                        tenant_id=current_user.tenant_id,
                    )
                )
    return suggestions
