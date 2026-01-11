"""
Service de calcul des préférences clients et de la popularité produits.

Ce module fournit des fonctions pour :

* déterminer les familles de produits préférées de chaque client (top 2
  familles les plus achetées) ;
* déterminer une bande de budget (Low, Medium, High) sur la base du
  panier moyen de chaque client ;
* mettre à jour la table ``products`` avec un score de popularité
  global (nombre de ventes relatif) et éventuellement la marge ou
  d’autres indicateurs si ceux‑ci sont disponibles.

Les calculs se basent sur les tables ``sales`` et ``products``.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Dict, List

import numpy as np
from sqlalchemy.orm import Session

from ..models import Client, Sale, Product


def compute_client_preferences(db: Session, tenant_id: int) -> None:
    """Calcule et enregistre les préférences et le budget des clients.

    Pour chaque client du tenant :

    1. On récupère toutes ses ventes et on agrège par famille de
       produits afin d’identifier les familles les plus fréquentes (top 2).
    2. On utilise le champ ``average_order_value`` déjà calculé via RFM
       pour déterminer une bande de budget : Low, Medium ou High.
    3. Les champs ``preferred_families`` et ``budget_band`` du client sont
       mis à jour.
    """
    # Préparer un mapping produit_key -> famille
    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id)
        .all()
    )
    family_map: Dict[str, str] = {p.product_key: (getattr(p, 'family_crm', None) or getattr(p, 'family', None) or 'unknown') for p in products}
    # Récupérer toutes les ventes
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    # Organiser par client_code
    client_families: Dict[str, List[str]] = defaultdict(list)
    for sale in sales:
        fam = family_map.get(sale.product_key, "unknown")
        client_families[sale.client_code].append(fam)
    # Obtenir la distribution des paniers moyens pour évaluer les budgets
    clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    aovs = [c.average_order_value for c in clients if c.average_order_value]
    if aovs:
        q1, q3 = np.quantile(aovs, [0.33, 0.66])
    else:
        q1 = q3 = 0.0
    # Mettre à jour chaque client
    for client in clients:
        fams = client_families.get(client.client_code, [])
        if fams:
            counts = Counter(fams)
            top_families = [f for f, _ in counts.most_common(2)]
            client.preferred_families = ",".join(top_families)
        # Déterminer budget band
        aov = client.average_order_value or 0.0
        if aov == 0.0 or q3 == 0.0:
            band = None
        elif aov <= q1:
            band = "Low"
        elif aov <= q3:
            band = "Medium"
        else:
            band = "High"
        client.budget_band = band
        db.add(client)
    db.commit()


def compute_products_popularity(db: Session, tenant_id: int) -> None:
    """Calcule un score de popularité global pour chaque produit.

    Le score correspond au nombre de ventes du produit divisé par le
    nombre total de ventes. Il est enregistré dans le champ
    ``global_popularity_score`` de la table ``products``.
    """
    # Compter le nombre de ventes par produit
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    if not sales:
        return
    total_sales = len(sales)
    counts: Dict[str, int] = defaultdict(int)
    for sale in sales:
        counts[sale.product_key] += 1
    # Mettre à jour chaque produit
    products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    for prod in products:
        prod.global_popularity_score = counts.get(prod.product_key, 0) / total_sales
        db.add(prod)
    db.commit()