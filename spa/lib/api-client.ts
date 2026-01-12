import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type UnknownRecord = Record<string, unknown>;

export type ClientRecord = UnknownRecord & {
  client_code: string;
  name?: string;
  email?: string;
  total_orders?: number;
  total_spent?: number;
  recency?: number;
  rfm_segment?: string;
  visibility?: string;
  owner?: string;
  preferred_families?: string;
  budget_band?: string;
  aroma_profile?: string;
};

export type ProductRecord = UnknownRecord & {
  product_key: string;
  name?: string;
  price_ttc?: number;
  margin?: number;
  season_tags?: string;
  visibility?: string;
  family_crm?: string;
  sub_family?: string;
  cepage?: string;
  sucrosite_niveau?: string;
  price_band?: string;
  premium_tier?: string;
  description?: string;
  aroma_fruit?: number;
  aroma_floral?: number;
  aroma_spice?: number;
  aroma_mineral?: number;
  aroma_acidity?: number;
  aroma_body?: number;
  aroma_tannin?: number;
};

export type SaleCreatePayload = {
  document_id?: string;
  product_key: string;
  client_code: string;
  quantity?: number;
  amount?: number;
  sale_date?: string;
};

export type TasteDimensionRecord = UnknownRecord & {
  id?: number | string;
  key?: string;
  label?: string;
  weight?: number;
  is_active?: boolean;
  name?: string;
};

export type RecommendationRecord = UnknownRecord & {
  id?: number | string;
  client_code?: string;
  product_key?: string;
  is_approved?: boolean;
  score?: number;
  scenario?: string;
  created_at?: string;
  taste_score?: number;
  boosts?: UnknownRecord;
  scenario_adjustment?: UnknownRecord;
};

type ClientListParams = {
  search?: string;
  limit?: number;
  offset?: number;
};

type ProductListParams = {
  search?: string;
  limit?: number;
  offset?: number;
};

const ensureTrailingSlash = (path: string) =>
  path.endsWith("/") ? path : `${path}/`;

const buildQueryParams = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
};

export const normalizeApiError = (error: unknown, fallback?: string) =>
  getApiErrorMessage(error, fallback);

export async function listClients(
  params: ClientListParams = {}
): Promise<ClientRecord[]> {
  const query = buildQueryParams({
    search: params.search?.trim() || undefined,
    limit: params.limit,
    offset: params.offset,
  });
  return apiRequest<ClientRecord[]>(
    `${ensureTrailingSlash(endpoints.clients.list)}${query}`
  );
}

export async function getClient(clientCode: string): Promise<ClientRecord> {
  return apiRequest<ClientRecord>(endpoints.clients.detail(clientCode));
}

export async function createClient(
  payload: ClientRecord
): Promise<ClientRecord> {
  return apiRequest<ClientRecord>(endpoints.clients.create, {
    method: "POST",
    body: payload,
  });
}

export async function updateClient(
  clientCode: string,
  payload: UnknownRecord
): Promise<ClientRecord> {
  return apiRequest<ClientRecord>(endpoints.clients.update(clientCode), {
    method: "PUT",
    body: payload,
  });
}

export async function listProducts(): Promise<ProductRecord[]> {
  return apiRequest<ProductRecord[]>(ensureTrailingSlash(endpoints.products.list));
}

export async function listProductsWithParams(
  params: ProductListParams = {}
): Promise<ProductRecord[]> {
  const query = buildQueryParams({
    search: params.search?.trim() || undefined,
    limit: params.limit,
    offset: params.offset,
  });
  return apiRequest<ProductRecord[]>(
    `${ensureTrailingSlash(endpoints.products.list)}${query}`
  );
}

export async function getProduct(productKey: string): Promise<ProductRecord> {
  return apiRequest<ProductRecord>(endpoints.products.detail(productKey));
}

export async function createProduct(
  payload: ProductRecord
): Promise<ProductRecord> {
  return apiRequest<ProductRecord>(endpoints.products.create, {
    method: "POST",
    body: payload,
  });
}

export async function updateProduct(
  productKey: string,
  payload: UnknownRecord
): Promise<ProductRecord> {
  return apiRequest<ProductRecord>(endpoints.products.update(productKey), {
    method: "PUT",
    body: payload,
  });
}

export async function createManualSale(
  payload: SaleCreatePayload
): Promise<UnknownRecord> {
  return apiRequest<UnknownRecord>(endpoints.sales.create, {
    method: "POST",
    body: payload,
  });
}

export async function listTasteDimensions(): Promise<TasteDimensionRecord[]> {
  return apiRequest<TasteDimensionRecord[]>(
    ensureTrailingSlash(endpoints.tasteDimensions.list)
  );
}

export async function createTasteDimension(
  payload: TasteDimensionRecord
): Promise<TasteDimensionRecord> {
  return apiRequest<TasteDimensionRecord>(endpoints.tasteDimensions.create, {
    method: "POST",
    body: payload,
  });
}

export async function updateTasteDimension(
  dimensionId: string | number,
  payload: UnknownRecord
): Promise<TasteDimensionRecord> {
  return apiRequest<TasteDimensionRecord>(
    endpoints.tasteDimensions.update(dimensionId),
    {
      method: "PUT",
      body: payload,
    }
  );
}

export async function runRecommendationsForClient(
  clientCode: string,
  params: { scenario?: string; limit?: number } = {}
): Promise<RecommendationRecord[]> {
  return apiRequest<RecommendationRecord[]>(
    endpoints.recommendationsV2.runByClient(clientCode),
    {
      method: "POST",
      body: {
        scenario: params.scenario,
        limit: params.limit,
      },
    }
  );
}

export async function listRecommendationsByClient(
  clientCode: string
): Promise<RecommendationRecord[]> {
  return apiRequest<RecommendationRecord[]>(
    endpoints.recommendationsV2.byClient(clientCode)
  );
}

export async function listRecommendations(): Promise<RecommendationRecord[]> {
  return apiRequest<RecommendationRecord[]>(
    ensureTrailingSlash(endpoints.recommendationsV2.list)
  );
}

export async function listRecommendationsWithParams(params: {
  scenario?: string;
  approved_only?: boolean;
  client_code?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<RecommendationRecord[]> {
  const query = buildQueryParams({
    scenario: params.scenario?.trim() || undefined,
    approved_only:
      typeof params.approved_only === "boolean"
        ? String(params.approved_only)
        : undefined,
    client_code: params.client_code?.trim() || undefined,
    limit: params.limit,
    offset: params.offset,
  });
  return apiRequest<RecommendationRecord[]>(
    `${ensureTrailingSlash(endpoints.recommendationsV2.list)}${query}`
  );
}

export async function updateRecommendationApproval(
  recommendationId: string | number,
  isApproved: boolean
): Promise<RecommendationRecord> {
  return apiRequest<RecommendationRecord>(
    endpoints.recommendationsV2.update(recommendationId),
    {
      method: "PATCH",
      body: { is_approved: isApproved },
    }
  );
}
