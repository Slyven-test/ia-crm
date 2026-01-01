"""
Service de calcul RFM pour ia‑crm.

Ce module expose des fonctions permettant de calculer les composantes
Recency, Frequency et Monetary pour chaque client d’un tenant à partir
de la table des ventes. Les scores RFM sont calculés selon des
quintiles (1 à 5) et une segmentation simple est appliquée.

Les résultats sont enregistrés dans la table ``clients`` en mettant à
jour les champs ``recency``, ``frequency``, ``monetary``, ``rfm_score``
et ``rfm_segment``. Des champs auxiliaires tels que
``last_purchase_date``, ``total_spent``, ``total_orders`` et
``average_order_value`` sont également renseignés.
"""

from __future__ import annotations

import datetime as dt
from typing import Dict, List, Tuple

import numpy as np
from sqlalchemy.orm import Session

from ..models import Client, Sale


def _compute_basic_metrics(db: Session, tenant_id: int) -> Dict[str, Dict[str, float]]:
    """Retourne les mesures de base pour chaque client.

    Pour chaque client (identifié par son ``client_code``), calcule :

    * ``last_purchase_date`` : date de la dernière vente
    * ``total_spent`` : somme des montants de ses ventes
    * ``total_orders`` : nombre de documents distincts
    * ``average_order_value`` : panier moyen (``total_spent`` / ``total_orders``)

    Args:
        db: session SQLAlchemy.
        tenant_id: identifiant du locataire.

    Returns:
        Un dictionnaire `client_code -> metrics dict`.
    """
    metrics: Dict[str, Dict[str, float]] = {}
    # Récupérer toutes les ventes pour le tenant
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    if not sales:
        return metrics
    # Grouper par client_code
    for sale in sales:
        code = sale.client_code
        if code not in metrics:
            metrics[code] = {
                "last_purchase_date": sale.sale_date,
                "total_spent": 0.0,
                "documents": set(),
            }
        # Mettre à jour la date de dernière vente
        if sale.sale_date and (
            metrics[code]["last_purchase_date"] is None
            or sale.sale_date > metrics[code]["last_purchase_date"]
        ):
            metrics[code]["last_purchase_date"] = sale.sale_date
        # Calculer le montant (fallback sur amount ou quantity)
        amount = 0.0
        if sale.amount is not None:
            amount = float(sale.amount)
        elif sale.quantity is not None:
            # S'il n'y a pas de montant, utiliser la quantité comme proxy
            amount = float(sale.quantity)
        metrics[code]["total_spent"] += amount
        # Ajouter l'ID du document
        if sale.document_id:
            metrics[code]["documents"].add(sale.document_id)
    # Post‑traitement pour total_orders et AOV
    for code, data in metrics.items():
        total_orders = len(data["documents"])
        data["total_orders"] = total_orders
        data["average_order_value"] = data["total_spent"] / total_orders if total_orders > 0 else 0.0
    return metrics


def _quantile_scores(values: List[float]) -> Dict[str, int]:
    """Calcule des scores 1–5 sur la base de quintiles.

    Le plus haut quintile reçoit un score de 5, le plus bas un score de 1.

    Args:
        values: liste de valeurs numériques.

    Returns:
        Un dict `id -> score` où la clé est l'identifiant tel que fourni
        dans l'ordre original. Les valeurs `None` sont ignorées et
        reçoivent un score de 0.
    """
    if not values:
        return {}
    arr = np.array([v for v in values if v is not None])
    if arr.size == 0:
        return {}
    # Calcul des seuils de quintile
    quintiles = np.quantile(arr, [0.2, 0.4, 0.6, 0.8])
    scores = []
    for v in values:
        if v is None:
            scores.append(0)
            continue
        # Pour recency, une valeur plus faible est meilleure (plus récent)
        # Nous assignons donc les scores inversément : plus petit -> 5.
        if quintiles is not None:
            if v <= quintiles[0]:
                s = 5
            elif v <= quintiles[1]:
                s = 4
            elif v <= quintiles[2]:
                s = 3
            elif v <= quintiles[3]:
                s = 2
            else:
                s = 1
        else:
            s = 3
        scores.append(int(s))
    return scores


def _map_segment(r_score: int, f_score: int, m_score: int) -> str:
    """Retourne un segment basé sur les scores R, F et M.

    Les règles de segmentation sont inspirées des meilleures pratiques RFM.
    """
    if r_score >= 4 and f_score >= 4 and m_score >= 4:
        return "Champions"
    if f_score >= 4 and r_score >= 3:
        return "Loyal Customers"
    if m_score >= 4 and f_score >= 3:
        return "Big Spenders"
    if r_score >= 4 and f_score <= 2:
        return "Recent Customers"
    if r_score >= 3 and f_score >= 2 and m_score >= 2:
        return "Promising"
    if r_score <= 2 and f_score <= 2:
        return "At Risk"
    return "Others"


