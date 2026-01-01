"""
Définition des modèles SQLAlchemy pour le backend ia‑crm.

Les modèles suivent une approche multi‑tenant : chaque enregistrement porte
un attribut ``tenant_id`` qui permet d’isoler logiquement les données.
"""

from __future__ import annotations

import datetime as dt
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship

from .database import Base


class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    domain = Column(String, unique=True, nullable=True)  # domaine personnalisé (ex: aubach.fr)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    users = relationship("User", back_populates="tenant")

    def __repr__(self) -> str:
        return f"<Tenant {self.name}>"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    tenant = relationship("Tenant", back_populates="users")

    def __repr__(self) -> str:
        return f"<User {self.username}@{self.tenant_id}>"


class Client(Base):
    """
    Table des clients.

    En plus des informations de base (code, nom, e‑mail), cette table
    stocke un certain nombre de champs calculés afin de faciliter les
    analyses et les moteurs de recommandations. Ces champs sont mis à
    jour par des services dédiés (voir rfm_service et preference_service).

    * ``last_purchase_date`` : date de la dernière commande du client.
    * ``total_spent`` : montant total dépensé par le client (somme des
      montants des ventes).
    * ``total_orders`` : nombre total de commandes passées (comptage
      distinct des numéros de facture ou document_id).
    * ``average_order_value`` : panier moyen (total_spent / total_orders).
    * ``recency`` ``frequency`` ``monetary`` : composantes RFM
      normalisées pour ce client.
    * ``rfm_score`` : score composite sur 1‑5 (5 étant meilleur) calculé
      à partir de recency, frequency et monetary.
    * ``rfm_segment`` : segment RFM associé (Champions, Loyal,
      Promising, At Risk, etc.).
    * ``preferred_families`` : JSON text contenant les familles de
      produits préférées du client (top 2 familles).
    * ``budget_band`` : bande de budget (Low, Medium, High) estimée
      selon le panier moyen.
    * ``aroma_profile`` : JSON text représentant le profil sensoriel
      calculé pour le client (facultatif).
    * ``cluster`` : étiquette de cluster attribuée par un algorithme de
      segmentation.
    """

    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String, unique=False, index=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    last_purchase_date = Column(DateTime, nullable=True)
    total_spent = Column(Float, default=0.0)
    total_orders = Column(Integer, default=0)
    average_order_value = Column(Float, default=0.0)
    recency = Column(Float, default=0.0)
    frequency = Column(Float, default=0.0)
    monetary = Column(Float, default=0.0)
    rfm_score = Column(Integer, default=0)
    rfm_segment = Column(String, nullable=True)
    preferred_families = Column(Text, nullable=True)
    budget_band = Column(String, nullable=True)
    aroma_profile = Column(Text, nullable=True)
    cluster = Column(String, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Client {self.client_code}>"


class Product(Base):
    """
    Table des produits.

    Un produit est identifié par son ``product_key`` (identifiant
    normalisé) et possède des attributs supplémentaires destinés au
    moteur de recommandation :

    * ``family`` : famille ou catégorie du produit.
    * ``price`` : prix TTC moyen observé (en euros).
    * ``margin`` : marge unitaire estimée.
    * ``global_popularity_score`` : score de popularité global calculé
      à partir de l'historique des ventes (plus il est élevé, plus le
      produit est populaire).

    Ces champs sont optionnels lors de l’insertion, mais peuvent être
    mis à jour par des scripts d’enrichissement.
    """

    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    product_key = Column(String, unique=False, index=True)
    name = Column(String, nullable=False)
    family = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    margin = Column(Float, nullable=True)
    global_popularity_score = Column(Float, default=0.0)
    description = Column(Text, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Product {self.product_key}>"


class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String, index=True)
    # Foreign key referencing Product.product_key (not an FK constraint for flexibility)
    product_key = Column(String, index=True)
    client_code = Column(String, index=True)
    quantity = Column(Float, nullable=True)
    amount = Column(Float, nullable=True)
    sale_date = Column(DateTime, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Sale {self.document_id} - {self.product_key}>"


class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String, index=True)
    product_key = Column(String, index=True)
    score = Column(Float, default=0.0)
    scenario = Column(String, nullable=True)  # winback, cross-sell, etc.
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Reco {self.client_code}->{self.product_key} ({self.score:.2f})>"


class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    scheduled_at = Column(DateTime, nullable=True)
    status = Column(String, default="draft")  # draft, scheduled, sent, etc.
    template_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Campaign {self.name} ({self.status})>"


class AuditLog(Base):
    """
    Journal des audits de qualité des données.

    Chaque audit enregistre le nombre d’erreurs et d’avertissements
    détectés, le score global, un message descriptif et la date
    d’exécution. Ces informations servent à documenter la qualité
    globale des données et à identifier les lots problématiques.
    """

    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    executed_at = Column(DateTime, default=dt.datetime.utcnow)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    errors = Column(Integer, default=0)
    warnings = Column(Integer, default=0)
    score = Column(Float, default=100.0)
    details = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<AuditLog {self.executed_at} score={self.score}>"