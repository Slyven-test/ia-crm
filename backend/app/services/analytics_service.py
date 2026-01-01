"""
Service d'analytique pour ia‑crm.

Ce module fournit des fonctions permettant d'obtenir des statistiques
globales (KPIs) et des analyses détaillées (distributions, tendances)
pour un tenant donné. Les calculs sont basés sur les tables ``clients``
et ``sales``. Des tendances mensuelles sont retournées sous forme de
tableaux prêts à être affichés sur un tableau de bord.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Dict, List, Any

from sqlalchemy.orm import Session

from ..models import Client, Sale, Recommendation


def get_overview(db: Session, tenant_id: int) -> Dict[str, Any]:
    """Retourne des indicateurs clés pour un tenant.

    Les métriques incluent :
    * ``total_clients`` : nombre total de clients
    * ``active_clients`` : clients ayant acheté au moins une fois dans les 90 derniers jours
    * ``churn_rate`` : proportion de clients inactifs depuis plus de 180 jours
    * ``total_revenue`` : somme des montants de ventes
    * ``average_order_value`` : moyenne des paniers (sur les commandes distinctes)
    * ``recommendation_count`` : nombre de recommandations générées
    """
    now = dt.datetime.utcnow()
    clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    total_clients = len(clients)
    # Calculer l'inactivité et l'activité
    active_clients = 0
    inactive_clients = 0
    for c in clients:
        if c.last_purchase_date:
            days_since = (now - c.last_purchase_date).days
            if days_since <= 90:
                active_clients += 1
            if days_since > 180:
                inactive_clients += 1
    churn_rate = inactive_clients / total_clients if total_clients > 0 else 0.0
    # Calculer revenu total et AOV
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    total_revenue = sum(s.amount or 0.0 for s in sales)
    # Panier moyen par commande
    # On considère que chaque document_id correspond à une commande
    orders = defaultdict(float)
    for s in sales:
        orders[s.document_id] += s.amount or 0.0
    aov = (sum(orders.values()) / len(orders)) if orders else 0.0
    # Recommandations
    reco_count = db.query(Recommendation).filter(Recommendation.tenant_id == tenant_id).count()
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "churn_rate": churn_rate,
        "total_revenue": total_revenue,
        "average_order_value": aov,
        "recommendation_count": reco_count,
    }


def get_segment_distribution(db: Session, tenant_id: int) -> Dict[str, int]:
    """Retourne la distribution des segments RFM pour un tenant.

    Renvoie un dict ``segment -> count``.
    """
    result: Dict[str, int] = defaultdict(int)
    rows = (
        db.query(Client.rfm_segment)
        .filter(Client.tenant_id == tenant_id)
        .all()
    )
    for (segment,) in rows:
        if segment:
            result[segment] += 1
        else:
            result["Unknown"] += 1
    return dict(result)


def get_sales_trend(db: Session, tenant_id: int, period: str = "month") -> List[Dict[str, Any]]:
    """Retourne une série temporelle des ventes pour un tenant.

    Args:
        db: session SQLAlchemy
        tenant_id: identifiant du locataire
        period: "month" ou "week" pour regrouper les ventes par mois ou semaine

    Returns:
        Une liste de dicts avec ``period`` (YYYY‑MM ou YYYY‑WW) et ``revenue``.
    """
    if period not in {"month", "week"}:
        raise ValueError("period must be 'month' or 'week'")
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    trend: Dict[str, float] = defaultdict(float)
    for sale in sales:
        if not sale.sale_date:
            continue
        date = sale.sale_date
        if period == "month":
            key = f"{date.year}-{date.month:02d}"
        else:
            # ISO week number
            key = f"{date.isocalendar().year}-{date.isocalendar().week:02d}"
        trend[key] += sale.amount or 0.0
    # Trier par période
    sorted_keys = sorted(trend.keys())
    return [{"period": k, "revenue": trend[k]} for k in sorted_keys]