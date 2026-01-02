"""
Service d’intégration Brevo (Sendinblue) — **version simplifiée**.

Ce module définit une interface pour envoyer des e‑mails via l’API de Brevo.
Afin de conserver ce dépôt fonctionnel sans dépendance externe, la fonction
``send_email`` se contente d’écrire un log avec le contenu de l’e‑mail.

Pour utiliser Brevo en production :
 1. Récupérez votre clé API Brevo et définissez `BREVO_API_KEY` dans votre fichier `.env`.
 2. Décommentez les parties commentées et installez la bibliothèque
    correspondante (par exemple `brevo` ou `sendinblue`) via pip.
 3. Gérez les erreurs de l’API (limites, erreurs réseau, etc.).
"""

from __future__ import annotations

import os
from typing import List, Dict
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Exemple de fonction d’envoi d’un e‑mail. En production, utilisez l’API Brevo.
def send_email(
    to: str,
    subject: str,
    html_content: str,
    cc: List[str] | None = None,
    *,
    db: "Session | None" = None,
    tenant_id: int | None = None,
    client_code: str | None = None,
    campaign_id: int | None = None,
    channel: str = "email",
    status: str = "delivered",
) -> None:
    """Envoie un e‑mail via Brevo et enregistre un événement de contact.

    Si une clé API Brevo (``BREVO_API_KEY``) est définie dans l'environnement,
    la requête est envoyée à l'API officielle via HTTPS. Sinon, l'envoi est
    simulé en écrivant un message dans les logs. Dans tous les cas, si une
    session de base de données et un ``tenant_id`` sont fournis, un
    ``ContactEvent`` est créé pour tracer l'envoi.

    Args:
        to: adresse du destinataire.
        subject: sujet du mail.
        html_content: contenu HTML du mail.
        cc: liste d’adresses en copie.
        db: session SQLAlchemy optionnelle pour enregistrer un ``ContactEvent``.
        tenant_id: identifiant du tenant auquel appartient le client.
        client_code: code du client (pour retrouver son ``id``). Si non fourni, le contact ne sera pas enregistré.
        campaign_id: identifiant de la campagne associée, le cas échéant.
        channel: canal utilisé (par défaut "email").
        status: statut de l'événement (par défaut "delivered").
    """
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME", "ia-crm")
    # Si une API key est définie, tenter l'envoi réel
    if api_key and sender_email:
        try:
            import requests

            url = "https://api.brevo.com/v3/smtp/email"
            headers = {
                "api-key": api_key,
                "accept": "application/json",
                "Content-Type": "application/json",
            }
            payload: Dict[str, any] = {
                "sender": {"name": sender_name, "email": sender_email},
                "to": [
                    {"email": to}
                ],
                "subject": subject,
                "htmlContent": html_content,
            }
            if cc:
                payload["cc"] = [{"email": addr} for addr in cc]
            # Envoyer la requête
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()
            logger.info(
                f"[BREVO] Email envoyé à {to} – sujet: {subject} (status {response.status_code})"
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Erreur lors de l'envoi du mail via Brevo : {exc}")
    else:
        # Mode stub : pas d'API key, on log uniquement
        logger.info(
            f"[BREVO STUB] Envoi d’un e‑mail à {to} (CC: {cc}) – Sujet: {subject}\nContenu:\n{html_content}"
        )

    # Création d'un événement de contact si la session et les informations sont fournies
    if db is not None and tenant_id is not None and client_code:
        try:
            from ..models import Client, ContactEvent  # import local pour éviter les cycles
            # Rechercher le client dans le tenant
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
                    status=status,
                    campaign_id=campaign_id,
                    tenant_id=tenant_id,
                )
                db.add(contact)
                db.commit()
        except Exception as exc:
            logger.error(f"Erreur lors de la création du ContactEvent : {exc}")


def get_campaign_stats(
    db: "Session", tenant_id: int, campaign_id: int
) -> Dict[str, int]:
    """Retourne des statistiques simples pour une campagne.

    Les statistiques sont calculées à partir des événements de contact enregistrés
    en base : nombre total d'envois, d'ouvertures, de clics, de rebonds et de
    désinscriptions. Si aucune clé API Brevo n'est configurée, cette fonction
    se contente de compter les événements locaux.

    Args:
        db: session SQLAlchemy.
        tenant_id: identifiant du tenant.
        campaign_id: identifiant de la campagne.

    Returns:
        Un dictionnaire avec les clés ``sent``, ``open``, ``click``, ``bounce`` et
        ``unsubscribe``.
    """
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
        if ev.status == "delivered":
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