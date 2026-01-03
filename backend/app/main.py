"""
Point d’entrée de l’API FastAPI pour ia‑crm.

Ce module crée l’application, configure le CORS et inclut les routes des
différents sous‑modules (auth, tenants, recommendations, campaigns). Il
expose également un endpoint racine pour vérifier que l’API est opérationnelle.
"""

from __future__ import annotations

import importlib
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal
from .demo_seed import seed_demo_data
from .routers import (
    auth,
    tenants,
    recommendations,
    campaigns,
    rfm,
    analytics,
    audit,
    clients,
    products,
    sales,
    profiles,
    system,
    export,
    contacts,
    reco_runs,
    config,
    clusters,
    aliases,
    reco_pipeline,
)


def create_app() -> FastAPI:
    app = FastAPI(title="ia-crm", version="0.1.0")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    class _RedactFilter(logging.Filter):
        def __init__(self) -> None:
            super().__init__()
            self._secrets = [
                os.getenv("BREVO_API_KEY", ""),
                os.getenv("DATABASE_URL", ""),
                os.getenv("JWT_SECRET_KEY", ""),
            ]

        def filter(self, record: logging.LogRecord) -> bool:  # pragma: no cover - simple guard
            msg = record.getMessage()
            for secret in self._secrets:
                if secret:
                    msg = msg.replace(secret, "***")
            record.msg = msg
            record.args = ()
            return True

    root_logger = logging.getLogger()
    redact_filter = _RedactFilter()
    root_logger.addFilter(redact_filter)
    for handler in root_logger.handlers:
        handler.addFilter(redact_filter)

    # Créer les tables en base si nécessaire
    Base.metadata.create_all(bind=engine)
    if os.getenv("ENABLE_DEMO_DATA", "0").lower() in {"1", "true", "yes", "on"}:
        db = SessionLocal()
        try:
            seed_demo_data(db)
        finally:
            db.close()

    # Configurer CORS pour permettre les appels depuis le frontend
    origin_env = os.getenv("CORS_ALLOW_ORIGINS") or os.getenv("ALLOWED_ORIGINS")
    allowed_origins = (origin_env or "http://localhost:3000").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allowed_origins if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Inclure les routeurs
    app.include_router(auth.router)
    app.include_router(tenants.router)
    app.include_router(recommendations.router)
    app.include_router(campaigns.router)
    app.include_router(rfm.router)
    app.include_router(analytics.router)
    app.include_router(audit.router)
    app.include_router(clients.router)
    app.include_router(products.router)
    app.include_router(sales.router)
    app.include_router(profiles.router)
    app.include_router(system.router)
    # Router pour les opérations ETL
    # Router pour l'export de données
    app.include_router(export.router)
    # Router pour les événements de contact
    app.include_router(contacts.router)
    # Router pour les runs de recommandations
    app.include_router(reco_runs.router)
    # Router pour les paramètres de configuration
    app.include_router(config.router)
    # Router pour les exports de données (déjà importé au dessus)
    # (re-déclaré ici pour plus de clarté et pour éviter l'oubli dans la liste)
    app.include_router(export.router)

    # Router pour les clusters
    app.include_router(clusters.router)

    # Router pour les alias produits
    app.include_router(aliases.router)
    # Pipeline reco/audit/export
    app.include_router(reco_pipeline.router)

    def _include_optional(module_path: str, label: str) -> None:
        """Inclut un routeur optionnel sans casser le démarrage si le module manque."""
        logger = logging.getLogger(__name__)
        try:
            module = importlib.import_module(module_path)
            router = getattr(module, "router")
            app.include_router(router)
        except Exception as exc:  # pragma: no cover - import errors only
            logger.warning("Module optionnel %s non chargé (%s)", label, exc)

    # Routers optionnels : ETL et Brevo peuvent manquer selon l'environnement
    _include_optional("backend.app.routers.etl", "etl")
    _include_optional("backend.app.routers.brevo", "brevo")

    @app.get("/")
    def read_root():
        return {"message": "ia-crm API is running"}

    return app


app = create_app()
