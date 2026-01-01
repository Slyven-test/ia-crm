"""
Routes pour la gestion des locataires (tenants).

Ces routes permettent de créer de nouveaux tenants et de lister les tenants
existants. Chaque tenant représente une entreprise séparée dans la
plateforme multi‑tenant.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/", response_model=list[schemas.TenantRead])
def list_tenants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)) -> list[schemas.TenantRead]:
    """Retourne la liste des tenants enregistrés."""
    tenants = db.query(models.Tenant).offset(skip).limit(limit).all()
    return tenants


@router.post("/", response_model=schemas.TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(tenant_in: schemas.TenantCreate, db: Session = Depends(get_db)) -> schemas.TenantRead:
    """Crée un nouveau tenant."""
    if db.query(models.Tenant).filter(models.Tenant.name == tenant_in.name).first():
        raise HTTPException(status_code=400, detail="Tenant déjà existant")
    tenant = models.Tenant(name=tenant_in.name, domain=tenant_in.domain)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant