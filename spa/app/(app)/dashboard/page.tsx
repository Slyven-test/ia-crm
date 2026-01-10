"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ErrorState } from "@/components/error-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

type UnknownRecord = Record<string, unknown>;

type SalesPoint = {
  date?: string;
  label?: string;
  value?: number;
  amount?: number;
};

type LatestInfo = {
  dateLabel: string;
  statusLabel?: string;
};

const countKeys = ["count", "total", "total_count", "totalCount", "size"];
const arrayKeys = ["items", "results", "data", "rows", "recommendations"];

const runArrayKeys = ["items", "results", "data", "runs"];
const importArrayKeys = ["items", "results", "data", "logs", "imports", "etl"];

const runDateKeys = [
  "finished_at",
  "completed_at",
  "ended_at",
  "end_time",
  "updated_at",
  "created_at",
  "started_at",
  "start_time",
];

const importDateKeys = [
  "imported_at",
  "executed_at",
  "finished_at",
  "completed_at",
  "ended_at",
  "created_at",
  "timestamp",
  "date",
];

const statusKeys = ["status", "state", "result", "outcome"];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function pickValue<T>(
  record: UnknownRecord,
  keys: string[],
  guard: (value: unknown) => value is T
): T | null {
  for (const key of keys) {
    const value = record[key];
    if (guard(value)) return value;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function getDateValue(record: UnknownRecord, keys: string[]): Date | null {
  const value = pickValue(record, keys, (entry): entry is string | number | Date =>
    typeof entry === "string" || typeof entry === "number" || entry instanceof Date
  );
  return toDate(value);
}

function getStatusValue(record: UnknownRecord) {
  const value = pickValue(
    record,
    statusKeys,
    (entry): entry is string | number =>
      typeof entry === "string" || typeof entry === "number"
  );
  return value !== null ? String(value) : null;
}

function normalizeRecords(payload: unknown, keys: string[]): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value.filter(isRecord);
      }
    }
  }
  return [];
}

function getCountFromPayload(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (isRecord(payload)) {
    for (const key of countKeys) {
      const value = toNumber(payload[key]);
      if (value !== null) return value;
    }
    for (const key of arrayKeys) {
      const value = payload[key];
      if (Array.isArray(value)) return value.length;
    }
  }
  return null;
}

function getSalesTotal(payload: unknown): number | null {
  if (Array.isArray(payload)) {
    return payload.reduce((total, point) => {
      if (!point || typeof point !== "object") return total;
      const value = toNumber((point as SalesPoint).value);
      const amount = toNumber((point as SalesPoint).amount);
      return total + (value ?? amount ?? 0);
    }, 0);
  }
  if (isRecord(payload)) {
    const totalValue = pickValue(
      payload,
      ["total_sales", "total", "sales", "revenue", "amount", "total_amount"],
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number"
    );
    const numeric = toNumber(totalValue);
    if (numeric !== null) return numeric;
  }
  return null;
}

function getLatestRecord(
  payload: unknown,
  keys: string[],
  dateKeys: string[]
): UnknownRecord | null {
  let records = normalizeRecords(payload, keys);
  if (!records.length && isRecord(payload)) {
    records = [payload];
  }
  if (!records.length) return null;

  let latest = records[0];
  let latestDate = getDateValue(latest, dateKeys);

  for (const record of records.slice(1)) {
    const candidateDate = getDateValue(record, dateKeys);
    if (candidateDate && (!latestDate || candidateDate > latestDate)) {
      latest = record;
      latestDate = candidateDate;
    }
  }

  return latest;
}

function getLatestInfo(
  payload: unknown,
  keys: string[],
  dateKeys: string[]
): LatestInfo | null {
  const latest = getLatestRecord(payload, keys, dateKeys);
  if (!latest) return null;
  const date = getDateValue(latest, dateKeys);
  const status = getStatusValue(latest);
  return {
    dateLabel: date ? formatDate(date) : "Non disponible",
    statusLabel: status ?? undefined,
  };
}

function renderKpiCard(options: {
  label: string;
  value: string;
  helper?: string;
  isLoading: boolean;
  error: unknown;
  errorMessage: string;
}) {
  if (options.isLoading) {
    return <Skeleton className="h-28 w-full" />;
  }
  if (options.error) {
    return <ErrorState message={options.errorMessage} />;
  }
  return <KpiCard label={options.label} value={options.value} helper={options.helper} />;
}

function formatStatusLabel(status: string | undefined) {
  if (!status) return "Indefini";
  return status;
}

