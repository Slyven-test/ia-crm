"""
Point d’entrée de l’API FastAPI pour ia‑crm.

Ce module crée l’application, configure le CORS et inclut les routes des
différents sous‑modules (auth, tenants, recommendations, campaigns). Il
expose également un endpoint racine pour vérifier que l’API est opérationnelle.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
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
    etl,
)


def create_app() -> FastAPI:
    app = FastAPI(title="ia-crm", version="0.1.0")

    # Créer les tables en base si nécessaire
    Base.metadata.create_all(bind=engine)

    # Configurer CORS pour permettre les appels depuis le frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # en production, restreindre aux domaines autorisés
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
    app.include_router(etl.router)

    @app.get("/")
    def read_root():
        return {"message": "ia-crm API is running"}

    return app


app = create_app()