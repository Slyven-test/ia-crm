"""
Routes d'ETL pour déclencher manuellement le pipeline et consulter son état.

Ce module expose deux endpoints :

* ``POST /etl/ingest`` : lance le pipeline ETL pour un ou plusieurs locataires.
  Le corps de la requête doit contenir une liste de ``tenants`` et un
  booléen optionnel ``isolate_schema`` (false par défaut). L'exécution
  s'effectue en tâche de fond afin de ne pas bloquer la requête. À la fin
  du traitement, un fichier d'état est mis à jour avec la date de la
  dernière exécution et le résumé des résultats.

* ``GET /etl/state`` : renvoie le contenu du fichier d'état, qui contient
  la date de la dernière exécution et les résultats détaillés. Si le
  pipeline n'a jamais été exécuté, un objet vide est retourné.

Cette implémentation se limite à invoquer la fonction ``run_etl_multi_tenant``
définie dans ``etl/main_multi.py``. Elle suppose que le dossier de données
défini par la variable d'environnement ``DATA_DIR`` existe et est
accessible en écriture afin d'y stocker le fichier ``etl_state.json``.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

try:
    # Importer directement la fonction de l'ETL si le paquet est disponible
    from etl.main_multi import run_etl_multi_tenant  # type: ignore
except ImportError as exc:
    run_etl_multi_tenant = None  # type: ignore
    import logging

    logging.getLogger(__name__).warning(
        "Impossible d'importer run_etl_multi_tenant : l'ETL ne sera pas disponible (%s)",
        exc,
    )


from .auth import get_current_user


router = APIRouter(prefix="/etl", tags=["ETL"], dependencies=[Depends(get_current_user)])


class ETLRequest(BaseModel):
    """Schéma de requête pour lancer le pipeline ETL."""

    tenants: List[str] = Field(..., description="Identifiants des locataires à traiter")
    isolate_schema: Optional[bool] = Field(
        False,
        description=(
            "Lorsque `True`, les données sont chargées dans des schémas ou des tables séparés"
        ),
    )


def _get_state_file() -> Path:
    """Retourne le chemin du fichier d'état du pipeline ETL."""
    data_dir = os.environ.get("DATA_DIR", "data")
    # Assure la création du dossier si nécessaire
    os.makedirs(data_dir, exist_ok=True)
    return Path(data_dir) / "etl_state.json"

def _etl_feature_enabled() -> bool:
    flag = os.getenv("ETL_ENABLED", "1").lower() in {"1", "true", "yes", "on"}
    return flag and run_etl_multi_tenant is not None


def _ensure_etl_available() -> None:
    if not _etl_feature_enabled():
        raise HTTPException(
            status_code=501,
            detail="ETL non disponible (feature désactivée ou dépendance manquante)",
        )


def _write_state(state: dict) -> None:
    """Écrit l'état du pipeline dans le fichier JSON dédié."""
    state_file = _get_state_file()
    with state_file.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _read_state() -> dict:
    """Lit l'état du pipeline à partir du fichier JSON. Retourne un dict vide si le fichier n'existe pas."""
    state_file = _get_state_file()
    if state_file.exists():
        try:
            with state_file.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _run_and_update_state(tenants: List[str], isolate_schema: bool) -> None:
    """Exécute le pipeline ETL pour les tenants fournis et met à jour l'état global.

    Args:
        tenants: liste des identifiants de locataires
        isolate_schema: booléen pour séparer les schémas
    """
    if not _etl_feature_enabled():
        raise RuntimeError("ETL non disponible (feature désactivée ou dépendance manquante)")
    results = run_etl_multi_tenant(tenants, isolate_schema=isolate_schema)
    new_state = {
        "last_run_at": datetime.utcnow().isoformat(),
        "results": results,
    }
    _write_state(new_state)


@router.post("/ingest", status_code=202)
async def ingest_etl(request: ETLRequest, background_tasks: BackgroundTasks) -> dict:
    """Démarre l'ingestion et le chargement des données pour les locataires spécifiés.

    La tâche est exécutée en arrière-plan afin de ne pas bloquer la requête HTTP.
    """
    _ensure_etl_available()
    # Ajouter la tâche à exécuter en arrière-plan
    background_tasks.add_task(
        _run_and_update_state, request.tenants, request.isolate_schema or False
    )
    return {
        "message": "ETL lancé",
        "tenants": request.tenants,
        "isolate_schema": request.isolate_schema or False,
    }


@router.get("/state")
def get_etl_state() -> dict:
    """Retourne l'état du dernier run ETL.

    Si aucun état n'est présent, renvoie un objet vide avec ``last_run_at`` à ``None``.
    """
    _ensure_etl_available()
    state = _read_state()
    if not state:
        return {"last_run_at": None, "results": []}
    return state


# --- compat shim (required by app.tasks) ---
def run_etl_for_tenants(*args, **kwargs):
    """Compatibility shim for Celery imports.
    If you need real multi-tenant ETL execution, implement it properly here.
    """
    import logging
    logging.getLogger(__name__).warning("run_etl_for_tenants shim called (no-op). args=%s kwargs=%s", args, kwargs)
    return {"status": "noop"}
