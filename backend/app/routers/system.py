"""
Routes système et administratives.

Ce module expose des points d'entrée génériques tels que la vérification de
la santé de l'application (health check). Ces endpoints ne nécessitent
pas d'authentification et permettent de superviser l'état du service.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="", tags=["system"])


@router.get("/health")
def health_check() -> dict:
    """Retourne un indicateur simple de bonne santé de l'API."""
    return {"status": "ok"}