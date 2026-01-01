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


class ClientCreate(ClientBase):
    pass


class ClientRead(ClientBase):
    id: int

    class Config:
        orm_mode = True


# --- Product ---

class ProductBase(BaseModel):
    product_key: str
    name: str
    family: Optional[str] = None
    price: Optional[float] = None
    margin: Optional[float] = None
    global_popularity_score: Optional[float] = None
    description: Optional[str] = None
    tenant_id: int


class ProductCreate(ProductBase):
    pass


class ProductRead(ProductBase):
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


# --- Recommendation ---

class RecommendationBase(BaseModel):
    client_code: str
    product_key: str
    score: float
    scenario: Optional[str] = None
    tenant_id: int


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