"""
Routes système et administratives.

Ce module expose des points d'entrée génériques tels que la vérification de
la santé de l'application (health check). Ces endpoints ne nécessitent
pas d'authentification et permettent de superviser l'état du service.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..database import engine

router = APIRouter(prefix="", tags=["system"])


@router.get("/health")
def health_check() -> dict:
    """Retourne un indicateur simple de bonne santé de l'API."""
    db_status = "error"
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
            db_status = "ok"
    except SQLAlchemyError as exc:
        logging.getLogger(__name__).warning("DB healthcheck failed: %s", exc)
        db_status = "error"
    status = "ok" if db_status == "ok" else "degraded"
    return {"status": status, "db": db_status}
