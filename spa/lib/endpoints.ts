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
    create: "/clients/",
    detail: (clientCode: string) => `/clients/${clientCode}`,
    update: (clientCode: string) => `/clients/${clientCode}`,
  },
  products: {
    list: "/products/",
    create: "/products/",
    detail: (productKey: string) => `/products/${productKey}`,
    update: (productKey: string) => `/products/${productKey}`,
  },
  recommendations: {
    list: "/recommendations/",
    byClient: (clientCode: string) => `/recommendations/client/${clientCode}`,
    generate: "/recommendations/generate",
    approve: "/recommendations/approve",
  },
  recommendationsV2: {
    list: "/recommendations/",
    byClient: (clientCode: string) => `/clients/${clientCode}/recommendations`,
    runByClient: (clientCode: string) =>
      `/clients/${clientCode}/recommendations/run`,
    update: (recommendationId: string | number) =>
      `/recommendations/${recommendationId}`,
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
    create: "/sales/",
  },
  tasteDimensions: {
    list: "/taste-dimensions/",
    create: "/taste-dimensions/",
    update: (dimensionId: string | number) => `/taste-dimensions/${dimensionId}`,
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
    runSummary: (runId: string | number) =>
      `/export/runs/${runId}/run_summary.json`,
  },
  health: {
    check: "/health",
  },
} as const;
