"""
Schémas Pydantic pour la sérialisation et validation des données API.

Les schémas sont séparés en classes de base (B) utilisées pour créer ou
mettre à jour les objets, et en classes de lecture (R) retournées par l’API.
"""

from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# --- Tenant ---

class TenantBase(BaseModel):
    name: str
    domain: Optional[str] = None


class TenantCreate(TenantBase):
    pass


class TenantRead(TenantBase):
    id: int
    created_at: dt.datetime

    class Config:
        orm_mode = True


# --- User ---

class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False
    tenant_id: int


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserRead(UserBase):
    id: int

    class Config:
        orm_mode = True


# --- Client ---

class ClientBase(BaseModel):
    client_code: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    tenant_id: int
    # Champs calculés optionnels (exposés uniquement en lecture)
    last_purchase_date: Optional[dt.datetime] = None
    total_spent: Optional[float] = None
    total_orders: Optional[int] = None
    average_order_value: Optional[float] = None
    recency: Optional[float] = None
    frequency: Optional[float] = None
    monetary: Optional[float] = None
    rfm_score: Optional[int] = None
    rfm_segment: Optional[str] = None
    preferred_families: Optional[str] = None
    budget_band: Optional[str] = None
    aroma_profile: Optional[str] = None
    cluster: Optional[str] = None
    last_contact_date: Optional[dt.datetime] = None
    email_opt_out: Optional[bool] = False


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    """Schéma pour mettre à jour un client existant.

    Tous les champs sont optionnels afin de permettre des mises à jour partielles.
    Le champ ``tenant_id`` n'est pas modifiable via cette API.
    """

    name: Optional[str] = None
    email: Optional[EmailStr] = None
    last_contact_date: Optional[dt.datetime] = None
    email_opt_out: Optional[bool] = None
    preferred_families: Optional[str] = None
    budget_band: Optional[str] = None
    aroma_profile: Optional[str] = None
    cluster: Optional[str] = None

    class Config:
        orm_mode = True


class ClientRead(ClientBase):
    id: int

    class Config:
        orm_mode = True


# --- Product ---

class ProductBase(BaseModel):
    product_key: str
    name: str
    family_crm: Optional[str] = None
    sub_family: Optional[str] = None
    cepage: Optional[str] = None
    sucrosite_niveau: Optional[str] = None
    price_ttc: Optional[float] = None
    margin: Optional[float] = None
    premium_tier: Optional[str] = None
    price_band: Optional[str] = None
    aroma_fruit: Optional[float] = None
    aroma_floral: Optional[float] = None
    aroma_spice: Optional[float] = None
    aroma_mineral: Optional[float] = None
    aroma_acidity: Optional[float] = None
    aroma_body: Optional[float] = None
    aroma_tannin: Optional[float] = None
    global_popularity_score: Optional[float] = None
    season_tags: Optional[str] = None
    is_active: Optional[bool] = True
    is_archived: Optional[bool] = False
    description: Optional[str] = None
    tenant_id: int


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    """Schéma pour mettre à jour un produit existant.

    Permet de modifier partiellement les attributs d'un produit. Le ``tenant_id`` et
    la ``product_key`` ne sont pas modifiables via cette API.
    """

    name: Optional[str] = None
    family_crm: Optional[str] = None
    sub_family: Optional[str] = None
    cepage: Optional[str] = None
    sucrosite_niveau: Optional[str] = None
    price_ttc: Optional[float] = None
    margin: Optional[float] = None
    premium_tier: Optional[str] = None
    price_band: Optional[str] = None
    aroma_fruit: Optional[float] = None
    aroma_floral: Optional[float] = None
    aroma_spice: Optional[float] = None
    aroma_mineral: Optional[float] = None
    aroma_acidity: Optional[float] = None
    aroma_body: Optional[float] = None
    aroma_tannin: Optional[float] = None
    global_popularity_score: Optional[float] = None
    season_tags: Optional[str] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None
    description: Optional[str] = None

    class Config:
        orm_mode = True


class ProductRead(ProductBase):
    id: int

    class Config:
        orm_mode = True


# --- ProductAlias ---

class ProductAliasBase(BaseModel):
    label_norm: str
    product_key: str
    tenant_id: int


class ProductAliasCreate(ProductAliasBase):
    pass


class ProductAliasRead(ProductAliasBase):
    id: int

    class Config:
        orm_mode = True


# --- Sale ---

