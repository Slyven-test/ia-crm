"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatDate, formatNumber } from "@/lib/format";

type RunRow = Record<string, unknown>;

type RunSummaryDownload = {
  runId: string | number;
};

type RunFormState = {
  topN: number;
  segment: string;
};

type RunItemRow = Record<string, unknown>;

type EndpointWithRunId = (runId: string | number, format?: string) => string;

type EndpointWithId = (runId: string | number) => string;

const defaultRunForm: RunFormState = {
  topN: 5,
  segment: "",
};

const UNAVAILABLE_STATUSES = new Set([404, 501]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRuns(value: unknown): RunRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "runs"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function normalizeItems(value: unknown): RunItemRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "recommendations"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function resolveStringEndpoint(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveEndpointFn(value: unknown): EndpointWithId | null {
  return typeof value === "function" ? (value as EndpointWithId) : null;
}

function resolveEndpointFnWithFormat(value: unknown): EndpointWithRunId | null {
  return typeof value === "function" ? (value as EndpointWithRunId) : null;
}

function isUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status);
}

function formatApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const status = error.status ?? 0;
    const message = error.message || fallback;
    if (UNAVAILABLE_STATUSES.has(status)) {
      return `HTTP ${status} - Non disponible`;
    }
    return `HTTP ${status} - ${message}`;
  }
  if (error instanceof Error) {
    return `HTTP 0 - ${error.message}`;
  }
  return `HTTP 0 - ${fallback}`;
}

function getRunId(run: RunRow): string | number | null {
  if (typeof run.run_id === "string" || typeof run.run_id === "number") {
    return run.run_id;
  }
  if (typeof run.id === "string" || typeof run.id === "number") {
    return run.id;
  }
  return null;
}

function getRunExportId(run: RunRow): string | number | null {
  const runId = getRunId(run);
  if (typeof runId === "string" && !runId.trim()) return null;
  return runId;
}

function pickValue<T>(
  run: RunRow,
  keys: string[],
  predicate: (value: unknown) => value is T
): T | null {
  for (const key of keys) {
    const value = run[key];
    if (predicate(value)) return value;
  }
  return null;
}

function getStringValue(run: RunRow, keys: string[]) {
  return pickValue(run, keys, (value): value is string | number =>
    ["string", "number"].includes(typeof value)
  );
}

function getDateValue(run: RunRow, keys: string[]) {
  return pickValue(run, keys, (value): value is string | number | Date =>
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  );
}

function getCountValue(run: RunRow, keys: string[]) {
  for (const key of keys) {
    const value = run[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return numeric;
    }
    if (Array.isArray(value)) return value.length;
  }
  return null;
}

function getStatusBadge(status: string | number | null) {
  const label = status === null ? "-" : String(status);
  const normalized = label.toLowerCase();
  const baseClasses = "capitalize";

  if (["success", "succeeded", "ok", "done", "completed"].includes(normalized)) {
    return (
      <Badge className={`${baseClasses} border-emerald-200 bg-emerald-100 text-emerald-900`}>
        {label}
      </Badge>
    );
  }

  if (["failed", "error", "ko", "cancelled", "canceled"].includes(normalized)) {
    return (
      <Badge className={`${baseClasses} border-rose-200 bg-rose-100 text-rose-900`}>
        {label}
      </Badge>
    );
  }

  if (["running", "in_progress", "pending", "queued"].includes(normalized)) {
    return (
      <Badge className={`${baseClasses} border-sky-200 bg-sky-100 text-sky-900`}>
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={baseClasses}>
      {label}
    </Badge>
  );
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") {
    const payload = formatJson(value);
    return payload.length > 120 ? `${payload.slice(0, 117)}...` : payload;
  }
  return String(value);
}

