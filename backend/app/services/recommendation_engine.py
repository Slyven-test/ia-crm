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

from ..models import (
    Sale,
    Product,
    Recommendation,
    Client,
    RecoRun,
    RecoItem,
)
from .scenario_service import ScenarioService


# Obsolete: scenario selection now handled by ScenarioService

def _select_scenario(client: Client) -> str:
    """Backward compatibility wrapper using ScenarioService.

    This helper instantiates a ScenarioService and returns the best
    scenario for the client. It falls back to simple heuristics if the
    service is unavailable.
    """
    try:
        service = ScenarioService()
        return service.decide(client).scenario.lower()
    except Exception:
        now = dt.datetime.utcnow()
        if client.rfm_score is None or client.rfm_score == 0:
            return "nurture"
        if client.last_purchase_date:
            days = (now - client.last_purchase_date).days
            if days > 180:
                return "winback"
            if days > 30:
                return "rebuy"
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
    """Génère une liste de produits candidats pour un scénario donné.

    Cette version utilise les champs enrichis (family_crm, price_ttc) et
    tient compte des préférences du client pour la famille afin de
    filtrer les produits.
    """
    candidates: List[Product] = []
    pref_fams: Set[str] = set()
    if client.preferred_families:
        try:
            import json
            prefs = json.loads(client.preferred_families)
            pref_fams = {p.get("family") for p in prefs if p.get("family")}
        except Exception:
            # fallback to simple comma‑separated string
            pref_fams = set((client.preferred_families or "").split(","))
    aov = client.average_order_value or 0.0
    for prod in all_products:
        if prod.product_key in bought or not prod.is_active or prod.is_archived:
            continue
        fam = prod.family_crm or ""
        price = prod.price_ttc or 0.0
        if scenario == "rebuy":
            if fam and fam in pref_fams:
                candidates.append(prod)
        elif scenario == "cross_sell":
            if fam and (not pref_fams or fam not in pref_fams):
                candidates.append(prod)
        elif scenario == "upsell":
            if fam and fam in pref_fams and price > aov:
                candidates.append(prod)
        elif scenario in ("winback", "nurture"):
            candidates.append(prod)
    if not candidates:
        candidates = [p for p in all_products if p.product_key not in bought and p.is_active and not p.is_archived]
    return candidates


def _compute_score(
    prod: Product,
    client: Client,
    max_price: float,
    max_rfm_score: float,
) -> float:
    """Calcule un score composite pour un produit et un client.

    Composantes :
    * Popularité globale (40 %) : ``global_popularity_score`` normalisé.
    * Adéquation au prix (30 %) : 1 - |prix TTC - AOV| / max_price.
    * Correspondance de famille (20 %) : 1 si ``family_crm`` est dans les
      préférences du client.
    * Score RFM normalisé du client (10 %).
    """
    popularity = prod.global_popularity_score or 0.0
    aov = client.average_order_value or 0.0
    price = prod.price_ttc or 0.0
    if price and max_price > 0:
        price_diff = abs(price - aov)
        price_score = 1.0 - min(price_diff / max_price, 1.0)
    else:
        price_score = 0.5
    fam_score = 0.0
    if prod.family_crm and client.preferred_families:
        try:
            import json
            fams = {p.get("family") for p in json.loads(client.preferred_families)}
        except Exception:
            fams = set(client.preferred_families.split(","))
        if prod.family_crm in fams:
            fam_score = 1.0
    rfm_norm = (client.rfm_score or 0.0) / max_rfm_score if max_rfm_score > 0 else 0.0
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


def generate_recommendations_run(db: Session, tenant_id: int, top_n: int = 5) -> dict:
    """Génère des recommandations et enregistre un run détaillé (RecoRun/RecoItem).

    Cette fonction crée un enregistrement ``RecoRun`` pour tracer l'exécution,
    calcule les recommandations pour chaque client du tenant, puis enregistre
    chaque suggestion dans ``RecoItem`` avec le rang et le score. Les
    recommandations agrégées dans la table ``Recommendation`` sont également
    créées afin de conserver une API de lecture simple.

    Args:
        db: session SQLAlchemy.
        tenant_id: identifiant du locataire.
        top_n: nombre maximum de produits à recommander par client.

    Returns:
        Un dictionnaire contenant l'identifiant du run et le nombre total
        d'éléments générés.
    """
    # Créer un enregistrement de run
    run = RecoRun(
        executed_at=dt.datetime.utcnow(),
        dataset_version=None,
        config_hash=None,
        code_version=None,
        status="running",
        tenant_id=tenant_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    # Effacer les anciennes recommandations agrégées et items
    db.query(Recommendation).filter(Recommendation.tenant_id == tenant_id).delete()
    db.query(RecoItem).filter(RecoItem.tenant_id == tenant_id).delete()
    db.commit()
    # Préparer les données (réutilise la logique existante)
    products: List[Product] = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    clients: List[Client] = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    client_bought: Dict[str, Set[str]] = {}
    for s in sales:
        client_bought.setdefault(s.client_code, set()).add(s.product_key)
    max_price = max((p.price_ttc or 0.0) for p in products) if products else 0.0
    max_rfm = max((c.rfm_score or 0) for c in clients) if clients else 0.0
    # Générer les recommandations et enregistrer les items
    total_items = 0
    for client in clients:
        bought = client_bought.get(client.client_code, set())
        scenario = _select_scenario(client)
        candidates = _candidate_products(client, bought, products, scenario, max_price)
        scored: List[tuple[Product, float]] = []
        for prod in candidates:
            score = _compute_score(prod, client, max_price, max_rfm)
            scored.append((prod, score))
        scored = sorted(scored, key=lambda x: x[1], reverse=True)[:top_n]
        for rank, (prod, score) in enumerate(scored, start=1):
            # Enregistrer le reco item
            reco_item = RecoItem(
                run_id=run.id,
                client_id=client.id,
                product_id=prod.id,
                scenario=scenario,
                rank=rank,
                score=score,
                explain_short=None,
                reasons_json=None,
                tenant_id=tenant_id,
            )
            db.add(reco_item)
            # Enregistrer également dans la table Recommendation (agrégée)
            reco = Recommendation(
                client_code=client.client_code,
                product_key=prod.product_key,
                score=score,
                scenario=scenario,
                tenant_id=tenant_id,
            )
            db.add(reco)
            total_items += 1
    run.status = "completed"
    db.commit()
    return {"run_id": run.id, "total_items": total_items}