"""Helper to seed a small demo dataset (tenant, user, and a few records)."""

from __future__ import annotations

import datetime as dt
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Tenant, User, Client, Product, Sale
from .services.auth_service import get_password_hash


def seed_demo_data(db: Session) -> None:
    """Create a demo tenant, user and sample data if they don't already exist."""
    tenant = db.query(Tenant).filter(Tenant.name == "demo").first()
    if not tenant:
        tenant = Tenant(name="demo", domain="demo.local")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    user = db.query(User).filter(User.username == "demo").first()
    if not user:
        user = User(
            username="demo",
            email="demo@example.com",
            hashed_password=get_password_hash("demo"),
            is_active=True,
            is_superuser=False,
            tenant_id=tenant.id,
        )
        db.add(user)

    if not db.query(Client).filter_by(client_code="C001", tenant_id=tenant.id).first():
        db.add(
            Client(
                client_code="C001",
                name="Alice Demo",
                email="alice@example.com",
                rfm_score=3,
                rfm_segment="Promising",
                budget_band="Medium",
                tenant_id=tenant.id,
            )
        )

    if not db.query(Client).filter_by(client_code="C002", tenant_id=tenant.id).first():
        db.add(
            Client(
                client_code="C002",
                name="Bob Demo",
                email="bob@example.com",
                rfm_score=4,
                rfm_segment="Loyal",
                budget_band="High",
                tenant_id=tenant.id,
            )
        )

    if not db.query(Product).filter_by(product_key="P001", tenant_id=tenant.id).first():
        db.add(
            Product(
                product_key="P001",
                name="Pinot Noir Demo",
                family_crm="Rouge",
                price_ttc=15.0,
                global_popularity_score=0.62,
                tenant_id=tenant.id,
            )
        )

    if not db.query(Product).filter_by(product_key="P002", tenant_id=tenant.id).first():
        db.add(
            Product(
                product_key="P002",
                name="Riesling Demo",
                family_crm="Blanc",
                price_ttc=12.0,
                global_popularity_score=0.55,
                tenant_id=tenant.id,
            )
        )

    if not db.query(Sale).filter_by(document_id="INV-001", tenant_id=tenant.id).first():
        db.add(
            Sale(
                document_id="INV-001",
                product_key="P001",
                client_code="C001",
                quantity=3,
                amount=45.0,
                sale_date=dt.datetime.utcnow(),
                tenant_id=tenant.id,
            )
        )

    if not db.query(Sale).filter_by(document_id="INV-002", tenant_id=tenant.id).first():
        db.add(
            Sale(
                document_id="INV-002",
                product_key="P002",
                client_code="C002",
                quantity=2,
                amount=30.0,
                sale_date=dt.datetime.utcnow(),
                tenant_id=tenant.id,
            )
        )

    db.commit()


def main() -> None:
    """Entrypoint for seeding demo data from the CLI."""
    db = SessionLocal()
    try:
        seed_demo_data(db)
        print("Seeded demo tenant/user.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
