"use client";

import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ErrorState } from "@/components/error-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatCurrency, formatNumber, humanizeKey } from "@/lib/format";

type SalesPoint = {
  date?: string;
  label?: string;
  value?: number;
  amount?: number;
};

type KpiEntry = {
  label: string;
  value: string;
  helper?: string;
  delta?: number;
};

function buildKpis(data: Record<string, unknown> | unknown): KpiEntry[] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === "number") {
      return {
        label: humanizeKey(key),
        value: formatNumber(value),
      };
    }
    if (typeof value === "string" && value.match(/^\d+(\.\d+)?$/)) {
      return {
        label: humanizeKey(key),
        value: formatNumber(value),
      };
    }
    return {
      label: humanizeKey(key),
      value: String(value),
    };
  });
}

export default function DashboardPage() {
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

  const overviewKpis = buildKpis(overviewQuery.data);
  const outcomesKpis = buildKpis(outcomesQuery.data);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Suivi des performances et des recommandations."
      />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Indicateurs principaux
        </h2>
        {overviewQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : overviewQuery.error ? (
          <ErrorState message="Impossible de charger les indicateurs." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {overviewKpis.length ? (
              overviewKpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))
            ) : (
              <KpiCard label="Aucun indicateur" value="-" />
            )}
          </div>
        )}
      </div>

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
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesQuery.data}>
                    <XAxis
                      dataKey={(point: SalesPoint) =>
                        point.label || point.date || ""
                      }
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      labelFormatter={(label) => String(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey={(point: SalesPoint) =>
                        point.value ?? point.amount ?? 0
                      }
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Aucune donnee pour la periode selectionnee.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultats des recommandations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {outcomesQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : outcomesQuery.error ? (
              <ErrorState message="Impossible de charger les resultats." />
            ) : outcomesKpis.length ? (
              outcomesKpis.map((kpi) => (
                <div key={kpi.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  <div className="text-lg font-semibold text-foreground">
                    {kpi.value}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                Aucun resultat disponible.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
