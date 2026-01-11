from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services import brevo_service


class SyncContactsResponse(BaseModel):
    synced: int
    dry_run: bool
    batch_id: str
    preview: list[dict]


class SendBatchPayload(BaseModel):
    run_id: str
    template_id: str
    batch_size: int = Field(..., ge=200, le=300)
    dry_run: bool | None = None
    preview_only: bool = False


router = APIRouter(prefix="/brevo", tags=["brevo"])

def _brevo_feature_enabled() -> bool:
    flag = os.getenv("BREVO_ENABLED", "1").lower() in {"1", "true", "yes", "on"}
    return flag and bool(os.getenv("BREVO_API_KEY"))


def _ensure_brevo_available() -> None:
    if not _brevo_feature_enabled():
        raise HTTPException(status_code=501, detail="Brevo non configuré")


@router.post("/sync_contacts", response_model=SyncContactsResponse)
def sync_contacts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> SyncContactsResponse:
    _ensure_brevo_available()
    result = brevo_service.sync_contacts(db, tenant_id=current_user.tenant_id)
    return SyncContactsResponse(**result)


@router.post("/send_batch")
def send_batch(
    payload: SendBatchPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    _ensure_brevo_available()
    try:
        result = brevo_service.send_batch(
            db,
            tenant_id=current_user.tenant_id,
            run_id=payload.run_id,
            template_id=payload.template_id,
            batch_size=payload.batch_size,
            force_dry_run=payload.dry_run,
            preview_only=payload.preview_only,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/logs", response_model=list[schemas.BrevoLogRead])
def list_logs(
    run_id: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.BrevoLogRead]:
    _ensure_brevo_available()
    query = db.query(models.BrevoLog).filter(models.BrevoLog.tenant_id == current_user.tenant_id)
    if run_id:
        query = query.filter(models.BrevoLog.run_id == run_id)
    logs = query.order_by(models.BrevoLog.created_at.desc()).limit(limit).all()
    return logs
