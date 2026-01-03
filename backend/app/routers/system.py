"""
Routes système et administratives.

Ce module expose des points d'entrée génériques tels que la vérification de
la santé de l'application (health check). Ces endpoints ne nécessitent
pas d'authentification et permettent de superviser l'état du service.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..database import engine

router = APIRouter(prefix="", tags=["system"])


@router.get("/health")
def health_check() -> dict:
    """Retourne un indicateur simple de bonne santé de l'API."""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
            db_ok = True
    except SQLAlchemyError:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
