"""
Service d'audit de qualité des données pour ia‑crm.

Ce module implémente quelques règles d'audit inspirées de la plateforme
originale. Les règles évaluent la fraîcheur des données, la
complétude des e‑mails, la présence de doublons récents et la
diversité des achats. Chaque audit génère un score et enregistre les
résultats dans la table ``AuditLog``.

Le score est calculé comme suit :
    score = 100 - (40 × erreurs) - (10 × warnings)
Un lot passe l'audit si ``erreurs == 0`` et ``score >= 80``.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Dict

from sqlalchemy.orm import Session

from ..models import Client, Sale, AuditLog, Product


def run_audit(db: Session, tenant_id: int) -> AuditLog:
    """Exécute un audit complet et renvoie un AuditLog enregistré.

    L'audit applique jusqu'à 15 règles pour évaluer la qualité et la
    cohérence des données du tenant. Chaque règle peut incrémenter le
    nombre d'erreurs (Erreur) ou d'avertissements (Warning) et ajoute un
    message détaillé. Le score est calculé via la formule :

        score = 100 - 40 × erreurs - 10 × warnings

    Les principales règles implémentées sont :

    1. **SILENCE_WINDOW** (Error) : client sans achat depuis plus de 365 jours.
    2. **MISSING_EMAIL** (Error) : client sans adresse e‑mail.
    3. **RECENT_DUPLICATE** (Error) : mêmes document et produit vendus plusieurs fois dans les 30 derniers jours.
    4. **LOW_DIVERSITY** (Warning) : client ayant acheté moins de deux produits distincts.
    5. **DUPLICATE_EMAIL** (Warning) : même e‑mail utilisé par plusieurs clients.
    6. **INVALID_SALE_VALUE** (Error) : vente avec quantité ou montant négatif ou nul.
    7. **UNKNOWN_PRODUCT** (Error) : vente référencée avec une clé produit inconnue dans le catalogue.
    8. **UNKNOWN_CLIENT** (Error) : vente avec un code client inconnu.
    9. **CHURN_WARNING** (Warning) : client sans achat depuis plus de 180 jours.
    10. **UNREALISTIC_PRICE** (Warning) : produit avec un prix négatif ou excessif (> 1000).
    11. **NEGATIVE_MARGIN** (Error) : produit avec une marge négative.
    12. **INCOMPLETE_RFM** (Warning) : client sans composante RFM (recency, frequency ou monetary).
    13. **MISSING_FAMILY** (Warning) : produit sans famille CRM définie.
    14. **ZERO_QUANTITY** (Error) : vente avec quantité nulle.
    15. **NO_PURCHASE_DATA** (Error) : client sans ventes et sans date d'achat connue.
    """
    errors = 0
    warnings = 0
    details = []
    now = dt.datetime.utcnow()
    # Charger toutes les entités nécessaires
    clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    # Create product key set and client code set for quick lookup
    product_keys = {p.product_key for p in products if p.product_key}
    client_codes = {c.client_code for c in clients if c.client_code}
    # Map email to list of clients
    email_map: Dict[str, list] = {}
    for c in clients:
        email = c.email or ""
        if email:
            email_map.setdefault(email.lower(), []).append(c)
    # Compute recency for churn check (R9) and maintain last_purchase_date presence
    for c in clients:
        # R1: Silence window (no purchase > 365 days)
        if c.last_purchase_date:
            if (now - c.last_purchase_date).days > 365:
                errors += 1
                details.append(
                    f"SILENCE_WINDOW: Client {c.client_code} inactif depuis plus de 365 jours"
                )
        else:
            # Pas de date d'achat connue
            errors += 1
            details.append(f"NO_PURCHASE_DATA: Client {c.client_code} n'a aucune date d'achat")
        # R2: Missing email
        if not c.email:
            errors += 1
            details.append(f"MISSING_EMAIL: Client {c.client_code} sans e‑mail")
        # R9: Churn warning (no purchase in 180 days)
        if c.last_purchase_date:
            if (now - c.last_purchase_date).days > 180:
                warnings += 1
                details.append(
                    f"CHURN_WARNING: Client {c.client_code} n'a pas acheté depuis plus de 180 jours"
                )
        # R12: Incomplete RFM (recency, frequency, monetary)
        if not c.recency or not c.frequency or not c.monetary:
            warnings += 1
            details.append(
                f"INCOMPLETE_RFM: Client {c.client_code} a des composantes RFM manquantes"
            )
    # R5: Duplicate email
    for email, clts in email_map.items():
        if len(clts) > 1:
            warnings += 1
            codes = ", ".join([cl.client_code for cl in clts])
            details.append(f"DUPLICATE_EMAIL: L'e‑mail {email} est utilisé par plusieurs clients ({codes})")
    # Charger toutes les ventes
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    # R3: Recent duplicate (30 days) for sales
    thirty_days_ago = now - dt.timedelta(days=30)
    recent_sales = [s for s in sales if s.sale_date and s.sale_date >= thirty_days_ago]
    seen: Dict[tuple, int] = defaultdict(int)
    for s in recent_sales:
        key = (s.document_id, s.product_key)
        seen[key] += 1
    for key, count in seen.items():
        if count > 1:
            errors += 1
            details.append(
                f"RECENT_DUPLICATE: {key[0]} {key[1]} apparaît {count} fois en 30 jours"
            )
    # R4: Low diversity per client
    client_products: Dict[str, set] = defaultdict(set)
    for s in sales:
        client_products[s.client_code].add(s.product_key)
    for c in clients:
        count = len(client_products.get(c.client_code, set()))
        if 0 < count < 2:
            warnings += 1
            details.append(
                f"LOW_DIVERSITY: Client {c.client_code} n'a acheté qu'un seul produit"
            )
    # R6-R8, R14, R15: Validate each sale
    for s in sales:
        # R6: Invalid sale value (quantity or amount <= 0)
        if (s.quantity is not None and s.quantity <= 0) or (s.amount is not None and s.amount <= 0):
            errors += 1
            details.append(
                f"INVALID_SALE_VALUE: Vente {s.document_id} {s.product_key} a une quantité ou un montant invalide"
            )
        # R7: Unknown product
        if s.product_key not in product_keys:
            errors += 1
            details.append(
                f"UNKNOWN_PRODUCT: Vente {s.document_id} référence un produit inconnu ({s.product_key})"
            )
        # R8: Unknown client
        if s.client_code not in client_codes:
            errors += 1
            details.append(
                f"UNKNOWN_CLIENT: Vente {s.document_id} référence un client inconnu ({s.client_code})"
            )
        # R14: Zero quantity
        if s.quantity is not None and s.quantity == 0:
            errors += 1
            details.append(
                f"ZERO_QUANTITY: Vente {s.document_id} {s.product_key} a une quantité nulle"
            )
    # R10-R11, R13: Validate products
    for p in products:
        # R10: Unrealistic price
        if p.price_ttc is not None:
            if p.price_ttc <= 0 or p.price_ttc > 1000:
                warnings += 1
                details.append(
                    f"UNREALISTIC_PRICE: Produit {p.product_key} a un prix inhabituel ({p.price_ttc})"
                )
        # R11: Negative margin
        if p.margin is not None and p.margin < 0:
            errors += 1
            details.append(
                f"NEGATIVE_MARGIN: Produit {p.product_key} a une marge négative ({p.margin})"
            )
        # R13: Missing family
        if not p.family_crm or p.family_crm.strip() == "":
            warnings += 1
            details.append(
                f"MISSING_FAMILY: Produit {p.product_key} n'a pas de famille CRM définie"
            )
    # Calculer le score final
    score = 100 - (40 * errors) - (10 * warnings)
    # Écrire le log
    log = AuditLog(
        executed_at=now,
        tenant_id=tenant_id,
        errors=errors,
        warnings=warnings,
        score=score,
        details="\n".join(details),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log