export default function DashboardPage() {
  const clientsQuery = useQuery({
    queryKey: ["clients", "count"],
    queryFn: () => apiRequest<unknown>(endpoints.clients.list),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "count"],
    queryFn: () => apiRequest<unknown>(endpoints.products.list),
  });
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", "count"],
    queryFn: () => apiRequest<unknown>(endpoints.recommendations.list),
  });
  const salesQuery = useQuery({
    queryKey: ["analytics", "sales-trend"],
    queryFn: () => apiRequest<SalesPoint[]>(endpoints.analytics.salesTrend),
  });
  const importQuery = useQuery({
    queryKey: ["audit", "latest"],
    queryFn: () => apiRequest<unknown>(endpoints.audit.latest),
  });
  const runQuery = useQuery({
    queryKey: ["runs", "latest"],
    queryFn: () => apiRequest<unknown>(endpoints.recoRuns.list),
  });
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => apiRequest<UnknownRecord>(endpoints.health.check),
  });

  const clientsCount = getCountFromPayload(clientsQuery.data);
  const productsCount = getCountFromPayload(productsQuery.data);
  const recommendationsCount = getCountFromPayload(recommendationsQuery.data);
  const salesTotal = getSalesTotal(salesQuery.data);

  const latestImport = getLatestInfo(importQuery.data, importArrayKeys, importDateKeys);
  const latestRun = getLatestInfo(runQuery.data, runArrayKeys, runDateKeys);

  const healthStatus = healthQuery.data
    ? pickValue(
        healthQuery.data,
        ["status", "state", "health", "result"],
        (value): value is string | number =>
          typeof value === "string" || typeof value === "number"
      )
    : null;

  const healthStatusLabel = formatStatusLabel(
    healthStatus !== null ? String(healthStatus) : undefined
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Vue d'ensemble des indicateurs et de l'etat systeme."
      />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Indicateurs clefs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {renderKpiCard({
            label: "Clients",
            value:
              clientsCount !== null ? formatNumber(clientsCount) : "Non disponible",
            helper: "Total clients",
            isLoading: clientsQuery.isLoading,
            error: clientsQuery.error,
            errorMessage: "Impossible de charger les clients.",
          })}
          {renderKpiCard({
            label: "Produits",
            value:
              productsCount !== null ? formatNumber(productsCount) : "Non disponible",
            helper: "Total produits",
            isLoading: productsQuery.isLoading,
            error: productsQuery.error,
            errorMessage: "Impossible de charger les produits.",
          })}
          {renderKpiCard({
            label: "Ventes",
            value: salesTotal !== null ? formatCurrency(salesTotal) : "Non disponible",
            helper: "Volume cumule",
            isLoading: salesQuery.isLoading,
            error: salesQuery.error,
            errorMessage: "Impossible de charger les ventes.",
          })}
          {renderKpiCard({
            label: "Recommandations",
            value:
              recommendationsCount !== null
                ? formatNumber(recommendationsCount)
                : "Non disponible",
            helper: "Total recommandations",
            isLoading: recommendationsQuery.isLoading,
            error: recommendationsQuery.error,
            errorMessage: "Impossible de charger les recommandations.",
          })}
          {renderKpiCard({
            label: "Dernier import",
            value: latestImport?.dateLabel ?? "Non disponible",
            helper: latestImport?.statusLabel
              ? `Statut: ${latestImport.statusLabel}`
              : undefined,
            isLoading: importQuery.isLoading,
            error: importQuery.error,
            errorMessage: "Impossible de charger le dernier import.",
          })}
          {renderKpiCard({
            label: "Dernier run",
            value: latestRun?.dateLabel ?? "Non disponible",
            helper: latestRun?.statusLabel ? `Statut: ${latestRun.statusLabel}` : undefined,
            isLoading: runQuery.isLoading,
            error: runQuery.error,
            errorMessage: "Impossible de charger le dernier run.",
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Etat systeme</CardTitle>
            <CardDescription>
              Disponibilite des services et dernieres executions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : healthQuery.error ? (
              <ErrorState message="Impossible de verifier l'etat du systeme." />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">API</div>
                    <div className="text-xs text-muted-foreground">
                      /api/health
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {healthStatusLabel}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Dernier import
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestImport?.statusLabel
                        ? `Statut: ${latestImport.statusLabel}`
                        : "Statut indisponible"}
                    </div>
                  </div>
                  <div className="text-sm text-foreground">
                    {latestImport?.dateLabel ?? "Non disponible"}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Dernier run
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestRun?.statusLabel
                        ? `Statut: ${latestRun.statusLabel}`
                        : "Statut indisponible"}
                    </div>
                  </div>
                  <div className="text-sm text-foreground">
                    {latestRun?.dateLabel ?? "Non disponible"}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>
              Acces direct aux ecrans les plus utilises.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/imports">Imports & ETL</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/customers">Clients</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/products">Produits</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/recommendations">Recommandations</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
