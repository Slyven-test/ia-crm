"""
Routes pour créer et gérer des campagnes e‑mail.

Un utilisateur peut créer une campagne (nom, date de planification, template) et
déclencher l’envoi immédiat d’e‑mails via le service Brevo. Dans cette
implémentation simplifiée, l’envoi est simulé via des logs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services import brevo_service

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("/", response_model=schemas.CampaignRead)
def create_campaign(
    campaign_in: schemas.CampaignCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.CampaignRead:
    """Crée une nouvelle campagne pour le tenant courant."""
    campaign = models.Campaign(
        name=campaign_in.name,
        scheduled_at=campaign_in.scheduled_at,
        status=campaign_in.status or "draft",
        template_id=campaign_in.template_id,
        tenant_id=current_user.tenant_id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/{campaign_id}/send")
def send_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Déclenche l’envoi d’une campagne.

    Les recommandations existantes sont récupérées et un e‑mail est envoyé à
    chaque client. L’envoi est simulé via un log dans cette version.
    """
    campaign = (
        db.query(models.Campaign)
        .filter(
            models.Campaign.id == campaign_id,
            models.Campaign.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    # Récupérer toutes les recommandations pour le tenant
    recos = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.tenant_id == current_user.tenant_id)
        .all()
    )
    sent = 0
    # Envoyer un e‑mail à chaque client avec la liste de recommandations (stub)
    for reco in recos:
        # Récupérer l’e‑mail du client si présent dans la table clients
        client = (
            db.query(models.Client)
            .filter(
                models.Client.tenant_id == current_user.tenant_id,
                models.Client.client_code == reco.client_code,
            )
            .first()
        )
        email_to = client.email if client and client.email else f"{reco.client_code}@example.com"
        subject = f"Nouvelle recommandation pour {reco.client_code}"
        html_content = (
            f"<p>Nous vous recommandons le produit {reco.product_key} "
            f"(score {reco.score:.2f}, scénario {reco.scenario or '-'}).</p>"
        )
        # Envoyer l'e-mail et créer un événement de contact en passant la session,
        # le tenant, le code client et l'identifiant de campagne. Le service Brevo
        # enregistre également le statut initial (delivered).
        brevo_service.send_email(
            to=email_to,
            subject=subject,
            html_content=html_content,
            cc=None,
            db=db,
            tenant_id=current_user.tenant_id,
            client_code=reco.client_code,
            campaign_id=campaign_id,
            channel="email",
            status="delivered",
        )
        sent += 1
    # Mettre à jour le statut de la campagne
    campaign.status = "sent"
    db.commit()
    return {"message": f"Campagne {campaign_id} envoyée", "count": sent}


@router.get("/{campaign_id}/stats")
def get_campaign_stats(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Retourne des statistiques pour une campagne.

    Les statistiques sont calculées à partir des événements de contact en base
    (sent, open, click, bounce, unsubscribe). Si une intégration Brevo
    complète est configurée, cet endpoint pourrait être étendu pour appeler
    l'API officielle et récupérer des métriques avancées.
    """
    # Vérifier que la campagne existe pour ce tenant
    campaign = (
        db.query(models.Campaign)
        .filter(models.Campaign.id == campaign_id, models.Campaign.tenant_id == current_user.tenant_id)
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    stats = brevo_service.get_campaign_stats(db, current_user.tenant_id, campaign_id)
    return stats