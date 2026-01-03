"""
Service d’intégration Brevo (Sendinblue) — priorise le DRY RUN et la sécurité.

Toutes les opérations loggent un payload redacted dans ``brevo_logs`` et ne
tentent pas d’appel réseau si ``BREVO_DRY_RUN`` vaut ``1`` (défaut) ou si la
clé API est absente. Aucune clé n’est jamais journalisée.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Protocol, runtime_checkable

from sqlalchemy.orm import Session

from ..models import BrevoLog, Client, ContactHistory, NextActionOutput, RunSummary

logger = logging.getLogger(__name__)


def _is_dry_run(force_dry_run: bool | None = None) -> bool:
    if force_dry_run is not None:
        return force_dry_run
    return os.getenv("BREVO_DRY_RUN", "1").lower() in {"1", "true", "yes", "on"}


def _log_action(
    db: Session,
    tenant_id: int,
    action: str,
    status: str,
    payload: Dict | None = None,
    run_id: str | None = None,
    batch_id: str | None = None,
) -> BrevoLog:
    log = BrevoLog(
        run_id=run_id,
        batch_id=batch_id,
        action=action,
        status=status,
        payload_redacted=json.dumps(payload or {}),
        tenant_id=tenant_id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _record_contact_history(
    db: Session,
    tenant_id: int,
    customer_code: str,
    status: str,
    channel: str = "email",
    meta: Dict | None = None,
) -> None:
    history = ContactHistory(
        customer_code=customer_code,
        last_contact_at=datetime.utcnow(),
        channel=channel,
        status=status,
        meta=json.dumps(meta or {}),
        tenant_id=tenant_id,
    )
    db.add(history)
    db.commit()


@runtime_checkable
class BrevoClient(Protocol):
    """Client HTTP minimal pour Brevo."""

    def send_batch(self, payload: Dict[str, Any]) -> Dict[str, Any]: ...


class DummyBrevoClient:
    """Implémentation neutre qui n'effectue aucun appel réseau."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key
        self.calls: List[Dict[str, Any]] = []

    def send_batch(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.calls.append(payload)
        return {"status": "noop"}


def sync_contacts(db: Session, tenant_id: int, force_dry_run: bool | None = None) -> Dict:
    """Prépare la synchro des contacts Brevo (DRY RUN par défaut)."""
    dry_run = _is_dry_run(force_dry_run)
    clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    exported = [
        {"email": c.email, "customer_code": c.client_code, "name": c.name}
        for c in clients
        if c.email
    ]
    batch_id = uuid.uuid4().hex
    status = "dry_run" if dry_run else "ready"
    _log_action(
        db,
        tenant_id,
        action="sync_contacts",
        status=status,
        payload={"count": len(exported)},
        batch_id=batch_id,
    )
    return {"synced": len(exported), "dry_run": dry_run, "batch_id": batch_id, "preview": exported[:5]}


def send_batch(
    db: Session,
    tenant_id: int,
    run_id: str,
    template_id: str,
    batch_size: int,
    force_dry_run: bool | None = None,
    preview_only: bool = False,
    client: BrevoClient | None = None,
) -> Dict:
    """Prépare ou simule l’envoi d’un lot d’e-mails basé sur un run."""
    if batch_size < 200 or batch_size > 300:
        raise ValueError("batch_size must be between 200 and 300")
    dry_run = _is_dry_run(force_dry_run)
    summary = (
        db.query(RunSummary)
        .filter(RunSummary.run_id == run_id, RunSummary.tenant_id == tenant_id)
        .first()
    )
    summary_json = {}
    if summary and summary.summary_json:
        try:
            summary_json = json.loads(summary.summary_json)
        except Exception:
            summary_json = {}
    if not summary_json.get("gate_export", False):
        raise ValueError("Export gating disabled for this run")

    eligible_rows = (
        db.query(NextActionOutput)
        .filter(
            NextActionOutput.run_id == run_id,
            NextActionOutput.tenant_id == tenant_id,
            NextActionOutput.eligible == True,  # noqa: E712
        )
        .all()
    )
    if not eligible_rows:
        raise ValueError("No eligible contacts for this run")

    client_codes = [row.customer_code for row in eligible_rows][:batch_size]
    clients = (
        db.query(Client)
        .filter(Client.tenant_id == tenant_id, Client.client_code.in_(client_codes))
        .all()
    )
    preview = [
        {"email": c.email, "customer_code": c.client_code, "name": c.name}
        for c in clients
        if c.email
    ][:5]
    batch_id = uuid.uuid4().hex
    status = "dry_run" if dry_run or preview_only else "ready"
    payload = {
        "run_id": run_id,
        "template_id": template_id,
        "count": len(preview),
        "batch_size": batch_size,
    }
    _log_action(
        db,
        tenant_id,
        action="send_batch",
        status=status,
        payload=payload,
        run_id=run_id,
        batch_id=batch_id,
    )
    for c in preview:
        _record_contact_history(db, tenant_id, c["customer_code"], status=status, meta={"batch_id": batch_id})
    if not dry_run and not preview_only:
        http_client = client or DummyBrevoClient(os.getenv("BREVO_API_KEY"))
        http_client.send_batch(
            {
                "template_id": template_id,
                "contacts": preview,
                "batch_id": batch_id,
                "run_id": run_id,
            }
        )
    return {
        "run_id": run_id,
        "template_id": template_id,
        "batch_id": batch_id,
        "dry_run": dry_run or preview_only,
        "preview": preview,
        "count": len(preview),
    }


# Historique legacy pour les campagnes simples
def send_email(
    to: str,
    subject: str,
    html_content: str,
    cc: List[str] | None = None,
    *,
    db: Session | None = None,
    tenant_id: int | None = None,
    client_code: str | None = None,
    campaign_id: int | None = None,
    channel: str = "email",
    status: str = "delivered",
) -> None:
    """Simule l'envoi d'un e-mail unique (utilisé par /campaigns)."""
    dry_run = _is_dry_run()
    if dry_run or not os.getenv("BREVO_API_KEY"):
        logger.info("[BREVO DRY RUN] Email simulé (aucun appel réseau).")
    else:
        logger.info("[BREVO REAL] Envoi réel activé (non implémenté ici).")

    if db is not None and tenant_id is not None and client_code:
        try:
            from ..models import Client, ContactEvent  # import local pour éviter les cycles

            client = (
                db.query(Client)
                .filter(Client.client_code == client_code, Client.tenant_id == tenant_id)
                .first()
            )
            if client:
                contact = ContactEvent(
                    client_id=client.id,
                    contact_date=datetime.utcnow(),
                    channel=channel,
                    status=status if not dry_run else "dry_run",
                    campaign_id=campaign_id,
                    tenant_id=tenant_id,
                )
                db.add(contact)
                db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Erreur lors de la création du ContactEvent : {exc}")


def get_campaign_stats(db: Session, tenant_id: int, campaign_id: int) -> Dict[str, int]:
    """Retourne des statistiques simples pour une campagne."""
    from ..models import ContactEvent  # import local pour éviter les cycles

    stats = {"sent": 0, "open": 0, "click": 0, "bounce": 0, "unsubscribe": 0}
    events = (
        db.query(ContactEvent)
        .filter(
            ContactEvent.tenant_id == tenant_id,
            ContactEvent.campaign_id == campaign_id,
        )
        .all()
    )
    for ev in events:
        if ev.status in {"delivered", "dry_run"}:
            stats["sent"] += 1
        elif ev.status == "open":
            stats["open"] += 1
        elif ev.status == "click":
            stats["click"] += 1
        elif ev.status == "bounce":
            stats["bounce"] += 1
        elif ev.status == "unsubscribe":
            stats["unsubscribe"] += 1
    return stats
