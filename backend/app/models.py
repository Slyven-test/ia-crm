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
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String, unique=False, index=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Client {self.client_code}>"


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    # Normalised product identifier (accent‑stripped, lower case)
    product_key = Column(String, unique=False, index=True)
    name = Column(String, nullable=False)
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