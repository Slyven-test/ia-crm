from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import TasteDimension, User
from ..routers.auth import get_current_user
from .. import schemas


router = APIRouter(prefix="/taste-dimensions", tags=["taste-dimensions"])


@router.get("/", response_model=list[schemas.TasteDimensionRead])
def list_dimensions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.TasteDimensionRead]:
    return (
        db.query(TasteDimension)
        .filter(TasteDimension.tenant_id == current_user.tenant_id)
        .order_by(TasteDimension.id.asc())
        .all()
    )


@router.post("/", response_model=schemas.TasteDimensionRead, status_code=201)
def create_dimension(
    dimension_in: schemas.TasteDimensionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.TasteDimensionRead:
    existing = (
        db.query(TasteDimension)
        .filter(
            TasteDimension.tenant_id == current_user.tenant_id,
            TasteDimension.key == dimension_in.key,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dimension déjà existante")
    dimension = TasteDimension(
        tenant_id=current_user.tenant_id,
        key=dimension_in.key,
        label=dimension_in.label,
        weight=dimension_in.weight,
        is_active=dimension_in.is_active,
    )
    db.add(dimension)
    db.commit()
    db.refresh(dimension)
    return dimension


@router.put("/{dimension_id}", response_model=schemas.TasteDimensionRead)
def update_dimension(
    dimension_id: int,
    dimension_update: schemas.TasteDimensionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.TasteDimensionRead:
    dimension = (
        db.query(TasteDimension)
        .filter(
            TasteDimension.tenant_id == current_user.tenant_id,
            TasteDimension.id == dimension_id,
        )
        .first()
    )
    if not dimension:
        raise HTTPException(status_code=404, detail="Dimension introuvable")
    update_data = dimension_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dimension, field, value)
    db.add(dimension)
    db.commit()
    db.refresh(dimension)
    return dimension


@router.delete("/{dimension_id}", status_code=204, response_class=Response)
def delete_dimension(
    dimension_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    dimension = (
        db.query(TasteDimension)
        .filter(
            TasteDimension.tenant_id == current_user.tenant_id,
            TasteDimension.id == dimension_id,
        )
        .first()
    )
    if not dimension:
        raise HTTPException(status_code=404, detail="Dimension introuvable")
    db.delete(dimension)
    db.commit()
    return Response(status_code=204)
