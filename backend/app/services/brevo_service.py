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

logger = logging.getLogger(__name__)

# Exemple de fonction d’envoi d’un e‑mail. En production, utilisez l’API Brevo.
def send_email(to: str, subject: str, html_content: str, cc: List[str] | None = None) -> None:
    """Envoie un e‑mail via Brevo (stub).

    Args:
        to: adresse du destinataire.
        subject: sujet du mail.
        html_content: contenu HTML du mail.
        cc: liste d’adresses en copie.
    """
    # Dans cette version simplifiée, on se contente d’enregistrer l’opération.
    logger.info(
        f"[BREVO STUB] Envoi d’un e‑mail à {to} (CC: {cc}) – Sujet: {subject}\nContenu:\n{html_content}"
    )

    # Exemple d’intégration réelle (commentée) :
    # from brevo_client import BrevoClient
    # api_key = os.getenv("BREVO_API_KEY")
    # client = BrevoClient(api_key)
    # response = client.send_email(to=to, subject=subject, html_content=html_content, cc=cc)
    # return response