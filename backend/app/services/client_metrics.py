from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import func, distinct
from sqlalchemy.orm import Session

from ..models import Client, Sale


def _recency_score(recency_days: Optional[float]) -> int:
    if recency_days is None:
        return 1
    if recency_days <= 30:
        return 5
    if recency_days <= 90:
        return 4
    if recency_days <= 180:
        return 3
    if recency_days <= 365:
        return 2
    return 1


def _frequency_score(total_orders: int) -> int:
    if total_orders >= 12:
        return 5
    if total_orders >= 6:
        return 4
    if total_orders >= 3:
        return 3
    if total_orders >= 2:
        return 2
    return 1


def _monetary_score(total_spent: float) -> int:
    if total_spent >= 2000:
        return 5
    if total_spent >= 1000:
        return 4
    if total_spent >= 500:
        return 3
    if total_spent >= 200:
        return 2
    return 1


def _rfm_segment(recency: int, frequency: int, monetary: int) -> str:
    if recency >= 4 and frequency >= 4 and monetary >= 4:
        return "Champions"
    if recency >= 4 and frequency >= 3:
        return "Loyal"
    if recency >= 4 and frequency <= 2:
        return "New"
    if recency <= 2 and frequency >= 3:
        return "At Risk"
    return "Others"


def recompute_client_metrics(
    db: Session,
    *,
    tenant_id: int,
    client_code: str,
    now: Optional[dt.datetime] = None,
) -> Client:
    client = (
        db.query(Client)
        .filter(Client.tenant_id == tenant_id, Client.client_code == client_code)
        .first()
    )
    if not client:
        raise ValueError("Client not found for metrics recompute")

    aggregates = (
        db.query(
            func.max(Sale.sale_date),
            func.coalesce(func.sum(Sale.amount), 0.0),
            func.count(Sale.id),
            func.count(distinct(Sale.document_id)),
        )
        .filter(Sale.tenant_id == tenant_id, Sale.client_code == client_code)
        .one()
    )
    last_purchase_date, total_spent, count_sales, count_documents = aggregates
    total_spent = float(total_spent or 0.0)
    total_orders = int(count_documents or 0) if count_documents else int(count_sales or 0)
    average_order_value = total_spent / total_orders if total_orders else 0.0

    now = now or dt.datetime.utcnow()
    recency = None
    if last_purchase_date:
        recency = float((now - last_purchase_date).days)

    frequency = float(total_orders)
    monetary = float(total_spent)

    recency_score = _recency_score(recency)
    frequency_score = _frequency_score(total_orders)
    monetary_score = _monetary_score(total_spent)
    rfm_score = recency_score * 100 + frequency_score * 10 + monetary_score
    rfm_segment = _rfm_segment(recency_score, frequency_score, monetary_score)

    client.last_purchase_date = last_purchase_date
    client.total_spent = total_spent
    client.total_orders = total_orders
    client.average_order_value = average_order_value
    client.recency = recency
    client.frequency = frequency
    client.monetary = monetary
    client.rfm_score = rfm_score
    client.rfm_segment = rfm_segment

    db.add(client)
    db.commit()
    db.refresh(client)
    return client
