from __future__ import annotations

import datetime as dt
import json
from collections import Counter
from typing import Any, Dict, List, Tuple

from ..models import Client, ContactEvent, Product, Sale


AuditIssue = Dict[str, Any]


def _avg_purchase_price(purchases: List[Sale], product_map: Dict[str, Product]) -> float:
    prices: List[float] = []
    for sale in purchases:
        prod = product_map.get(sale.product_key)
        if prod and prod.price_ttc:
            prices.append(prod.price_ttc)
    if not prices:
        return 0.0
    return sum(prices) / len(prices)


def _dominant_sugar(purchases: List[Sale], product_map: Dict[str, Product]) -> str | None:
    sugars: List[str] = []
    for sale in purchases:
        prod = product_map.get(sale.product_key)
        if prod and prod.sucrosite_niveau:
            sugars.append(prod.sucrosite_niveau.lower())
    if not sugars:
        return None
    return Counter(sugars).most_common(1)[0][0]


def audit_client(
    client: Client,
    recos: List[Dict[str, Any]],
    product_map: Dict[str, Product],
    contact_events: List[ContactEvent],
    purchases: List[Sale],
    silence_window_days: int = 7,
) -> Tuple[List[AuditIssue], float, bool, str | None]:
    """
    Applique les règles de gating/audit sur un client et ses recommandations.

    Args:
        client: le client évalué.
        recos: liste de recommandations (dictionnaires) contenant ``product_key`` et ``scenario``.
        product_map: mapping product_key -> Product.
        contact_events: événements de contact du client.
        purchases: ventes historiques du client.
        silence_window_days: fenêtre de silence marketing en jours.

    Returns:
        Tuple (issues, audit_score, eligible, blocking_reason)
    """
    issues: List[AuditIssue] = []
    errors = 0
    warns = 0

    def add_issue(severity: str, rule: str, details: Dict[str, Any]) -> None:
        nonlocal errors, warns
        if severity == "ERROR":
            errors += 1
        else:
            warns += 1
        issues.append(
            {
                "severity": severity,
                "rule_code": rule,
                "details": details,
            }
        )

    now = dt.datetime.utcnow()

    # Règles
    if not client.email:
        add_issue("ERROR", "MISSING_EMAIL", {"message": "Email manquant"})

    if client.email_opt_out:
        add_issue("ERROR", "OPTOUT_OR_BOUNCE", {"message": "Client opt-out"})

    for ev in contact_events:
        if ev.status and ev.status.lower() in {"bounce", "unsubscribe"}:
            add_issue("ERROR", "OPTOUT_OR_BOUNCE", {"status": ev.status})
            break

    for ev in contact_events:
        if ev.contact_date and (now - ev.contact_date).days < silence_window_days:
            add_issue("ERROR", "SILENCE_WINDOW", {"contact_date": ev.contact_date.isoformat()})
            break

    # Duplicates dans les recommandations
    prod_counts = Counter([r.get("product_key") for r in recos if r.get("product_key")])
    dupes = [k for k, v in prod_counts.items() if v > 1]
    if dupes:
        add_issue("ERROR", "RECENT_DUPLICATE", {"products": dupes})

    purchased_keys = {s.product_key for s in purchases}
    avg_price = _avg_purchase_price(purchases, product_map)

    for reco in recos:
        scen = (reco.get("scenario") or "").lower()
        prod = product_map.get(reco.get("product_key"))
        if not prod:
            continue
        if scen == "upsell" and prod.price_ttc is not None and prod.price_ttc <= avg_price:
            add_issue(
                "ERROR",
                "UPSELL_NOT_HIGHER",
                {"product_key": prod.product_key, "price": prod.price_ttc, "avg_price": avg_price},
            )
        if scen == "cross_sell" and prod.product_key in purchased_keys:
            add_issue("WARN", "CROSS_SELL_NOT_NEW", {"product_key": prod.product_key})

    # Diversité
    families = [product_map[r["product_key"]].family_crm for r in recos if r.get("product_key") in product_map]
    fam_counter = Counter([f for f in families if f])
    if recos and fam_counter:
        top_family, top_count = fam_counter.most_common(1)[0]
        if top_count / max(1, len(recos)) > 0.7 and len(recos) >= 3:
            add_issue("WARN", "LOW_DIVERSITY", {"family": top_family, "share": top_count / len(recos)})

    # Sucrosité
    dominant_sugar = _dominant_sugar(purchases, product_map)
    if dominant_sugar:
        for reco in recos:
            prod = product_map.get(reco.get("product_key"))
            if prod and prod.sucrosite_niveau:
                if prod.sucrosite_niveau.lower() != dominant_sugar:
                    add_issue(
                        "WARN",
                        "SUGAR_MISMATCH",
                        {
                            "product_key": prod.product_key,
                            "suggested": prod.sucrosite_niveau,
                            "preferred": dominant_sugar,
                        },
                    )
                    break

    audit_score = max(0.0, 100.0 - 40 * errors - 10 * warns)
    eligible = errors == 0 and audit_score >= 80
    reason = None if eligible else (issues[0]["rule_code"] if issues else "AUDIT_SCORE_BELOW_THRESHOLD")
    return issues, audit_score, eligible, reason

