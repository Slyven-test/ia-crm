export const endpoints = {
  auth: {
    me: "/auth/me",
    token: "/auth/token",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    register: "/auth/register",
  },
  clients: {
    list: "/clients/",
    detail: (clientCode: string) => `/clients/${clientCode}`,
  },
  products: {
    list: "/products/",
    detail: (productKey: string) => `/products/${productKey}`,
  },
  recommendations: {
    list: "/recommendations/",
    byClient: (clientCode: string) => `/recommendations/client/${clientCode}`,
    generate: "/recommendations/generate",
    approve: "/recommendations/approve",
  },
  recoRuns: {
    list: "/reco-runs/",
    items: (runId: string | number) => `/reco-runs/${runId}/items`,
  },
  analytics: {
    overview: "/analytics/overview",
    outcomes: "/analytics/outcomes",
    salesTrend: "/analytics/sales-trend",
  },
  sales: {
    customerHistory: (clientCode: string) => `/sales/customer/${clientCode}`,
  },
  audit: {
    latest: "/audit/latest",
    logs: "/audit/logs",
    run: "/audit/run",
  },
  clusters: {
    list: "/clusters/",
    recompute: "/clusters/recompute",
  },
  rfm: {
    run: "/rfm/run",
    distribution: "/rfm/distribution",
  },
  config: {
    list: "/config/",
    update: (key: string) => `/config/${key}`,
  },
  contacts: {
    list: "/contacts/",
  },
  profiles: {
    list: "/profiles/",
    detail: (clientCode: string) => `/profiles/${clientCode}`,
    recalculate: "/profiles/recalculate",
  },
  campaigns: {
    create: "/campaigns/",
    preview: "/campaigns/preview",
    send: "/campaigns/send",
    sendById: (campaignId: string | number) => `/campaigns/${campaignId}/send`,
    stats: (campaignId: string | number) => `/campaigns/${campaignId}/stats`,
  },
  tenants: {
    list: "/tenants/",
  },
  export: {
    recommendations: "/export/recommendations",
    audit: "/export/audit",
    runs: (runId: string | number, format: "csv" | "json") =>
      `/export/runs/${runId}/${format}`,
  },
  health: {
    check: "/health",
  },
} as const;
