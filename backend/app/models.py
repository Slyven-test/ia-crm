"""
Définition des modèles SQLAlchemy pour le backend ia‑crm.

Les modèles suivent une approche multi‑tenant : chaque enregistrement porte
un attribut ``tenant_id`` qui permet d’isoler logiquement les données.
"""

from __future__ import annotations

import datetime as dt
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, UniqueConstraint
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
    last_contact_date = Column(DateTime, nullable=True)
    email_opt_out = Column(Boolean, default=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Client {self.client_code}>"


class Product(Base):
    """
    Table des produits enrichie.

    Chaque produit est identifié par une clé ``product_key`` et peut
    contenir de nombreuses informations utiles au moteur de
    recommandation. Les champs suivants correspondent aux directives
    décrites dans la documentation CRM :

    * ``family_crm`` : famille CRM normalisée (ex. Blanc, Rouge, Rosé).
    * ``sub_family`` : sous‑famille ou type (ex. Alsace, Bordeaux).
    * ``cepage`` : cépage principal (optionnel).
    * ``sucrosite_niveau`` : niveau de sucrosité (sec, demi‑sec…).
    * ``price_ttc`` : prix TTC moyen observé.
    * ``margin`` : marge unitaire estimée.
    * ``premium_tier`` : niveau premium (entrée de gamme, moyen, haut de gamme).
    * ``price_band`` : bande de prix catégorisée (Low/Medium/High).
    * ``aroma_fruit`` … ``aroma_tannin`` : intensités aromatiques (1..5) sur 7 axes.
    * ``global_popularity_score`` : score de popularité global (0..1).
    * ``is_active`` et ``is_archived`` : pour masquer des produits.
    * ``season_tags`` : étiquette de saisonnalité (printemps, hiver, etc.).

    Ces attributs permettent de filtrer et scorer les recommandations. Ils
    sont optionnels et peuvent être complétés à posteriori via le tableau
    de bord.
    """

    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    product_key = Column(String, unique=False, index=True)
    name = Column(String, nullable=False)
    family_crm = Column(String, nullable=True)
    sub_family = Column(String, nullable=True)
    cepage = Column(String, nullable=True)
    sucrosite_niveau = Column(String, nullable=True)
    price_ttc = Column(Float, nullable=True)
    margin = Column(Float, nullable=True)
    premium_tier = Column(String, nullable=True)
    price_band = Column(String, nullable=True)
    aroma_fruit = Column(Float, nullable=True)
    aroma_floral = Column(Float, nullable=True)
    aroma_spice = Column(Float, nullable=True)
    aroma_mineral = Column(Float, nullable=True)
    aroma_acidity = Column(Float, nullable=True)
    aroma_body = Column(Float, nullable=True)
    aroma_tannin = Column(Float, nullable=True)
    global_popularity_score = Column(Float, default=0.0)
    season_tags = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
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
    # Indicateur de validation manuelle de la recommandation
    is_approved = Column(Boolean, default=False)

    def __repr__(self) -> str:
        return f"<Reco {self.client_code}->{self.product_key} ({self.score:.2f})>"


# --- Additional domain models for advanced CRM ---

class ProductAlias(Base):
    """
    Mapping entre un label de produit brut et la clé ``product_key``.

    Les labels sont normalisés (minuscules, accents/ponctuation retirés).
    Un alias est propre à un tenant et peut provenir de différentes
    sources (ingestion automatique, saisie manuelle).
    """

    __tablename__ = "product_alias"
    id = Column(Integer, primary_key=True, index=True)
    label_raw = Column(String, nullable=True)
    label_norm = Column(String, index=True)
    product_key = Column(String, ForeignKey("products.product_key"), nullable=False)
    confidence = Column(Float, default=1.0)
    source = Column(String, default="manual")
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "label_norm", name="uq_product_alias_label_tenant"),
    )

    def __repr__(self) -> str:
        return f"<Alias {self.label_norm}->{self.product_key}>"


class Order(Base):
    """
    Représente une commande réalisée par un client.

    Une commande contient un ou plusieurs éléments ``OrderItem``. Cette
    table sert à calculer les indicateurs RFM et à agréger les ventes à
    un niveau supérieur.
    """

    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    total_amount = Column(Float, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    status = Column(String, default="completed")
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    client = relationship("Client")
    items = relationship("OrderItem", back_populates="order")

    def __repr__(self) -> str:
        return f"<Order {self.id} for client {self.client_id}>"


class OrderItem(Base):
    """
    Élément de commande représentant l'achat d'un produit spécifique.
    """

    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, nullable=True)
    unit_price = Column(Float, nullable=True)
    total_price = Column(Float, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")

    def __repr__(self) -> str:
        return f"<OrderItem {self.product_id} x {self.quantity}>"


class ContactEvent(Base):
    """
    Historique des contacts marketing avec les clients.

    Utilisé pour appliquer la fenêtre de silence et éviter les
    communications trop fréquentes. Le champ ``status`` peut contenir
    delivered, open, click, bounce, unsubscribe.
    """

    __tablename__ = "contact_events"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    contact_date = Column(DateTime, default=dt.datetime.utcnow)
    channel = Column(String, nullable=True)
    status = Column(String, nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    client = relationship("Client")
    campaign = relationship("Campaign")

    def __repr__(self) -> str:
        return f"<ContactEvent {self.client_id} on {self.contact_date}>"


class RecoRun(Base):
    """
    Métadonnées pour un cycle de génération de recommandations.

    Chaque fois que le moteur exécute un run, cette table stocke les
    informations permettant de tracer les versions de données et de
    configurations utilisées.
    """

    __tablename__ = "reco_runs"
    id = Column(Integer, primary_key=True, index=True)
    executed_at = Column(DateTime, default=dt.datetime.utcnow)
    dataset_version = Column(String, nullable=True)
    config_hash = Column(String, nullable=True)
    code_version = Column(String, nullable=True)
    status = Column(String, default="completed")
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    items = relationship("RecoItem", back_populates="run")

    def __repr__(self) -> str:
        return f"<RecoRun {self.id} at {self.executed_at}>"


class RecoItem(Base):
    """
    Recommandation individuelle générée lors d'un run.
    Conserve le client, le produit recommandé et des métadonnées sur la
    recommandation (scénario, rang, score, explications).
    """

    __tablename__ = "reco_items"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("reco_runs.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    scenario = Column(String, nullable=True)
    rank = Column(Integer, nullable=True)
    score = Column(Float, nullable=True)
    explain_short = Column(String, nullable=True)
    reasons_json = Column(Text, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    run = relationship("RecoRun", back_populates="items")
    client = relationship("Client")
    product = relationship("Product")

    def __repr__(self) -> str:
        return f"<RecoItem {self.client_id}->{self.product_id} rank={self.rank}>"


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


# --- Configuration settings ---

class ConfigSetting(Base):
    """
    Table pour stocker les paramètres de configuration par tenant.

    Chaque entrée est identifiée par une clé et contient une valeur sérialisée
    (chaîne ou JSON) ainsi qu'une description facultative. La combinaison
    (tenant_id, key) doit être unique afin qu'un même locataire ne puisse
    définir deux fois la même clé.
    """

    __tablename__ = "config_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uix_tenant_key"),)

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<ConfigSetting {self.tenant_id}:{self.key}>"