function formatDuration(ms: number | null) {
  if (!ms || ms <= 0) return "-";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function getDurationMs(run: RunRow) {
  const started = getDateValue(run, [
    "started_at",
    "start_time",
    "created_at",
    "executed_at",
  ]);
  const finished = getDateValue(run, [
    "finished_at",
    "completed_at",
    "ended_at",
    "end_time",
  ]);

  if (started && finished) {
    const startDate = new Date(started);
    const endDate = new Date(finished);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      return Math.max(0, endDate.getTime() - startDate.getTime());
    }
  }

  const durationMs = getCountValue(run, [
    "duration_ms",
    "duration_msec",
    "elapsed_ms",
    "runtime_ms",
  ]);
  if (durationMs !== null) return durationMs;

  const durationSeconds = getCountValue(run, [
    "duration_s",
    "duration_sec",
    "duration_seconds",
    "elapsed",
    "runtime",
  ]);
  if (durationSeconds !== null) return durationSeconds * 1000;

  return null;
}

function getRunLabel(run: RunRow) {
  const label = getStringValue(run, [
    "type",
    "name",
    "job",
    "task",
    "pipeline",
    "run_type",
    "kind",
  ]);
  if (label) return String(label);
  if (run.run_id || run.id) return "recommandations";
  return "-";
}

function getMetricsSummary(run: RunRow) {
  const metrics: Array<{ label: string; value: number }> = [];
  const items = getCountValue(run, ["total_items", "items_count", "item_count"]);
  const clients = getCountValue(run, [
    "total_clients",
    "clients_count",
    "client_count",
  ]);
  const recos = getCountValue(run, [
    "recommendations",
    "recommendations_count",
    "reco_count",
    "next_actions",
    "next_action_count",
  ]);
  const errors = getCountValue(run, ["error_count", "errors", "failed_items"]);

  if (items !== null) metrics.push({ label: "items", value: items });
  if (clients !== null) metrics.push({ label: "clients", value: clients });
  if (recos !== null) metrics.push({ label: "recos", value: recos });
  if (errors !== null) metrics.push({ label: "erreurs", value: errors });

  if (!metrics.length) return "-";
  return metrics.map(({ label, value }) => `${label}: ${formatNumber(value)}`).join(" · ");
}

function buildHeaders(rows: RunItemRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });
  return headers;
}

