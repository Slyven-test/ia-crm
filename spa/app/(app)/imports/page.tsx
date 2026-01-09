"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatDate, formatNumber } from "@/lib/format";

type ImportRun = Record<string, unknown>;

const importEndpoints = {
  state: "/etl/state",
  ingest: "/etl/ingest",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRuns(value: unknown): ImportRun[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["results", "items", "runs", "imports", "data"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function getLastRunAt(value: unknown) {
  if (!isRecord(value)) return null;
  const candidate = value.last_run_at ?? value.last_run ?? value.last_run_date;
  if (typeof candidate === "string" || typeof candidate === "number") {
    return candidate;
  }
  return null;
}

function pickValue<T>(
  run: ImportRun,
  keys: string[],
  predicate: (value: unknown) => value is T
): T | null {
  for (const key of keys) {
    const value = run[key];
    if (predicate(value)) return value;
  }
  return null;
}

function getTenantLabel(run: ImportRun) {
  const value = pickValue(
    run,
    ["tenant_id", "tenant", "tenant_name", "name"],
    (candidate): candidate is string | number =>
      typeof candidate === "string" || typeof candidate === "number"
  );
  return value ? String(value) : null;
}

function getVerification(run: ImportRun) {
  if (isRecord(run.verification)) return run.verification;
  return null;
}

function getSuccessValue(run: ImportRun) {
  const direct = pickValue(
    run,
    ["success", "status", "state"],
    (candidate): candidate is boolean =>
      typeof candidate === "boolean"
  );
  if (direct !== null) return direct;
  const verification = getVerification(run);
  if (verification && typeof verification.success === "boolean") {
    return verification.success;
  }
  return null;
}

function getNumberValue(run: ImportRun, keys: string[]) {
  const value = pickValue(
    run,
    keys,
    (candidate): candidate is number | string =>
      typeof candidate === "number" || typeof candidate === "string"
  );
  if (value === null) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return null;
  return numeric;
}

function getDurationSeconds(run: ImportRun) {
  const seconds = getNumberValue(run, ["total_duration", "duration_s", "duration"]);
  if (seconds !== null) return seconds;
  const ms = getNumberValue(run, ["duration_ms", "duration_msec", "elapsed_ms"]);
  if (ms !== null) return ms / 1000;
  return null;
}

function getVerificationMetric(run: ImportRun, key: string) {
  const verification = getVerification(run);
  if (verification && key in verification) {
    const value = verification[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return numeric;
    }
  }
  return getNumberValue(run, [key]);
}

function getArrayCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  return null;
}

function getFilesSummary(run: ImportRun) {
  const ingested = getArrayCount(run.ingested_files);
  const curated = getArrayCount(run.curated_files);
  if (ingested === null && curated === null) return "-";
  const parts = [];
  if (ingested !== null) parts.push(`raw: ${formatNumber(ingested)}`);
  if (curated !== null) parts.push(`curated: ${formatNumber(curated)}`);
  return parts.join(" · ");
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "-";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

function getStatusBadge(value: boolean | null) {
  if (value === null) {
    return (
      <Badge variant="outline" className="capitalize">
        inconnu
      </Badge>
    );
  }
  if (value) {
    return (
      <Badge className="capitalize border-emerald-200 bg-emerald-100 text-emerald-900">
        ok
      </Badge>
    );
  }
  return (
    <Badge className="capitalize border-rose-200 bg-rose-100 text-rose-900">
      echec
    </Badge>
  );
}

function normalizeTenantIds(tenants: unknown, runs: ImportRun[]) {
  const ids = new Set<string>();
  if (Array.isArray(tenants)) {
    tenants.forEach((tenant) => {
      if (!isRecord(tenant)) return;
      const value = pickValue(
        tenant,
        ["name", "tenant_id", "tenant", "code", "id"],
        (candidate): candidate is string | number =>
          typeof candidate === "string" || typeof candidate === "number"
      );
      if (value !== null) ids.add(String(value));
    });
  }
  if (ids.size) return Array.from(ids).sort();
  runs.forEach((run) => {
    const label = getTenantLabel(run);
    if (label) ids.add(label);
  });
  return Array.from(ids).sort();
}

export default function ImportsPage() {
  const stateQuery = useQuery({
    queryKey: ["etl-state"],
    queryFn: () => apiRequest<unknown>(importEndpoints.state),
  });

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: () => apiRequest<unknown>(endpoints.tenants.list),
  });

  const rows = useMemo(() => normalizeRuns(stateQuery.data), [stateQuery.data]);
  const tenantIds = useMemo(
    () => normalizeTenantIds(tenantsQuery.data, rows),
    [tenantsQuery.data, rows]
  );
  const lastRunAt = getLastRunAt(stateQuery.data);

  const ingestMutation = useMutation({
    mutationFn: async (tenants: string[]) =>
      apiRequest(importEndpoints.ingest, {
        method: "POST",
        body: { tenants, isolate_schema: false },
      }),
    onSuccess: (_, tenants) => {
      toast.success(
        tenants.length
          ? `Import lance pour ${tenants.length} tenant(s).`
          : "Import lance."
      );
      stateQuery.refetch();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Impossible de lancer l'import.";
      toast.error(message);
    },
  });

  const columns = useMemo<ColumnDef<ImportRun>[]>(
    () => [
      {
        id: "tenant",
        header: "Tenant",
        accessorFn: (row) => getTenantLabel(row) ?? "-",
        cell: ({ row }) => getTenantLabel(row.original) ?? "-",
      },
      {
        id: "status",
        header: "Statut",
        accessorFn: (row) => getSuccessValue(row),
        cell: ({ row }) => getStatusBadge(getSuccessValue(row.original)),
      },
      {
        id: "duration",
        header: "Duree",
        accessorFn: (row) => getDurationSeconds(row),
        cell: ({ row }) => formatDuration(getDurationSeconds(row.original)),
      },
      {
        id: "rows",
        header: "Lignes",
        accessorFn: (row) => getVerificationMetric(row, "total_rows"),
        cell: ({ row }) => {
          const value = getVerificationMetric(row.original, "total_rows");
          return value === null ? "-" : formatNumber(value);
        },
      },
      {
        id: "tables_ok",
        header: "Tables ok",
        accessorFn: (row) => getVerificationMetric(row, "total_success"),
        cell: ({ row }) => {
          const value = getVerificationMetric(row.original, "total_success");
          return value === null ? "-" : formatNumber(value);
        },
      },
      {
        id: "tables_ko",
        header: "Tables ko",
        accessorFn: (row) => getVerificationMetric(row, "total_failed"),
        cell: ({ row }) => {
          const value = getVerificationMetric(row.original, "total_failed");
          return value === null ? "-" : formatNumber(value);
        },
      },
      {
        id: "files",
        header: "Fichiers",
        accessorFn: (row) => getFilesSummary(row),
        cell: ({ row }) => getFilesSummary(row.original),
      },
    ],
    []
  );

  const hasRows = rows.length > 0;
  const isRefreshing = stateQuery.isFetching && !stateQuery.isLoading;
  const errorMessage =
    stateQuery.error instanceof ApiError
      ? stateQuery.error.message
      : "Impossible de charger les imports.";
  const launchDisabled = ingestMutation.isPending || tenantIds.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Suivi des executions ETL et ingestion des donnees."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Historique des imports</CardTitle>
            <CardDescription>
              Derniers imports executes sur les tenants.
              {lastRunAt ? ` Dernier run: ${formatDate(lastRunAt)}.` : ""}
            </CardDescription>
            {tenantIds.length ? (
              <p className="text-xs text-muted-foreground">
                Tenants detectes: {tenantIds.length}
              </p>
            ) : null}
          </div>
          <CardAction>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!tenantIds.length) {
                    toast.error("Aucun tenant disponible pour lancer l'import.");
                    return;
                  }
                  ingestMutation.mutate(tenantIds);
                }}
                disabled={launchDisabled}
              >
                {ingestMutation.isPending ? "Import..." : "Lancer import"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => stateQuery.refetch()}
                disabled={stateQuery.isFetching}
              >
                {isRefreshing ? "Rafraichir..." : "Rafraichir"}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {stateQuery.error ? (
            <ErrorState message={errorMessage} />
          ) : stateQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-48" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : !hasRows ? (
            <EmptyState
              title="Aucun import disponible."
              description="L'historique apparaitra apres la premiere ingestion."
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              isLoading={stateQuery.isLoading}
              filterPlaceholder="Rechercher un import..."
              emptyMessage={
                hasRows
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucun import disponible."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
