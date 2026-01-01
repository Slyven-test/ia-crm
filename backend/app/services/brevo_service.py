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
    """Envoie un e‑mail via Brevo (stub) et enregistre un événement de contact.

    Dans cette version simplifiée, l'envoi se résume à l'enregistrement d'un
    message dans les logs. Si une session de base de données et un tenant
    sont fournis, un ``ContactEvent`` est créé pour tracer l'envoi. En
    production, l'appel à l'API Brevo doit être implémenté et le statut mis
    à jour en fonction des retours (open, click, unsubscribe, etc.).

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
    # Enregistrement dans les logs (stub)
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

    # Exemple d’intégration réelle (commentée) :
    # from brevo_client import BrevoClient
    # api_key = os.getenv("BREVO_API_KEY")
    # client = BrevoClient(api_key)
    # response = client.send_email(to=to, subject=subject, html_content=html_content, cc=cc)
    # return response