def compute_rfm_for_tenant(db: Session, tenant_id: int) -> None:
    """Calcule et met à jour les scores RFM de tous les clients d’un tenant.

    Cette fonction effectue les étapes suivantes :

    1. Calcul des indicateurs de base (dates de dernière commande,
       montants, nombre de commandes, panier moyen) via
       ``_compute_basic_metrics``.
    2. Calcul de ``recency`` en jours (écart entre la date de référence
       et la dernière commande). On utilise la date la plus récente de
       toutes les ventes comme référence.
    3. Application de la fonction ``_quantile_scores`` aux listes de
       recency, frequency et monetary pour obtenir des scores 1–5.
    4. Attribution d’un segment via ``_map_segment``.
    5. Mise à jour de la table ``clients`` avec toutes ces valeurs.
    """
    metrics = _compute_basic_metrics(db, tenant_id)
    if not metrics:
        return
    # Déterminer la date de référence (vente la plus récente)
    all_dates = [m["last_purchase_date"] for m in metrics.values() if m["last_purchase_date"]]
    if not all_dates:
        return
    reference_date = max(all_dates)
    # Construire les listes de mesures pour scoring
    recency_list: List[float] = []
    frequency_list: List[float] = []
    monetary_list: List[float] = []
    client_codes: List[str] = []
    for code, data in metrics.items():
        # Recency : nombre de jours depuis la dernière commande
        if data["last_purchase_date"]:
            days = (reference_date - data["last_purchase_date"]).days
        else:
            days = None
        recency_list.append(days)
        frequency_list.append(float(data["total_orders"]))
        monetary_list.append(float(data["total_spent"]))
        client_codes.append(code)
    # Calcul des scores (inverse de recency pour R)
    # Pour la récence nous voulons que plus le nombre de jours est faible,
    # plus le score est élevé. La fonction _quantile_scores retourne déjà
    # des scores inverses.
    r_scores = _quantile_scores(recency_list)
    # Pour la fréquence et le montant, plus la valeur est grande, plus le score est élevé.
    # Nous pouvons simplement appliquer _quantile_scores à la valeur négative afin que
    #  les plus grandes valeurs obtiennent les plus grands scores.
    # Toutefois, nous devons recalculer les quintiles en inversant l'ordre.
    # Nous procédons en triant l'ordre puis en mappant.
    # Inverser les listes pour frequency et monetary
    # Convertir en rangs et ensuite appliquer la règle.
    def score_positive(values: List[float]) -> List[int]:
        arr = np.array([v for v in values if v is not None])
        if arr.size == 0:
            return [0 for _ in values]
        quintiles = np.quantile(arr, [0.2, 0.4, 0.6, 0.8])
        scores: List[int] = []
        for v in values:
            if v is None:
                scores.append(0)
                continue
            if v <= quintiles[0]:
                s = 1
            elif v <= quintiles[1]:
                s = 2
            elif v <= quintiles[2]:
                s = 3
            elif v <= quintiles[3]:
                s = 4
            else:
                s = 5
            scores.append(int(s))
        return scores

    f_scores = score_positive(frequency_list)
    m_scores = score_positive(monetary_list)
    # Mettre à jour chaque client
    for idx, code in enumerate(client_codes):
        client = (
            db.query(Client)
            .filter(Client.tenant_id == tenant_id, Client.client_code == code)
            .first()
        )
        if client:
            data = metrics[code]
            client.last_purchase_date = data.get("last_purchase_date")
            client.total_spent = data.get("total_spent", 0.0)
            client.total_orders = data.get("total_orders", 0)
            client.average_order_value = data.get("average_order_value", 0.0)
            client.recency = recency_list[idx] if recency_list[idx] is not None else 0.0
            client.frequency = frequency_list[idx]
            client.monetary = monetary_list[idx]
            r_score = r_scores[idx] if idx < len(r_scores) else 0
            f_score = f_scores[idx] if idx < len(f_scores) else 0
            m_score = m_scores[idx] if idx < len(m_scores) else 0
            # Score composite (somme) pour rfm_score
            client.rfm_score = r_score + f_score + m_score
            client.rfm_segment = _map_segment(r_score, f_score, m_score)
            # Sauvegarder
            db.add(client)
    db.commit()