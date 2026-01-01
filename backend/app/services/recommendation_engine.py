"""
Moteur de recommandations simplifié pour ia‑crm.

Cette implémentation minimale sert de point de départ. Elle génère des
recommandations basées sur la fréquence d’achat : pour chaque client, elle
sélectionne les produits qu’il n’a pas encore achetés mais qui sont
populaires parmi les autres clients du même tenant. Le score est une
approximation du nombre total de ventes de chaque produit.

À terme, ce moteur pourra être enrichi (RFM, co‑achats, règles métier,
garde‑fous, etc.) selon la roadmap.
"""

from __future__ import annotations

from collections import defaultdict
from typing import List, Dict

from sqlalchemy.orm import Session

from ..models import Sale, Product, Recommendation


def generate_recommendations(db: Session, tenant_id: int) -> List[Recommendation]:
    """Génère des recommandations pour tous les clients d’un tenant.

    Args:
        db: session SQLAlchemy.
        tenant_id: identifiant du locataire.

    Returns:
        Liste de recommandations insérées en base.
    """
    # Récupérer toutes les ventes de ce tenant
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    if not sales:
        return []

    # Comptage des produits vendus
    product_counts: Dict[str, int] = defaultdict(int)
    # Mapping client -> produits achetés
    client_bought: Dict[str, set[str]] = defaultdict(set)

    for sale in sales:
        product_counts[sale.product_key] += 1
        client_bought[sale.client_code].add(sale.product_key)

    # Tous les produits disponibles
    products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    product_keys = {p.product_key for p in products}

    recommendations: List[Recommendation] = []

    # Pour chaque client, recommander les produits qu’il n’a pas encore achetés
    for client_code, bought in client_bought.items():
        candidates = product_keys - bought
        # Trier les candidats par popularité (produits les plus vendus d’abord)
        sorted_candidates = sorted(candidates, key=lambda k: product_counts.get(k, 0), reverse=True)
        for product_key in sorted_candidates[:5]:  # proposer max 5 produits
            score = float(product_counts.get(product_key, 0))
            reco = Recommendation(
                client_code=client_code,
                product_key=product_key,
                score=score,
                scenario="top_seller",
                tenant_id=tenant_id,
            )
            recommendations.append(reco)
            db.add(reco)
    db.commit()
    return recommendations