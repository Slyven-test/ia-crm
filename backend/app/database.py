"""
Gestion de la base de données PostgreSQL pour l’API FastAPI.

Ce module expose une instance de SQLAlchemy ``engine`` ainsi qu’un
gestionnaire de session (``SessionLocal``) et une dépendance FastAPI
``get_db`` pour injecter la session dans les routes. Les informations de
connexion sont chargées à partir des variables d’environnement (ou du
fichier ``.env`` en utilisant ``python-dotenv`` si nécessaire).
"""

from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL")
# Fallback SQLite en développement si aucune URL n'est fournie
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./ia_crm_dev.db"

engine_kwargs = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dépendance FastAPI pour obtenir une session de base de données."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