function triggerDownload(payload: string, filename: string, mimeType: string) {
  const blob = new Blob([payload], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
}

export default function RunsPage() {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null);
  const [activeDownloadRun, setActiveDownloadRun] = useState<
    string | number | null
  >(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runForm, setRunForm] = useState<RunFormState>(defaultRunForm);

  const endpointsRecord = endpoints as unknown as Record<string, unknown>;
  const recoRunsRecord = isRecord(endpointsRecord.recoRuns)
    ? endpointsRecord.recoRuns
    : null;
  const recommendationsRecord = isRecord(endpointsRecord.recommendations)
    ? endpointsRecord.recommendations
    : null;
  const exportRecord = isRecord(endpointsRecord.export)
    ? endpointsRecord.export
    : null;

  const recoRunsListEndpoint = resolveStringEndpoint(
    recoRunsRecord?.list
  );
  const recoRunItemsEndpoint = resolveEndpointFn(
    recoRunsRecord?.items
  );
  const runGenerateEndpoint = resolveStringEndpoint(
    recommendationsRecord?.generate
  );
  const runExportEndpoint = resolveEndpointFnWithFormat(
    exportRecord?.runs
  );
  const runSummaryEndpoint = resolveEndpointFn(
    exportRecord?.runSummary
  );

  const query = useQuery({
    queryKey: ["reco-runs", recoRunsListEndpoint ?? "none"],
    queryFn: () => {
      if (!recoRunsListEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(recoRunsListEndpoint);
    },
    enabled: Boolean(recoRunsListEndpoint),
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ runId }: RunSummaryDownload) => {
      if (!runExportEndpoint) {
        throw new ApiError({ status: 404, message: "Export non disponible." });
      }
      try {
        const csvPayload = await apiRequest<string>(
          runExportEndpoint(runId, "csv"),
          { headers: { Accept: "text/csv" } }
        );
        triggerDownload(csvPayload, `run_${runId}.csv`, "text/csv");
        return { format: "csv" };
      } catch (error) {
        if (
          error instanceof ApiError &&
          [404, 405, 501].includes(error.status)
        ) {
          const jsonPayload = await apiRequest<unknown>(
            runExportEndpoint(runId, "json")
          );
          triggerDownload(
            JSON.stringify(jsonPayload, null, 2),
            `run_${runId}.json`,
            "application/json"
          );
          return { format: "json" };
        }
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      const label = result?.format === "json" ? "JSON" : "CSV";
      toast.success(`Export ${label} du run ${variables.runId} telecharge.`);
    },
    onError: (error, variables) => {
      toast.error(
        formatApiErrorMessage(
          error,
          variables?.runId
            ? `Impossible d'exporter le run ${variables.runId}.`
            : "Impossible de telecharger le run."
        )
      );
    },
    onSettled: () => {
      setActiveDownloadRun(null);
    },
  });

  const runMutation = useMutation({
    mutationFn: async (payload: RunFormState) => {
      if (!runGenerateEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint de run absent." });
      }
      const params = new URLSearchParams();
      params.set("top_n", String(payload.topN || 5));
      if (payload.segment.trim()) {
        params.set("segment", payload.segment.trim());
      }
      const endpoint = `${runGenerateEndpoint}?${params.toString()}`;
      return apiRequest(endpoint, { method: "POST" });
    },
    onSuccess: async (payload) => {
      const summary =
        payload && isRecord(payload)
          ? [payload.run_id, payload.id].find(
              (value) => typeof value === "string" || typeof value === "number"
            )
          : null;
      toast.success(
        summary
          ? `Run de recommandations lance (run ${summary}).`
          : "Run de recommandations lance."
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
        queryClient.invalidateQueries({ queryKey: ["reco-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["runs", "latest"] }),
        queryClient.invalidateQueries({ queryKey: ["audit", "latest"] }),
      ]);
      setRunDialogOpen(false);
      setRunForm(defaultRunForm);
    },
    onError: (error) => {
      if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
        toast.error(`HTTP ${error.status} - Non disponible`);
        return;
      }
      toast.error(formatApiErrorMessage(error, "Impossible de lancer le run."));
    },
  });

  const rows = useMemo(() => normalizeRuns(query.data), [query.data]);
  const dynamicKeys = useMemo(() => {
    const excluded = new Set([
      "id",
      "run_id",
      "status",
      "state",
      "run_status",
      "type",
      "name",
      "job",
      "task",
      "pipeline",
      "run_type",
      "kind",
      "started_at",
      "start_time",
      "created_at",
      "executed_at",
      "finished_at",
      "completed_at",
      "ended_at",
      "end_time",
      "duration_ms",
      "duration_msec",
      "elapsed_ms",
      "runtime_ms",
      "duration_s",
      "duration_sec",
      "duration_seconds",
      "elapsed",
      "runtime",
      "tenant",
      "tenant_id",
      "error",
      "message",
      "detail",
      "failure",
      "reason",
      "error_message",
      "total_items",
      "items_count",
      "item_count",
      "total_clients",
      "clients_count",
      "client_count",
      "recommendations",
      "recommendations_count",
      "reco_count",
      "next_actions",
      "next_action_count",
      "error_count",
      "errors",
      "failed_items",
      "summary",
    ]);

    const keys = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!excluded.has(key)) keys.add(key);
      });
    });
    return Array.from(keys).sort();
  }, [rows]);

  const selectedRunId = selectedRun ? getRunId(selectedRun) : null;
  const exportRunId = selectedRun ? getRunExportId(selectedRun) : null;
  const summaryQuery = useQuery({
    queryKey: ["reco-runs", exportRunId, "summary"],
    queryFn: () =>
      runSummaryEndpoint
        ? apiRequest<unknown>(runSummaryEndpoint(exportRunId!))
        : Promise.resolve(null),
    enabled: exportRunId !== null && Boolean(runSummaryEndpoint),
  });

  const itemsQuery = useQuery({
    queryKey: ["reco-runs", selectedRunId, "items"],
    queryFn: () =>
      recoRunItemsEndpoint
        ? apiRequest<unknown>(recoRunItemsEndpoint(selectedRunId!))
        : Promise.resolve(null),
    enabled: selectedRunId !== null && Boolean(recoRunItemsEndpoint),
  });

  const itemRows = useMemo(
    () => normalizeItems(itemsQuery.data),
    [itemsQuery.data]
  );
  const itemHeaders = useMemo(() => buildHeaders(itemRows), [itemRows]);
  const itemColumns = useMemo<ColumnDef<RunItemRow>[]>(
    () =>
      itemHeaders.map((header) => ({
        accessorKey: header,
        header,
        cell: ({ row }) => formatCellValue(row.original[header]),
      })),
    [itemHeaders]
  );

  const columns = useMemo<ColumnDef<RunRow>[]>(
    () => [
      {
        id: "run_id",
        header: "ID",
        accessorFn: (row) => getRunId(row) ?? "-",
        cell: ({ row }) => {
          const runId = getRunId(row.original);
          return runId ? String(runId) : "-";
        },
      },
      {
        id: "status",
        header: "Statut",
        accessorFn: (row) =>
          getStringValue(row, ["status", "state", "run_status"]),
        cell: ({ row }) =>
          getStatusBadge(
            getStringValue(row.original, ["status", "state", "run_status"])
          ),
      },
      {
        id: "type",
        header: "Type/Nom",
        accessorFn: (row) => getRunLabel(row),
        cell: ({ row }) => getRunLabel(row.original),
      },
      {
        id: "started",
        header: "Demarrage",
        accessorFn: (row) =>
          getDateValue(row, ["started_at", "created_at", "executed_at"]),
        cell: ({ row }) => {
          const value = getDateValue(row.original, [
            "started_at",
            "created_at",
            "executed_at",
          ]);
          return value ? formatDate(value) : "-";
        },
      },
      {
        id: "finished",
        header: "Fin",
        accessorFn: (row) =>
          getDateValue(row, ["finished_at", "completed_at", "ended_at"]),
        cell: ({ row }) => {
          const value = getDateValue(row.original, [
            "finished_at",
            "completed_at",
            "ended_at",
          ]);
          return value ? formatDate(value) : "-";
        },
      },
      {
        id: "duration",
        header: "Duree",
        accessorFn: (row) => getDurationMs(row),
        cell: ({ row }) => formatDuration(getDurationMs(row.original)),
      },
      {
        id: "tenant",
        header: "Tenant",
        accessorFn: (row) =>
          getStringValue(row, ["tenant", "tenant_id", "tenant_name"]),
        cell: ({ row }) => {
          const value = getStringValue(row.original, [
            "tenant",
            "tenant_id",
            "tenant_name",
          ]);
          return value ? String(value) : "-";
        },
      },
      {
        id: "error",
        header: "Erreur/Message",
        accessorFn: (row) =>
          getStringValue(row, [
            "error",
            "message",
            "detail",
            "failure",
            "reason",
            "error_message",
          ]),
        cell: ({ row }) => {
          const value = getStringValue(row.original, [
            "error",
            "message",
            "detail",
            "failure",
            "reason",
            "error_message",
          ]);
          if (!value) return "-";
          const label = String(value);
          return (
            <span className="block max-w-[240px] truncate" title={label}>
              {label}
            </span>
          );
        },
      },
      {
        id: "metrics",
        header: "Comptages",
        accessorFn: (row) => getMetricsSummary(row),
        cell: ({ row }) => getMetricsSummary(row.original),
      },
      ...dynamicKeys.map<ColumnDef<RunRow>>((key) => ({
        id: key,
        header: key,
        accessorFn: (row) => row[key],
        cell: ({ row }) => {
          const value = row.original[key];
          const formatted = formatCellValue(value);
          return (
            <span className="block max-w-[240px] truncate" title={String(formatted)}>
              {formatted}
            </span>
          );
        },
      })),
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const runId = getRunId(row.original);
          const exportId = getRunExportId(row.original);
          const isDownloading =
            downloadMutation.isPending && exportId === activeDownloadRun;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedRun(row.original)}
              >
                Voir details
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!exportId || !runExportEndpoint) return;
                  setActiveDownloadRun(exportId);
                  downloadMutation.mutate({ runId: exportId });
                }}
                disabled={!exportId || !runExportEndpoint || isDownloading}
              >
                {runExportEndpoint
                  ? isDownloading
                    ? "Export..."
                    : "Exporter"
                  : "Non disponible"}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/exports">Voir exports</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [downloadMutation, activeDownloadRun, dynamicKeys, runExportEndpoint]
  );

  const hasRows = rows.length > 0;
  const isRefreshing = query.isFetching && !query.isLoading;
  const listUnavailable =
    !recoRunsListEndpoint || isUnavailableError(query.error);
  const errorMessage =
    query.error
      ? formatApiErrorMessage(query.error, "Impossible de charger les runs.")
      : "Impossible de charger les runs.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        description="Suivi des executions de recommandations."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Historique des runs</CardTitle>
            <CardDescription>
              Dernieres executions du pipeline de recommandation.
            </CardDescription>
          </div>
          <CardAction>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setRunDialogOpen(true)}
                disabled={!runGenerateEndpoint}
              >
                {runGenerateEndpoint ? "Nouveau run" : "Non disponible"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => query.refetch()}
                disabled={!recoRunsListEndpoint || query.isFetching}
              >
                {isRefreshing ? "Rafraichir..." : "Rafraichir"}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {listUnavailable ? (
            <EmptyState
              title="Endpoint runs indisponible"
              description="Impossible de lister les runs (endpoint absent)."
            />
          ) : query.error ? (
            <ErrorState message={errorMessage} />
          ) : query.isLoading ? (
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
              title="Aucun run disponible."
              description="Les runs apparaitront apres la premiere execution."
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              isLoading={query.isLoading}
              filterPlaceholder="Rechercher un run..."
              emptyMessage={
                hasRows
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucun run disponible."
              }
            />
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selectedRun)}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Details du run</DialogTitle>
            <DialogDescription>
              Resume, recommandations generees et exports associes.
            </DialogDescription>
          </DialogHeader>
          {selectedRun ? (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium">Resume</p>
                {runSummaryEndpoint ? (
                  summaryQuery.isLoading ? (
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : summaryQuery.error ? (
                    isUnavailableError(summaryQuery.error) ? (
                      <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                        {formatApiErrorMessage(
                          summaryQuery.error,
                          "Details indisponibles."
                        )}
                      </div>
                    ) : (
                      <ErrorState
                        message={formatApiErrorMessage(
                          summaryQuery.error,
                          "Details complets indisponibles, affichage du run local."
                        )}
                      />
                    )
                  ) : (
                    <pre className="mt-3 max-h-[50vh] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">
                      {formatJson(summaryQuery.data ?? selectedRun)}
                    </pre>
                  )
                ) : (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (endpoint resume manquant).
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium">Resultats</p>
                {recoRunItemsEndpoint ? (
                  itemsQuery.isLoading ? (
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : itemsQuery.error ? (
                    isUnavailableError(itemsQuery.error) ? (
                      <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                        {formatApiErrorMessage(
                          itemsQuery.error,
                          "Resultats indisponibles."
                        )}
                      </div>
                    ) : (
                      <ErrorState
                        message={formatApiErrorMessage(
                          itemsQuery.error,
                          "Impossible de charger les resultats du run."
                        )}
                      />
                    )
                  ) : itemHeaders.length === 0 ? (
                    <EmptyState
                      title="Aucun resultat"
                      description="Aucune recommandation rattachee a ce run."
                    />
                  ) : (
                    <DataTable
                      columns={itemColumns}
                      data={itemRows}
                      isLoading={itemsQuery.isLoading}
                      filterPlaceholder="Rechercher une recommandation..."
                      emptyMessage="Aucun resultat disponible."
                    />
                  )
                ) : (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (endpoint resultats manquant).
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState title="Aucun detail disponible." />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau run</DialogTitle>
            <DialogDescription>
              Lance un run de recommandations avec les parametres souhaites.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="run-top-n">Batch size (top N)</Label>
              <Input
                id="run-top-n"
                type="number"
                min={1}
                max={20}
                value={runForm.topN}
                onChange={(event) =>
                  setRunForm((prev) => ({
                    ...prev,
                    topN: Number(event.target.value) || 5,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-segment">Segment (optionnel)</Label>
              <Input
                id="run-segment"
                value={runForm.segment}
                onChange={(event) =>
                  setRunForm((prev) => ({
                    ...prev,
                    segment: event.target.value,
                  }))
                }
                placeholder="Ex: Champions"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRunDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={() => runMutation.mutate(runForm)}
              disabled={!runGenerateEndpoint || runMutation.isPending}
            >
              {runMutation.isPending ? "Lancement..." : "Lancer le run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
