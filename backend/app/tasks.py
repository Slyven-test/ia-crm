"""Celery tasks for asynchronous execution and scheduled jobs.

This module defines a Celery application along with tasks that wrap
long‑running operations such as running the ETL pipeline, computing
RFM scores, generating recommendation runs and sending campaigns via
Brevo. By delegating these jobs to Celery workers, the FastAPI
application remains responsive under heavy workloads. A beat schedule
is configured to automatically launch the weekly ETL job.

Environment variables:
  CELERY_BROKER_URL: URL of the message broker (defaults to Redis at
    ``redis://redis:6379/0``).
  CELERY_RESULT_BACKEND: URL for storing task results (defaults to
    Redis at ``redis://redis:6379/1``).
  ETL_TENANTS: Comma separated list of tenant identifiers for the
    weekly ETL job (defaults to "ruhlmann,valentinr").
  ETL_ISOLATE_SCHEMA: If set to a truthy value, schemas will be
    isolated per tenant when loading data.

To start a worker:
  celery -A app.tasks worker --loglevel=info

To start the beat scheduler (for periodic tasks):
  celery -A app.tasks beat --loglevel=info

The beat schedule is configured to run the ETL every Monday at 03:00.
"""

from __future__ import annotations

import os
from typing import List, Iterable, Optional

from celery import Celery
from celery.schedules import crontab

from .database import SessionLocal
from .routers.etl import run_etl_for_tenants
from .services.rfm_service import compute_rfm_scores_for_tenant
from .services.recommendation_engine import generate_recommendations_run
from .services.brevo_service import send_email


def _get_bool_env(key: str, default: bool = False) -> bool:
    """Helper to parse boolean values from environment variables."""
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in {"1", "true", "yes", "on"}


# Configure the Celery application. Broker and backend default to Redis containers.
celery_app = Celery(
    "ia_crm",
    broker=os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/1"),
)

# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

@celery_app.task(name="tasks.run_etl")
def run_etl_task(tenants: Iterable[str] | None = None, isolate_schema: bool | None = None) -> dict[str, object]:
    """Run the ETL pipeline for the provided tenants and return the summary.

    :param tenants: Iterable of tenant identifiers. If None, defaults to the
        ETL_TENANTS environment variable or an empty list. The router
        module's ``run_etl_for_tenants`` will interpret an empty list as
        skipping execution.
    :param isolate_schema: Whether to isolate data per tenant. If None,
        the ``ETL_ISOLATE_SCHEMA`` environment variable is used.
    :returns: A summary dictionary containing results per tenant.
    """
    if tenants is None:
        env_val = os.getenv("ETL_TENANTS", "ruhlmann,valentinr")
        tenants = [t.strip() for t in env_val.split(",") if t.strip()]
    if isolate_schema is None:
        isolate_schema = _get_bool_env("ETL_ISOLATE_SCHEMA", default=False)
    result = run_etl_for_tenants(list(tenants), isolate_schema=isolate_schema)
    return result


@celery_app.task(name="tasks.compute_rfm")
def compute_rfm_task(tenant_id: str) -> str:
    """Compute RFM scores for a specific tenant.

    This task opens a new SQLAlchemy session, calls the RFM service and
    closes the session automatically. It returns a success message.
    """
    db = SessionLocal()
    try:
        compute_rfm_scores_for_tenant(db, tenant_id)
        db.commit()
    finally:
        db.close()
    return f"RFM computed for tenant {tenant_id}"


@celery_app.task(name="tasks.generate_recommendations")
def generate_recommendations_task(tenant_id: str) -> dict[str, object]:
    """Generate a recommendation run for a tenant and return a summary.

    The underlying service creates ``RecoRun`` and ``RecoItem`` entries.
    This task is suitable for asynchronous execution since it may be
    computationally intensive on large datasets.
    """
    db = SessionLocal()
    try:
        run_info = generate_recommendations_run(db, tenant_id)
        db.commit()
    finally:
        db.close()
    return run_info


@celery_app.task(name="tasks.send_email")
def send_email_task(
    tenant_id: str,
    client_code: str,
    subject: str,
    content: str,
    campaign_id: Optional[int] = None,
) -> str:
    """Send a transactional email to a client and record the contact event.

    The Brevo service will record the event in the database if the
    necessary context (tenant ID, client code, campaign ID) is provided.
    """
    db = SessionLocal()
    try:
        send_email(
            to_email=None,
            subject=subject,
            content=content,
            db=db,
            tenant_id=tenant_id,
            client_code=client_code,
            campaign_id=campaign_id,
        )
        db.commit()
    finally:
        db.close()
    return f"Email sent to {client_code} for tenant {tenant_id}"


# ---------------------------------------------------------------------------
# Beat schedule
# ---------------------------------------------------------------------------

# Define a periodic schedule that triggers the ETL once a week. We run the
# job early Monday morning to avoid interfering with business hours. Users
# can override the tenants and isolation behaviour via environment variables.
celery_app.conf.beat_schedule = {
    "weekly-etl": {
        "task": "tasks.run_etl",
        # Run every Monday at 03:00 (UTC). Adjust as needed.
        "schedule": crontab(minute=0, hour=3, day_of_week="1"),
        # Pass default None values so that run_etl_task uses environment
        # variables to determine tenants and isolation mode.
        "args": [],
    },
}


__all__ = [
    "celery_app",
    "run_etl_task",
    "compute_rfm_task",
    "generate_recommendations_task",
    "send_email_task",
]