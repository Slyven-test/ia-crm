"""
Routes pour créer et gérer des campagnes e‑mail.

Un utilisateur peut créer une campagne (nom, date de planification, template) et
déclencher l’envoi immédiat d’e‑mails via le service Brevo. Dans cette
implémentation simplifiée, l’envoi est simulé via des logs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..services import brevo_service

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

DEFAULT_BATCH_SIZE = 200


class CampaignBatchRequest(BaseModel):
    run_id: str | None = None
    template_id: str
    batch_size: int = Field(DEFAULT_BATCH_SIZE, ge=200, le=300)
    preview_only: bool = False
    segment: str | None = None
    cluster: str | None = None


class CampaignBatchResponse(BaseModel):
    run_id: str
    dry_run: bool
    preview_only: bool
    n_selected: int
    n_in_batch: int
    preview: list[dict]
    result: dict


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


def _latest_run_id(db: Session, tenant_id: int) -> str:
    run = (
        db.query(models.RecoRun)
        .filter(models.RecoRun.tenant_id == tenant_id)
        .order_by(models.RecoRun.started_at.desc())
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Aucun run de recommandations trouvé")
    return run.run_id


def _select_contacts(
    db: Session,
    tenant_id: int,
    run_id: str,
    batch_size: int,
    segment: str | None = None,
    cluster: str | None = None,
) -> tuple[list[dict], int]:
    query = (
        db.query(models.NextActionOutput, models.Client)
        .join(
            models.Client,
            (models.Client.client_code == models.NextActionOutput.customer_code)
            & (models.Client.tenant_id == models.NextActionOutput.tenant_id),
        )
        .filter(
            models.NextActionOutput.tenant_id == tenant_id,
            models.NextActionOutput.run_id == run_id,
            models.NextActionOutput.eligible == True,  # noqa: E712
            models.Client.email.isnot(None),
            models.Client.email != "",
            models.Client.email_opt_out == False,  # noqa: E712
        )
    )
    if segment:
        query = query.filter(models.Client.rfm_segment == segment)
    if cluster:
        query = query.filter(models.Client.cluster == cluster)

    rows = query.order_by(models.NextActionOutput.customer_code).all()
    n_selected = len(rows)
    rows = rows[:batch_size]
    contacts = [
        {
            "email": client.email,
            "customer_code": client.client_code,
            "name": client.name,
        }
        for _, client in rows
    ]
    return contacts, n_selected


def _attach_recos(db: Session, tenant_id: int, run_id: str, contacts: list[dict]) -> None:
    codes = [c["customer_code"] for c in contacts]
    recos = (
        db.query(models.RecoOutput)
        .filter(
            models.RecoOutput.tenant_id == tenant_id,
            models.RecoOutput.run_id == run_id,
            models.RecoOutput.customer_code.in_(codes),
        )
        .order_by(models.RecoOutput.customer_code, models.RecoOutput.rank.asc().nulls_last())
        .all()
    )
    first_reco: dict[str, models.RecoOutput] = {}
    for reco in recos:
        if reco.customer_code not in first_reco:
            first_reco[reco.customer_code] = reco
    for contact in contacts:
        match = first_reco.get(contact["customer_code"])
        if match:
            contact["scenario"] = match.scenario
            contact["product_key"] = match.product_key
            contact["score"] = match.score


def _build_response(run_id: str, contacts: list[dict], n_selected: int, preview_only: bool, result: dict) -> CampaignBatchResponse:
    preview = contacts[:5]
    return CampaignBatchResponse(
        run_id=run_id,
        dry_run=result.get("dry_run", True),
        preview_only=preview_only,
        n_selected=n_selected,
        n_in_batch=len(contacts),
        preview=[
          {k: v for k, v in item.items() if k != "email"} | {"email": item.get("email")}
          for item in preview
        ],
        result=result,
    )


@router.post("/preview", response_model=CampaignBatchResponse)
def preview_campaign(
    payload: CampaignBatchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> CampaignBatchResponse:
    run_id = payload.run_id or _latest_run_id(db, current_user.tenant_id)
    contacts, n_selected = _select_contacts(
        db,
        tenant_id=current_user.tenant_id,
        run_id=run_id,
        batch_size=payload.batch_size,
        segment=payload.segment,
        cluster=payload.cluster,
    )
    _attach_recos(db, current_user.tenant_id, run_id, contacts)
    result = brevo_service.send_batch(
        db,
        tenant_id=current_user.tenant_id,
        run_id=run_id,
        template_id=payload.template_id,
        batch_size=payload.batch_size,
        force_dry_run=True,
        preview_only=True,
        allowed_customer_codes=[c["customer_code"] for c in contacts],
    )
    return _build_response(run_id, contacts, n_selected, True, result)


@router.post("/send", response_model=CampaignBatchResponse)
def send_campaign_batch(
    payload: CampaignBatchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> CampaignBatchResponse:
    run_id = payload.run_id or _latest_run_id(db, current_user.tenant_id)
    contacts, n_selected = _select_contacts(
        db,
        tenant_id=current_user.tenant_id,
        run_id=run_id,
        batch_size=payload.batch_size,
        segment=payload.segment,
        cluster=payload.cluster,
    )
    if not contacts:
        raise HTTPException(status_code=400, detail="Aucun contact éligible pour ce batch")
    _attach_recos(db, current_user.tenant_id, run_id, contacts)
    result = brevo_service.send_batch(
        db,
        tenant_id=current_user.tenant_id,
        run_id=run_id,
        template_id=payload.template_id,
        batch_size=payload.batch_size,
        force_dry_run=None,
        preview_only=payload.preview_only,
        allowed_customer_codes=[c["customer_code"] for c in contacts],
    )
    return _build_response(run_id, contacts, n_selected, payload.preview_only, result)
