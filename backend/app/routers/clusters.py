"""Routes d'API pour le calcul et la consultation des clusters de clients.

Ces endpoints permettent de lancer un recalcul des clusters pour un
locataire (en utilisant l'algorithme K‑means via le service
``cluster_service``) et de récupérer la distribution courante des
clients par cluster. Chaque cluster est identifié par une étiquette
``cX`` où ``X`` est l'indice du cluster.
"""

from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Client
from ..routers.auth import get_current_user
from ..services.cluster_service import compute_clusters_for_tenant


router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.post("/recompute", response_model=Dict[str, int])
def recompute_clusters(
    n_clusters: int = 4,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, int]:
    """Recalcule les clusters pour le locataire courant.

    :param n_clusters: nombre de clusters à générer. Doit être >= 2.
    :returns: un dictionnaire indiquant combien de clients appartiennent
      à chaque cluster.
    """
    if n_clusters < 2:
        raise HTTPException(status_code=400, detail="n_clusters must be >= 2")
    counts = compute_clusters_for_tenant(db, current_user.tenant_id, n_clusters=n_clusters)
    return counts


@router.get("/", response_model=Dict[str, int])
def get_cluster_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, int]:
    """Retourne la distribution des clients par cluster pour le locataire courant.

    :returns: un dictionnaire ``{cluster_label: nombre_de_clients}``. Les
      clients n'ayant pas encore été clusterisés ne sont pas inclus.
    """
    query = (
        db.query(Client.cluster, func.count(Client.id))
        .filter(Client.tenant_id == current_user.tenant_id)
        .filter(Client.cluster.isnot(None))
        .group_by(Client.cluster)
        .all()
    )
    return {str(label): count for (label, count) in query}