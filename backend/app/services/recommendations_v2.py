from __future__ import annotations

import datetime as dt

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Client, Product, Recommendation, Sale, TasteDimension, User
from .taste_scoring import client_vector, compute_weighted_similarity, product_vector


def get_accessible_clients_query(db: Session, current_user: User):
    query = db.query(Client).filter(Client.tenant_id == current_user.tenant_id)
    if current_user.is_superuser:
        return query
    return query.filter(
        or_(
            Client.owner_user_id == current_user.id,
            Client.visibility == "tenant",
            Client.owner_user_id.is_(None),
        )
    )


def get_accessible_products_query(db: Session, current_user: User):
    query = db.query(Product).filter(Product.tenant_id == current_user.tenant_id)
    if current_user.is_superuser:
        return query
    return query.filter(
        or_(
            Product.owner_user_id == current_user.id,
            Product.visibility == "tenant",
            Product.owner_user_id.is_(None),
        )
    )


def load_client_context(db: Session, tenant_id: int, client_code: str) -> dict:
    purchased = (
        db.query(Sale.product_key)
        .filter(Sale.tenant_id == tenant_id, Sale.client_code == client_code)
        .distinct()
        .all()
    )
    purchased_keys = {row[0] for row in purchased if row[0]}
    return {"purchased_keys": purchased_keys}


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _seasonality_boost(product: Product, now: dt.datetime) -> float:
    if not product.season_tags:
        return 0.0
    tags = product.season_tags.lower()
    month = now.month
    if "hiver" in tags and month in {11, 12, 1, 2}:
        return 0.1
    if ("ete" in tags or "été" in tags) and month in {5, 6, 7, 8}:
        return 0.1
    return 0.0


def score_product_for_client(
    *,
    client: Client,
    product: Product,
    dimensions: list[TasteDimension],
    scenario: str,
    purchased_keys: set[str],
    now: dt.datetime,
) -> tuple[float, dict]:
    taste_score = compute_weighted_similarity(
        client_vector(client),
        product_vector(product),
        dimensions,
    )
    margin_boost = _clamp((product.margin or 0.0) / 20.0)
    popularity_boost = _clamp(product.global_popularity_score or 0.0)
    seasonality_boost = _seasonality_boost(product, now)

    base_score = 0.60 * taste_score + 0.15 * margin_boost + 0.15 * popularity_boost + seasonality_boost
    scenario_adjustment = 0.0

    if scenario == "cross-sell":
        if product.product_key in purchased_keys:
            scenario_adjustment = base_score * -0.8
            base_score *= 0.2
    elif scenario == "rebuy":
        if product.product_key in purchased_keys:
            scenario_adjustment = 0.15
            base_score += 0.15
        else:
            scenario_adjustment = -0.05
            base_score = max(0.0, base_score - 0.05)
    elif scenario == "winback":
        if client.rfm_segment == "At Risk" or (client.recency is not None and client.recency >= 180):
            if product.premium_tier == "haut de gamme" or product.price_band == "High":
                scenario_adjustment = 0.1
                base_score += 0.1

    final_score = _clamp(base_score)
    explain = {
        "taste_score": taste_score,
        "margin_boost": margin_boost,
        "popularity_boost": popularity_boost,
        "seasonality_boost": seasonality_boost,
        "scenario_adjustment": scenario_adjustment,
    }
    return final_score, explain


def compute_recommendations(
    db: Session,
    *,
    current_user: User,
    client_code: str,
    scenario: str,
    limit: int,
    now: dt.datetime | None = None,
) -> list[dict]:
    client = (
        get_accessible_clients_query(db, current_user)
        .filter(Client.client_code == client_code)
        .first()
    )
    if not client:
        raise ValueError("Client not accessible")

    now = now or dt.datetime.utcnow()
    context = load_client_context(db, current_user.tenant_id, client_code)
    purchased_keys = context["purchased_keys"]

    dimensions = (
        db.query(TasteDimension)
        .filter(TasteDimension.tenant_id == current_user.tenant_id)
        .all()
    )

    products = get_accessible_products_query(db, current_user).all()
    scored = []
    for product in products:
        score, explain = score_product_for_client(
            client=client,
            product=product,
            dimensions=dimensions,
            scenario=scenario,
            purchased_keys=purchased_keys,
            now=now,
        )
        if score <= 0:
            continue
        scored.append(
            {
                "product_key": product.product_key,
                "score": score,
                "scenario": scenario,
                "explain": explain,
            }
        )

    scored.sort(key=lambda item: (-item["score"], item["product_key"]))
    return scored[:limit]


def persist_recommendations(
    db: Session,
    *,
    tenant_id: int,
    client_code: str,
    scenario: str,
    recos: list[dict],
) -> None:
    db.query(Recommendation).filter(
        Recommendation.tenant_id == tenant_id,
        Recommendation.client_code == client_code,
        Recommendation.scenario == scenario,
    ).delete(synchronize_session=False)

    for reco in recos:
        db.add(
            Recommendation(
                tenant_id=tenant_id,
                client_code=client_code,
                product_key=reco["product_key"],
                score=reco["score"],
                scenario=reco["scenario"],
                created_at=dt.datetime.utcnow(),
                is_approved=False,
            )
        )
    db.commit()
