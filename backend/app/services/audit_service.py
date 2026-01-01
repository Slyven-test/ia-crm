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

from ..models import Client, Sale, AuditLog


def run_audit(db: Session, tenant_id: int) -> AuditLog:
    """Exécute l'audit et renvoie un AuditLog enregistré.

    Les règles appliquées sont :
    1. SILENCE_WINDOW (Error) : plus aucun achat depuis plus de 365 jours.
    2. MISSING_EMAIL (Error) : client sans e‑mail.
    3. RECENT_DUPLICATE (Error) : doublons récents (même document et produit en moins de 30 jours).
    4. LOW_DIVERSITY (Warning) : moins de 2 produits distincts achetés.
    """
    errors = 0
    warnings = 0
    details = []
    now = dt.datetime.utcnow()
    clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    # Règle 1 : Silence > 365 jours
    for c in clients:
        if c.last_purchase_date:
            if (now - c.last_purchase_date).days > 365:
                errors += 1
                details.append(f"SILENCE_WINDOW: Client {c.client_code} inactif depuis plus de 365 jours")
        else:
            # Aucun achat connu
            errors += 1
            details.append(f"SILENCE_WINDOW: Client {c.client_code} n'a jamais acheté")
        # Règle 2 : e‑mail manquant
        if not c.email:
            errors += 1
            details.append(f"MISSING_EMAIL: Client {c.client_code} sans e‑mail")
    # Règle 3 : doublons récents
    # On parcourt les ventes des 30 derniers jours et repère les couples (document_id, product_key)
    thirty_days_ago = now - dt.timedelta(days=30)
    recent_sales = (
        db.query(Sale)
        .filter(Sale.tenant_id == tenant_id, Sale.sale_date != None, Sale.sale_date >= thirty_days_ago)
        .all()
    )
    seen: Dict[tuple, int] = defaultdict(int)
    for s in recent_sales:
        key = (s.document_id, s.product_key)
        seen[key] += 1
    for key, count in seen.items():
        if count > 1:
            errors += 1
            details.append(f"RECENT_DUPLICATE: {key[0]} {key[1]} apparaît {count} fois en 30 jours")
    # Règle 4 : faible diversité d'achats
    # Pour chaque client, compter le nombre de produits distincts
    sales = db.query(Sale).filter(Sale.tenant_id == tenant_id).all()
    client_products: Dict[str, set] = defaultdict(set)
    for s in sales:
        client_products[s.client_code].add(s.product_key)
    for c in clients:
        count = len(client_products.get(c.client_code, set()))
        if 0 < count < 2:
            warnings += 1
            details.append(f"LOW_DIVERSITY: Client {c.client_code} n'a acheté qu'un seul produit")
    # Calcul du score
    score = 100 - (40 * errors) - (10 * warnings)
    # Création du log
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