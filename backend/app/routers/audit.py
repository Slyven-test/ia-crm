"""
Routes d'API pour les audits de qualité des données.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditLog
from ..routers.auth import get_current_user
from ..services import audit_service
from .. import schemas

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/run")
def run_audit(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Exécute un audit de la qualité des données pour le tenant courant."""
    log = audit_service.run_audit(db, current_user.tenant_id)
    # Ajouter un indicateur "passed" pour indiquer si le score satisfait le seuil de gating
    # et renvoyer également la liste détaillée des messages d'audit. Le score est considéré
    # comme acceptable s'il n'y a aucune erreur et si la note est >= 80, conformément aux
    # règles d'audit. Les détails sont découpés par ligne pour faciliter l'affichage côté client.
    return {
        "message": "Audit exécuté",
        "errors": log.errors,
        "warnings": log.warnings,
        "score": log.score,
        "passed": (log.errors == 0 and log.score >= 80),
        "details": log.details.split("\n") if log.details else [],
    }


@router.get("/latest")
def latest_audit(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list:
    """Retourne les derniers audits effectués pour le tenant courant."""
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == current_user.tenant_id)
        .order_by(AuditLog.executed_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "executed_at": log.executed_at,
            "errors": log.errors,
            "warnings": log.warnings,
            "score": log.score,
            "details": log.details,
        }
        for log in logs
    ]


@router.get("/logs", response_model=list[schemas.AuditLogRead])
def get_audit_logs(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[schemas.AuditLogRead]:
    """Retourne les logs d'audit pour le tenant courant.

    Ce point d'entrée est conforme à l'API décrite dans la documentation.
    On peut spécifier un nombre maximum d'éléments via le paramètre ``limit``.
    """
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == current_user.tenant_id)
        .order_by(AuditLog.executed_at.desc())
        .limit(limit)
        .all()
    )
    return logs