"""
Bootstrap non-interactif d'un admin ia-crm.

Usage:
  python -m app.cli.bootstrap_admin
"""

from __future__ import annotations

import os
import sys

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Tenant, User
from ..services.auth_service import get_password_hash


def _bool_env(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _ensure_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).order_by(Tenant.id.asc()).first()
    if tenant:
        return tenant
    tenant = Tenant(name="default")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _require_password() -> str:
    password = os.getenv("ADMIN_PASSWORD", "")
    if not password:
        print("ADMIN_PASSWORD is required for create/reset.", file=sys.stderr)
        raise SystemExit(1)
    return password


def main() -> int:
    username = os.getenv("ADMIN_USERNAME", "admin")
    email = os.getenv("ADMIN_EMAIL") or None
    reset_password = _bool_env("RESET_ADMIN_PASSWORD", "0")

    db = SessionLocal()
    try:
        tenant = _ensure_tenant(db)
        user = db.query(User).filter(User.username == username).first()
        if user:
            if reset_password:
                password = _require_password()
                user.hashed_password = get_password_hash(password)
                if email:
                    user.email = email
                user.is_active = True
                user.is_superuser = True
                user.tenant_id = tenant.id
                db.commit()
                print(f"admin_reset username={username} tenant_id={tenant.id}")
                return 0
            print(f"admin_exists username={username} tenant_id={user.tenant_id}")
            return 0

        password = _require_password()
        user = User(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            is_active=True,
            is_superuser=True,
            tenant_id=tenant.id,
        )
        db.add(user)
        db.commit()
        print(f"admin_created username={username} tenant_id={tenant.id}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
