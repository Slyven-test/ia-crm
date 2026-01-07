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
import json
from collections import Counter, defaultdict
from typing import List, Dict, Set, Tuple

from sqlalchemy.orm import Session

from ..models import (
    AuditOutput,
    Client,
    ContactEvent,
    NextActionOutput,
    Product,
    Recommendation,
    RecoOutput,
    RecoRun,
    RecoItem,
    RunSummary,
    Sale,
)
from .audit_engine import audit_client

# Poids par scénario pour le calcul du score composite.
# Ces pondérations peuvent être ajustées en fonction des objectifs
# marketing : certains scénarios favorisent la popularité, d'autres le prix ou
# la correspondance de famille.
SCORING_WEIGHTS: Dict[str, Dict[str, float]] = {
    "winback": {"popularity": 0.3, "price": 0.3, "family": 0.2, "rfm": 0.2},
    "rebuy": {"popularity": 0.3, "price": 0.2, "family": 0.4, "rfm": 0.1},
    "cross_sell": {"popularity": 0.3, "price": 0.3, "family": 0.2, "rfm": 0.2},
    "upsell": {"popularity": 0.2, "price": 0.4, "family": 0.3, "rfm": 0.1},
    "nurture": {"popularity": 0.3, "price": 0.3, "family": 0.2, "rfm": 0.2},
}
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
    scenario: str,
) -> float:
    """Calcule un score composite pour un produit et un client en fonction du scénario.

    Les composantes du score sont :
    * Popularité globale du produit (``global_popularity_score``) ;
    * Adéquation au prix : plus le prix du produit est proche de la moyenne des achats du client, meilleur est le score ;
    * Correspondance de famille : 1 si la famille CRM du produit appartient aux préférences du client, 0 sinon ;
    * Score RFM normalisé du client.

    Les pondérations de ces composantes dépendent du scénario (winback, rebuy,
    cross_sell, upsell, nurture) via la constante ``SCORING_WEIGHTS``.
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
    weights = SCORING_WEIGHTS.get(scenario.lower(), SCORING_WEIGHTS.get("nurture"))
    score = (
        weights.get("popularity", 0.0) * popularity
        + weights.get("price", 0.0) * price_score
        + weights.get("family", 0.0) * fam_score
        + weights.get("rfm", 0.0) * rfm_norm
    )
    return float(score)


def _product_popularity(sales: List[Sale]) -> Counter:
    c = Counter()
    for s in sales:
        if s.product_key:
            c[s.product_key] += s.quantity or 1
    return c


def _rebuy_candidates(purchases: List[Sale], product_map: Dict[str, Product], now: dt.datetime) -> List[Product]:
    seen = set()
    rows: List[Tuple[Product, float]] = []
    for sale in purchases:
        prod = product_map.get(sale.product_key)
        if not prod or prod.product_key in seen:
            continue
        if sale.sale_date and (now - sale.sale_date).days < 30:
            continue
        qty = sale.quantity or 1.0
        rows.append((prod, qty))
        seen.add(prod.product_key)
    rows.sort(key=lambda t: t[1], reverse=True)
    return [p for p, _ in rows]


def _cross_sell_candidates(
    popularity: Counter,
    purchased: Set[str],
    product_map: Dict[str, Product],
) -> List[Product]:
    ordered_keys = [k for k, _ in popularity.most_common() if k not in purchased]
    return [product_map[k] for k in ordered_keys if k in product_map]


def _upsell_candidates(
    purchases: List[Sale],
    product_map: Dict[str, Product],
    purchased: Set[str],
    average_price: float,
) -> List[Product]:
    candidates: List[Tuple[Product, float]] = []
    for prod in product_map.values():
        if prod.product_key in purchased or not prod.family_crm:
            continue
        if prod.price_ttc is None:
            continue
        # même famille que les achats
        fam_match = any(
            product_map.get(s.product_key) and product_map[s.product_key].family_crm == prod.family_crm
            for s in purchases
        )
        if fam_match and prod.price_ttc > average_price:
            candidates.append((prod, prod.price_ttc))
    candidates.sort(key=lambda t: t[1], reverse=True)
    return [p for p, _ in candidates]


def _explain(scenario: str, product: Product, context: dict) -> str:
    if scenario == "rebuy":
        return f"Déjà acheté : {product.name}"
    if scenario == "cross_sell":
        return f"Populaire dans le segment {context.get('segment','global')}"
    if scenario == "upsell":
        return f"Plus premium (prix {product.price_ttc or 0:.2f})"
    return f"Suggestion {scenario}"


def _build_recommendations_for_client(
    client: Client,
    purchases: List[Sale],
    product_map: Dict[str, Product],
    popularity: Counter,
    top_n: int,
    now: dt.datetime,
) -> List[Dict]:
    recos: List[Dict] = []
    added: Set[str] = set()
    purchased_keys = {s.product_key for s in purchases}
    avg_price = sum([(product_map.get(s.product_key).price_ttc or 0) for s in purchases if product_map.get(s.product_key)]) / max(
        1, len(purchases)
    )



def _upsell_candidates(
    purchases: List[Sale],
    product_map: Dict[str, Product],
    purchased: Set[str],
    average_price: float,
) -> List[Product]:
    candidates: List[Tuple[Product, float]] = []
    for prod in product_map.values():
        if prod.product_key in purchased or not prod.family_crm:
            continue
        if prod.price_ttc is None:
            continue
        # même famille que les achats
        fam_match = any(
            product_map.get(s.product_key) and product_map[s.product_key].family_crm == prod.family_crm
            for s in purchases
        )
        if fam_match and prod.price_ttc > average_price:
            candidates.append((prod, prod.price_ttc))
    candidates.sort(key=lambda t: t[1], reverse=True)
    return [p for p, _ in candidates]


def _explain(scenario: str, product: Product, context: dict) -> str:
    if scenario == "rebuy":
        return f"Déjà acheté : {product.name}"
    if scenario == "cross_sell":
        return f"Populaire dans le segment {context.get('segment','global')}"
    if scenario == "upsell":
        return f"Plus premium (prix {product.price_ttc or 0:.2f})"
    return f"Suggestion {scenario}"


def _build_recommendations_for_client(
    client: Client,
    purchases: List[Sale],
    product_map: Dict[str, Product],
    popularity: Counter,
    top_n: int,
    now: dt.datetime,
) -> List[Dict]:
    recos: List[Dict] = []
    added: Set[str] = set()
    purchased_keys = {s.product_key for s in purchases}
    avg_price = sum([(product_map.get(s.product_key).price_ttc or 0) for s in purchases if product_map.get(s.product_key)]) / max(
        1, len(purchases)
    )

    def add_candidates(products: List[Product], scenario: str):
        for prod in products:
            if prod.product_key in added:
                continue
            recos.append(
                {
                    "customer_code": client.client_code,
                    "product_key": prod.product_key,
                    "scenario": scenario,
                    "score": prod.global_popularity_score or 0.0,
                    "explain_short": _explain(scenario, prod, {"segment": client.cluster or "global"}),
                }
            )
            added.add(prod.product_key)
            if len(recos) >= top_n:
                return

    rebuy = _rebuy_candidates(purchases, product_map, now)
    add_candidates(rebuy, "rebuy")
    upsell = _upsell_candidates(purchases, product_map, purchased_keys, avg_price)
    add_candidates(upsell, "upsell")
    cross = _cross_sell_candidates(popularity, purchased_keys, product_map)
    add_candidates(cross, "cross_sell")

    # fallback populaires si rien
    if not recos:
        add_candidates([p for p in product_map.values() if p.product_key not in added], "nurture")
    return recos


def generate_recommendations_run(
    db: Session,
    tenant_id: int,
    top_n: int = 5,
    silence_window_days: int = 7,
) -> dict:
    """Génère un run complet avec audit/gating et exports en base."""
    now = dt.datetime.utcnow()
    run = RecoRun(
        started_at=now,
        executed_at=now,
        status="running",
        tenant_id=tenant_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    products: List[Product] = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    product_map = {p.product_key: p for p in products if p.product_key}
    clients: List[Client] = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    sales: List[Sale] = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    contact_events: List[ContactEvent] = (
        db.query(ContactEvent).join(Client, Client.id == ContactEvent.client_id).filter(Client.tenant_id == tenant_id).all()
    )

    history_by_client: Dict[str, List[Sale]] = defaultdict(list)
    for sale in sales:
        history_by_client[sale.client_code].append(sale)

    contacts_by_client: Dict[int, List[ContactEvent]] = defaultdict(list)
    for ev in contact_events:
        contacts_by_client[ev.client_id].append(ev)

    popularity = _product_popularity(sales)

    # nettoyer anciennes sorties pour le tenant
    db.query(Recommendation).filter(Recommendation.tenant_id == tenant_id).delete()
    db.query(RecoOutput).filter(RecoOutput.tenant_id == tenant_id).delete()
    db.query(AuditOutput).filter(AuditOutput.tenant_id == tenant_id).delete()
    db.query(NextActionOutput).filter(NextActionOutput.tenant_id == tenant_id).delete()
    db.query(RunSummary).filter(RunSummary.tenant_id == tenant_id).delete()
    db.query(RecoItem).filter(RecoItem.tenant_id == tenant_id).delete()
    db.commit()

    scenario_counts: Counter = Counter()
    audit_issues_counter: Counter = Counter()
    total_errors = 0
    total_warns = 0
    eligible = 0
    rec_output_rows: List[RecoOutput] = []
    rec_items: List[RecoItem] = []

    for client in clients:
        purchases = history_by_client.get(client.client_code, [])
        recos = _build_recommendations_for_client(client, purchases, product_map, popularity, top_n, now)
        for idx, reco in enumerate(recos, start=1):
            scenario_counts[reco["scenario"]] += 1
            product = product_map.get(reco["product_key"])
            reasons_json = json.dumps({"source": reco.get("scenario")})
            rec_output_rows.append(
                RecoOutput(
                    run_id=run.run_id,
                    customer_code=client.client_code,
                    scenario=reco["scenario"],
                    rank=idx,
                    product_key=reco["product_key"],
                    score=reco.get("score"),
                    explain_short=reco.get("explain_short"),
                    reasons_json=reasons_json,
                    tenant_id=tenant_id,
                )
            )
            # mirroir reco_items pour compat front historique
            if product:
                rec_items.append(
                    RecoItem(
                        run_id=run.id,
                        client_id=client.id,
                        product_id=product.id,
                        scenario=reco["scenario"],
                        rank=idx,
                        score=reco.get("score"),
                        explain_short=reco.get("explain_short"),
                        reasons_json=reasons_json,
                        tenant_id=tenant_id,
                    )
                )
            db.add(
                Recommendation(
                    client_code=client.client_code,
                    product_key=reco["product_key"],
                    score=reco.get("score") or 0.0,
                    scenario=reco["scenario"],
                    tenant_id=tenant_id,
                )
            )

        issues, audit_score, is_eligible, reason = audit_client(
            client,
            recos,
            product_map,
            contacts_by_client.get(client.id, []),
            purchases,
            silence_window_days=silence_window_days,
        )
        for issue in issues:
            if issue.get("severity") == "ERROR":
                total_errors += 1
            else:
                total_warns += 1
            audit_issues_counter[issue["rule_code"]] += 1
            db.add(
                AuditOutput(
                    run_id=run.run_id,
                    customer_code=client.client_code,
                    severity=issue["severity"],
                    rule_code=issue["rule_code"],
                    details_json=json.dumps(issue.get("details", {})),
                    tenant_id=tenant_id,
                )
            )
        db.add(
            NextActionOutput(
                run_id=run.run_id,
                customer_code=client.client_code,
                eligible=is_eligible,
                reason=reason,
                scenario=recos[0]["scenario"] if recos else None,
                audit_score=audit_score,
                tenant_id=tenant_id,
            )
        )
        if is_eligible:
            eligible += 1

    for row in rec_output_rows:
        db.add(row)
    for item in rec_items:
        db.add(item)

    run.finished_at = dt.datetime.utcnow()
    run.status = "completed"
    run.dataset_version = str(len(sales))

    run_audit_score = max(0.0, 100.0 - 40 * total_errors - 10 * total_warns)
    gate_export = total_errors == 0 and run_audit_score >= 80

    summary = {
        "gating_rate": eligible / max(1, len(clients)),
        "total_clients": len(clients),
        "total_recommendations": len(rec_output_rows),
        "scenario_counts": dict(scenario_counts),
        "top_errors": audit_issues_counter.most_common(3),
        "n_errors": total_errors,
        "n_warns": total_warns,
        "audit_score": run_audit_score,
        "gate_export": gate_export,
        "gate_export": eligible == len(clients),
    }
    db.add(RunSummary(run_id=run.run_id, summary_json=json.dumps(summary), tenant_id=tenant_id))
    db.commit()

    return {"run_id": run.run_id, "summary": summary, "status": run.status}


def generate_recommendations(db: Session, tenant_id: int, top_n: int = 5) -> List[Recommendation]:
    """Compatibilité historique : lance un run puis renvoie les recos agrégées."""
    generate_recommendations_run(db, tenant_id=tenant_id, top_n=top_n)
    return db.query(Recommendation).filter(Recommendation.tenant_id == tenant_id).all()