class SaleBase(BaseModel):
    document_id: str
    product_key: str
    client_code: str
    quantity: Optional[float] = None
    amount: Optional[float] = None
    sale_date: Optional[dt.datetime] = None
    tenant_id: int


class SaleCreate(SaleBase):
    pass


class SaleRead(SaleBase):
    id: int

    class Config:
        orm_mode = True


# --- SaleUpdate ---

class SaleUpdate(BaseModel):
    """Schéma pour la mise à jour partielle d'une vente.

    Tous les champs sont optionnels pour permettre des mises à jour
    partielles. Le ``tenant_id`` et l'identifiant de vente ne sont pas
    modifiables via cette API.
    """
    document_id: Optional[str] = None
    product_key: Optional[str] = None
    client_code: Optional[str] = None
    quantity: Optional[float] = None
    amount: Optional[float] = None
    sale_date: Optional[dt.datetime] = None


# --- Order & OrderItem ---

class OrderItemBase(BaseModel):
    product_id: int
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    tenant_id: int


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemRead(OrderItemBase):
    id: int
    order_id: int

    class Config:
        orm_mode = True


class OrderBase(BaseModel):
    client_id: int
    total_amount: Optional[float] = None
    created_at: Optional[dt.datetime] = None
    status: Optional[str] = None
    tenant_id: int


class OrderCreate(OrderBase):
    items: list[OrderItemCreate]


class OrderRead(OrderBase):
    id: int
    items: list[OrderItemRead]

    class Config:
        orm_mode = True


# --- ContactEvent ---

class ContactEventBase(BaseModel):
    client_id: int
    contact_date: Optional[dt.datetime] = None
    channel: Optional[str] = None
    status: Optional[str] = None
    campaign_id: Optional[int] = None
    tenant_id: int


class ContactEventCreate(ContactEventBase):
    pass


class ContactEventRead(ContactEventBase):
    id: int

    class Config:
        orm_mode = True


# --- RecoRun & RecoItem ---

class RecoRunBase(BaseModel):
    executed_at: Optional[dt.datetime] = None
    dataset_version: Optional[str] = None
    config_hash: Optional[str] = None
    code_version: Optional[str] = None
    status: Optional[str] = None
    tenant_id: int


class RecoRunCreate(RecoRunBase):
    pass


class RecoRunRead(RecoRunBase):
    id: int

    class Config:
        orm_mode = True


class RecoItemBase(BaseModel):
    run_id: int
    client_id: int
    product_id: int
    scenario: Optional[str] = None
    rank: Optional[int] = None
    score: Optional[float] = None
    explain_short: Optional[str] = None
    reasons_json: Optional[str] = None
    tenant_id: int


class RecoItemCreate(RecoItemBase):
    pass


class RecoItemRead(RecoItemBase):
    id: int

    class Config:
        orm_mode = True


# --- Recommendation ---

class RecommendationBase(BaseModel):
    client_code: str
    product_key: str
    score: float
    scenario: Optional[str] = None
    tenant_id: int
    is_approved: Optional[bool] = False


class RecommendationCreate(RecommendationBase):
    pass


class RecommendationRead(RecommendationBase):
    id: int
    created_at: dt.datetime

    class Config:
        orm_mode = True


# --- Campaign ---

class CampaignBase(BaseModel):
    name: str
    scheduled_at: Optional[dt.datetime] = None
    status: Optional[str] = "draft"
    template_id: Optional[str] = None
    tenant_id: int


class CampaignCreate(CampaignBase):
    pass


class CampaignRead(CampaignBase):
    id: int
    created_at: dt.datetime

    class Config:
        orm_mode = True


# --- AuditLog ---

class AuditLogBase(BaseModel):
    executed_at: dt.datetime
    errors: int
    warnings: int
    score: float
    details: Optional[str] = None
    tenant_id: int


class AuditLogRead(AuditLogBase):
    id: int

    class Config:
        orm_mode = True


# --- ConfigSetting ---

class ConfigSettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class ConfigSettingCreate(ConfigSettingBase):
    """Schéma utilisé pour créer un paramètre de configuration."""
    pass


class ConfigSettingUpdate(BaseModel):
    """Schéma pour mettre à jour un paramètre de configuration existant.

    Tous les champs sont optionnels afin de permettre des mises à jour partielles.
    """

    value: Optional[str] = None
    description: Optional[str] = None


class ConfigSettingRead(ConfigSettingBase):
    id: int
    tenant_id: int

    class Config:
        orm_mode = True