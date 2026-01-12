"""
Schémas Pydantic pour la sérialisation et validation des données API.

Les schémas sont séparés en classes de base (B) utilisées pour créer ou
mettre à jour les objets, et en classes de lecture (R) retournées par l’API.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter, field_validator


# --- Tenant ---

class TenantBase(BaseModel):
    name: str
    domain: Optional[str] = None


class TenantCreate(TenantBase):
    pass


class TenantRead(TenantBase):
    id: int
    created_at: dt.datetime

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# --- Client ---

class ClientBase(BaseModel):
    client_code: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    tenant_id: int
    visibility: Optional[Literal["private", "tenant"]] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    tags: Optional[str] = None
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


class ClientCreate(BaseModel):
    client_code: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    visibility: Optional[Literal["private", "tenant"]] = None
    tenant_id: Optional[int] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    tags: Optional[str] = None


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
    visibility: Optional[Literal["private", "tenant"]] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    tags: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClientRead(ClientBase):
    email: Optional[str] = None
    id: int
    owner_user_id: Optional[int] = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned == "":
                return None
            try:
                return TypeAdapter(EmailStr).validate_python(cleaned)
            except Exception:
                return None
        return None

    model_config = ConfigDict(from_attributes=True)



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
    visibility: Optional[Literal["private", "tenant"]] = None
    custom_characteristics: Optional[dict[str, Any]] = None


class ProductCreate(BaseModel):
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
    visibility: Optional[Literal["private", "tenant"]] = None
    tenant_id: Optional[int] = None
    custom_characteristics: Optional[dict[str, Any]] = None

    @field_validator("custom_characteristics", mode="before")
    @classmethod
    def parse_custom_characteristics(cls, value: object) -> Optional[dict[str, Any]]:
        if value is None:
            return None
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        if isinstance(value, dict):
            return value
        return None


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
    visibility: Optional[Literal["private", "tenant"]] = None
    custom_characteristics: Optional[dict[str, Any]] = None

    @field_validator("custom_characteristics", mode="before")
    @classmethod
    def parse_custom_characteristics(cls, value: object) -> Optional[dict[str, Any]]:
        if value is None:
            return None
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        if isinstance(value, dict):
            return value
        return None

    model_config = ConfigDict(from_attributes=True)


class ProductRead(ProductBase):
    id: int
    owner_user_id: Optional[int] = None
    custom_characteristics: Optional[dict[str, Any]] = None

    @field_validator("custom_characteristics", mode="before")
    @classmethod
    def parse_custom_characteristics(cls, value: object) -> dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return {}
        return {}

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
    tenant_id: Optional[int] = None


class SaleCreate(SaleBase):
    pass


class SaleRead(SaleBase):
    id: int
    tenant_id: int
    created_by_user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ClientKPIs(BaseModel):
    last_purchase_date: Optional[dt.datetime] = None
    total_spent: Optional[float] = None
    total_orders: Optional[int] = None
    average_order_value: Optional[float] = None
    recency: Optional[float] = None
    frequency: Optional[float] = None
    monetary: Optional[float] = None
    rfm_score: Optional[int] = None
    rfm_segment: Optional[str] = None


class ClientProfile(BaseModel):
    client: ClientRead
    latest_sales: list[SaleRead]
    kpis: ClientKPIs
    notes: list["ClientNoteRead"]

    model_config = ConfigDict(from_attributes=True)


class ClientNoteBase(BaseModel):
    title: Optional[str] = None
    body: str


class ClientNoteCreate(ClientNoteBase):
    pass


class ClientNoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None


class ClientNoteRead(ClientNoteBase):
    id: int
    client_code: str
    created_by_user_id: Optional[int] = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = ConfigDict(from_attributes=True)


class TasteDimensionBase(BaseModel):
    key: str
    label: Optional[str] = None
    weight: float = 1.0
    is_active: bool = True


class TasteDimensionCreate(TasteDimensionBase):
    pass


class TasteDimensionUpdate(BaseModel):
    label: Optional[str] = None
    weight: Optional[float] = None
    is_active: Optional[bool] = None


class TasteDimensionRead(TasteDimensionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# --- RecoRun & Reco Outputs ---

class RecoRunBase(BaseModel):
    run_id: Optional[str] = None
    started_at: Optional[dt.datetime] = None
    finished_at: Optional[dt.datetime] = None
    executed_at: Optional[dt.datetime] = None
    dataset_version: Optional[str] = None
    config_hash: Optional[str] = None
    code_version: Optional[str] = None
    status: Optional[str] = None
    tenant_id: int


class RecoRunCreate(RecoRunBase):
    pass


class RunSummaryRead(BaseModel):
    run_id: str
    summary_json: Optional[str] = None
    tenant_id: int

    model_config = ConfigDict(from_attributes=True)


class RecoRunRead(RecoRunBase):
    id: int
    summary: Optional[RunSummaryRead] = None

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class RecoOutputBase(BaseModel):
    run_id: str
    customer_code: str
    scenario: Optional[str] = None
    rank: Optional[int] = None
    product_key: str
    score: Optional[float] = None
    explain_short: Optional[str] = None
    reasons_json: Optional[str] = None
    tenant_id: int


class RecoOutputRead(RecoOutputBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class AuditOutputBase(BaseModel):
    run_id: str
    customer_code: str
    severity: str
    rule_code: str
    details_json: Optional[str] = None
    tenant_id: int


class AuditOutputRead(AuditOutputBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class NextActionOutputBase(BaseModel):
    run_id: str
    customer_code: str
    eligible: bool
    reason: Optional[str] = None
    scenario: Optional[str] = None
    audit_score: Optional[float] = None
    tenant_id: int


class NextActionOutputRead(NextActionOutputBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class RecoRunDetail(BaseModel):
    run: RecoRunRead
    summary: Optional[dict] = None
    next_actions: list[NextActionOutputRead] = []
    top_audit: list[AuditOutputRead] = []


# --- Brevo ---

class BrevoLogRead(BaseModel):
    id: int
    run_id: Optional[str] = None
    batch_id: Optional[str] = None
    action: str
    payload_redacted: Optional[str] = None
    status: str
    created_at: Optional[dt.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ContactHistoryRead(BaseModel):
    id: int
    customer_code: str
    last_contact_at: dt.datetime
    channel: Optional[str] = None
    status: Optional[str] = None
    meta: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RecoOutputBase(BaseModel):
    run_id: str
    customer_code: str
    scenario: Optional[str] = None
    rank: Optional[int] = None
    product_key: str
    score: Optional[float] = None
    explain_short: Optional[str] = None
    reasons_json: Optional[str] = None
    tenant_id: int


class RecoOutputRead(RecoOutputBase):
    id: int

    class Config:
        orm_mode = True


class AuditOutputBase(BaseModel):
    run_id: str
    customer_code: str
    severity: str
    rule_code: str
    details_json: Optional[str] = None
    tenant_id: int


class AuditOutputRead(AuditOutputBase):
    id: int

    class Config:
        orm_mode = True


class NextActionOutputBase(BaseModel):
    run_id: str
    customer_code: str
    eligible: bool
    reason: Optional[str] = None
    scenario: Optional[str] = None
    audit_score: Optional[float] = None
    tenant_id: int


class NextActionOutputRead(NextActionOutputBase):
    id: int

    class Config:
        orm_mode = True


class RecoRunDetail(BaseModel):
    run: RecoRunRead
    summary: Optional[dict] = None
    next_actions: list[NextActionOutputRead] = []
    top_audit: list[AuditOutputRead] = []


# --- Brevo ---

class BrevoLogRead(BaseModel):
    id: int
    run_id: Optional[str] = None
    batch_id: Optional[str] = None
    action: str
    payload_redacted: Optional[str] = None
    status: str
    created_at: Optional[dt.datetime] = None

    class Config:
        orm_mode = True


class ContactHistoryRead(BaseModel):
    id: int
    customer_code: str
    last_contact_at: dt.datetime
    channel: Optional[str] = None
    status: Optional[str] = None
    meta: Optional[str] = None

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

    model_config = ConfigDict(from_attributes=True)


class RecommendationExplain(BaseModel):
    taste_score: float
    margin_boost: float
    popularity_boost: float
    seasonality_boost: float
    scenario_adjustment: float


class RecommendationComputed(BaseModel):
    product_key: str
    score: float
    scenario: Optional[str] = None
    explain: RecommendationExplain


class RecommendationUpdate(BaseModel):
    is_approved: bool


class RecommendationRunRequest(BaseModel):
    scenario: Literal["cross-sell", "rebuy", "winback"]
    limit: int = 20


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# ------------------ Aliases ------------------

class ProductAliasBase(BaseModel):
    """Base model pour les alias produits."""

    label_norm: str
    product_key: str
    tenant_id: Optional[int] = None
    label_raw: Optional[str] = None
    confidence: Optional[float] = 1.0
    source: Optional[str] = "manual"


class ProductAliasCreate(ProductAliasBase):
    """Schéma pour créer un nouvel alias de produit."""

    tenant_id: Optional[int] = None


class ProductAliasUpdate(BaseModel):
    """Schéma pour mettre à jour un alias de produit."""

    label_norm: Optional[str] = None
    product_key: Optional[str] = None
    label_raw: Optional[str] = None
    confidence: Optional[float] = None
    source: Optional[str] = None


class ProductAliasRead(ProductAliasBase):
    """Schéma de lecture pour un alias de produit."""

    id: int
    tenant_id: int
    created_at: Optional[dt.datetime] = None
    updated_at: Optional[dt.datetime] = None

    class Config:
        orm_mode = True
