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