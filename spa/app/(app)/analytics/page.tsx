"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatCurrency, formatNumber, humanizeKey } from "@/lib/format";

const SalesTrendChart = dynamic(() => import("@/components/sales-trend-chart"), {
  ssr: false,
});

type SalesPoint = {
  period?: string;
  revenue?: number;
  label?: string;
  value?: number;
};

type KpiEntry = {
  label: string;
  value: string;
  helper?: string;
};

type KpiConfig = {
  key: string;
  label: string;
  helper?: string;
  format: (value: unknown) => string;
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function formatPercent(value: unknown) {
  const numeric = parseNumber(value);
  if (numeric === null) return "-";
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
  }).format(numeric * 100)} %`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number" || typeof value === "string") {
    return formatNumber(value);
  }
  return String(value);
}

function buildKpis(
  data: Record<string, unknown> | undefined,
  config: KpiConfig[]
): KpiEntry[] {
  if (!data || typeof data !== "object") return [];
  return config.map((item) => ({
    label: item.label,
    value: item.format(data[item.key]),
    helper: item.helper,
  }));
}

function buildFallbackKpis(data: Record<string, unknown> | undefined) {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data).map(([key, value]) => ({
    label: humanizeKey(key),
    value: formatValue(value),
  }));
}

export default function AnalyticsPage() {
  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiRequest<Record<string, unknown>>(endpoints.analytics.overview),
  });
  const outcomesQuery = useQuery({
    queryKey: ["analytics", "outcomes"],
    queryFn: () => apiRequest<Record<string, unknown>>(endpoints.analytics.outcomes),
  });
  const salesQuery = useQuery({
    queryKey: ["analytics", "sales-trend"],
    queryFn: () => apiRequest<SalesPoint[]>(endpoints.analytics.salesTrend),
  });

  const overviewConfig: KpiConfig[] = [
    {
      key: "total_clients",
      label: "Clients totaux",
      format: (value) => formatNumber(value as number | string | null | undefined),
    },
    {
      key: "active_clients",
      label: "Clients actifs",
      helper: "90 derniers jours",
      format: (value) => formatNumber(value as number | string | null | undefined),
    },
    { key: "churn_rate", label: "Taux de churn", format: formatPercent },
    {
      key: "total_revenue",
      label: "CA total",
      format: (value) =>
        formatCurrency(value as number | string | null | undefined),
    },
    {
      key: "average_order_value",
      label: "Panier moyen",
      format: (value) =>
        formatCurrency(value as number | string | null | undefined),
    },
    {
      key: "recommendation_count",
      label: "Recommandations",
      format: (value) => formatNumber(value as number | string | null | undefined),
    },
  ];

  const outcomesConfig: KpiConfig[] = [
    {
      key: "emails_sent",
      label: "Emails envoyes",
      format: (value) => formatNumber(value as number | string | null | undefined),
    },
    { key: "open_rate", label: "Taux d'ouverture", format: formatPercent },
    { key: "click_rate", label: "Taux de clics", format: formatPercent },
    {
      key: "unsubscribe_rate",
      label: "Taux de desabonnement",
      format: formatPercent,
    },
    {
      key: "conversion_rate",
      label: "Taux de conversion",
      format: formatPercent,
    },
  ];

  const overviewKpis = buildKpis(overviewQuery.data, overviewConfig);
  const outcomesKpis = buildKpis(outcomesQuery.data, outcomesConfig);
  const fallbackOverview = buildFallbackKpis(overviewQuery.data);
  const fallbackOutcomes = buildFallbackKpis(outcomesQuery.data);

  const hasOverviewData = fallbackOverview.length > 0;
  const hasOutcomesData = fallbackOutcomes.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Suivi des performances, conversions et tendances de ventes."
      />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Vue d&apos;ensemble
        </h2>
        {overviewQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : overviewQuery.error ? (
          <ErrorState message="Impossible de charger les indicateurs globaux." />
        ) : hasOverviewData ? (
          <div className="grid gap-4 md:grid-cols-3">
            {overviewKpis.length
              ? overviewKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)
              : fallbackOverview.map((kpi) => (
                  <KpiCard key={kpi.label} {...kpi} />
                ))}
          </div>
        ) : (
          <EmptyState
            title="Aucun indicateur global disponible."
            description="Les donnees seront disponibles apres les premieres ventes."
          />
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tendance des ventes</CardTitle>
          </CardHeader>
          <CardContent>
            {salesQuery.isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : salesQuery.error ? (
              <ErrorState message="Impossible de charger la tendance des ventes." />
            ) : salesQuery.data && salesQuery.data.length ? (
              <SalesTrendChart data={salesQuery.data} />
            ) : (
              <EmptyState
                title="Aucune vente enregistree."
                description="Importez des ventes pour afficher une tendance."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance marketing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {outcomesQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : outcomesQuery.error ? (
              <ErrorState message="Impossible de charger les resultats marketing." />
            ) : hasOutcomesData ? (
              outcomesKpis.length ? (
                outcomesKpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">{kpi.label}</div>
                    <div className="text-lg font-semibold text-foreground">
                      {kpi.value}
                    </div>
                    {kpi.helper ? (
                      <div className="text-xs text-muted-foreground">
                        {kpi.helper}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                fallbackOutcomes.map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">{kpi.label}</div>
                    <div className="text-lg font-semibold text-foreground">
                      {kpi.value}
                    </div>
                  </div>
                ))
              )
            ) : (
              <EmptyState
                title="Aucun resultat marketing disponible."
                description="Les taux seront calcules apres les premieres campagnes."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
