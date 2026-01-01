"""
Moteur de recommandations avancé pour ia‑crm.

Ce moteur implémente plusieurs scénarios de recommandation inspirés de la
roadmap : WINBACK, REBUY, CROSSSELL, UPSELL et NURTURE. Il s’appuie sur
les informations calculées par les services RFM et préférences pour
déterminer le meilleur scénario pour chaque client et sélectionner des
candidats pertinents. Un score composite est calculé pour chaque
produit candidat sur la base de la popularité, de l’adéquation au prix,
de la correspondance de la catégorie et du score RFM du client.

Les recommandations existantes pour le tenant sont supprimées avant de
générer de nouvelles suggestions.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Dict, Set

from sqlalchemy.orm import Session

from ..models import Sale, Product, Recommendation, Client


def _select_scenario(client: Client) -> str:
    """Détermine le scénario de recommandation adapté à un client.

    Heuristiques :
    * Si le client n’a jamais acheté (rfm_score == 0) → ``nurture``.
    * Si aucune commande depuis plus de 180 jours → ``winback``.
    * Si dernière commande il y a plus de 30 jours → ``rebuy``.
    * Sinon, si le panier moyen du client est inférieur à la moyenne
      générale des produits → ``upsell`` pour proposer des produits plus
      chers. Dans le cas contraire, ``cross_sell``.
    """
    now = dt.datetime.utcnow()
    if client.rfm_score is None or client.rfm_score == 0:
        return "nurture"
    if client.last_purchase_date:
        days = (now - client.last_purchase_date).days
        if days > 180:
            return "winback"
        if days > 30:
            return "rebuy"
    # Utiliser la bande de budget pour distinguer upsell vs cross-sell
    if client.budget_band == "Low":
        return "upsell"
    return "cross_sell"


def _candidate_products(
    client: Client,
    bought: Set[str],
    all_products: List[Product],
    scenario: str,
    max_price: float,
) -> List[Product]:
    """Génère une liste de produits candidats pour un scénario donné."""
    candidates: List[Product] = []
    pref_fams = set((client.preferred_families or "").split(",")) if client.preferred_families else set()
    aov = client.average_order_value or 0.0
    for prod in all_products:
        if prod.product_key in bought:
            continue
        # Filtrage selon le scénario
        if scenario == "rebuy":
            # Même famille que préférée
            if prod.family and prod.family in pref_fams:
                candidates.append(prod)
        elif scenario == "cross_sell":
            # Familles différentes
            if prod.family and (not pref_fams or prod.family not in pref_fams):
                candidates.append(prod)
        elif scenario == "upsell":
            # Même famille et prix supérieur au AOV
            if prod.family and prod.family in pref_fams and prod.price and prod.price > aov:
                candidates.append(prod)
        elif scenario == "winback":
            # Produits les plus populaires (pas de filtrage de famille)
            candidates.append(prod)
        elif scenario == "nurture":
            # Proposer des produits populaires (même logique que winback)
            candidates.append(prod)
    # Si aucune correspondance (cas de rebuy par exemple), on élargit à tous les produits non achetés
    if not candidates:
        candidates = [p for p in all_products if p.product_key not in bought]
    return candidates


def _compute_score(
    prod: Product,
    client: Client,
    max_price: float,
    max_rfm_score: float,
) -> float:
    """Calcule un score composite pour un produit et un client.

    Les composantes du score :
    * Popularité globale (40 %) : ``global_popularity_score``.
    * Adéquation au prix (30 %) : 1 - |prix - AOV| / max_price.
    * Correspondance de famille (20 %) : 1 si la famille est dans les préférences du client, sinon 0.
    * Score RFM normalisé du client (10 %) : ``rfm_score / max_rfm_score``.
    """
    # Popularité
    popularity = prod.global_popularity_score or 0.0
    # Prix (si pas de prix, valeur neutre)
    if prod.price and max_price > 0:
        price_diff = abs(prod.price - (client.average_order_value or 0.0))
        price_score = 1.0 - min(price_diff / max_price, 1.0)
    else:
        price_score = 0.5
    # Famille
    fam_score = 0.0
    if prod.family and client.preferred_families:
        fams = set(client.preferred_families.split(","))
        if prod.family in fams:
            fam_score = 1.0
    # RFM
    rfm_norm = (client.rfm_score or 0.0) / max_rfm_score if max_rfm_score > 0 else 0.0
    # Poids des composantes
    score = (
        0.4 * popularity
        + 0.3 * price_score
        + 0.2 * fam_score
        + 0.1 * rfm_norm
    )
    return float(score)


def generate_recommendations(db: Session, tenant_id: int, top_n: int = 5) -> List[Recommendation]:
    """Génère des recommandations personnalisées pour tous les clients d’un tenant.

    Cette fonction supprime d'abord les recommandations existantes pour le
    tenant, puis parcourt chaque client pour créer de nouvelles
    recommandations selon le scénario choisi. Les scores sont
    normalisés afin qu'ils soient comparables entre produits.

    Args:
        db: session SQLAlchemy.
        tenant_id: identifiant du locataire.
        top_n: nombre maximum de produits à recommander par client.

    Returns:
        La liste d'objets ``Recommendation`` créés.
    """
    # Effacer les anciennes recommandations
    db.query(Recommendation).filter(Recommendation.tenant_id == tenant_id).delete()
    db.commit()
    # Préparer les données
    products: List[Product] = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    clients: List[Client] = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    # Construire mapping client -> produits achetés
    client_bought: Dict[str, Set[str]] = {}
    for s in sales:
        client_bought.setdefault(s.client_code, set()).add(s.product_key)
    # Déterminer max_price et max_rfm pour normalisation
    max_price = max((p.price or 0.0) for p in products) if products else 0.0
    max_rfm = max((c.rfm_score or 0) for c in clients) if clients else 0.0
    # Générer les recommandations
    all_recos: List[Recommendation] = []
    for client in clients:
        bought = client_bought.get(client.client_code, set())
        scenario = _select_scenario(client)
        candidates = _candidate_products(client, bought, products, scenario, max_price)
        # Calculer les scores pour chaque candidat
        scored: List[tuple[Product, float]] = []
        for prod in candidates:
            score = _compute_score(prod, client, max_price, max_rfm)
            scored.append((prod, score))
        # Trier et sélectionner top N
        scored = sorted(scored, key=lambda x: x[1], reverse=True)[:top_n]
        for prod, score in scored:
            reco = Recommendation(
                client_code=client.client_code,
                product_key=prod.product_key,
                score=score,
                scenario=scenario,
                tenant_id=tenant_id,
            )
            db.add(reco)
            all_recos.append(reco)
    db.commit()
    return all_recos