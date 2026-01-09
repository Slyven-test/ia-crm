"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RunItemsDialog } from "@/components/run-items-dialog";
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

type RunRow = Record<string, unknown>;

type RunSummaryDownload = {
  runId: string | number;
};

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

function getRunId(run: RunRow): string | number | null {
  if (typeof run.run_id === "string" || typeof run.run_id === "number") {
    return run.run_id;
  }
  if (typeof run.id === "string" || typeof run.id === "number") {
    return run.id;
  }
  return null;
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
  const [selectedRun, setSelectedRun] = useState<string | number | null>(null);
  const [activeDownloadRun, setActiveDownloadRun] = useState<
    string | number | null
  >(null);

  const query = useQuery({
    queryKey: ["reco-runs"],
    queryFn: () => apiRequest<unknown>(endpoints.recoRuns.list),
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ runId }: RunSummaryDownload) => {
      try {
        const csvPayload = await apiRequest<string>(
          endpoints.export.runs(runId, "csv"),
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
            endpoints.export.runs(runId, "json")
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
    onError: (_, variables) => {
      toast.error(
        variables?.runId
          ? `Impossible d'exporter le run ${variables.runId}.`
          : "Impossible de telecharger le run."
      );
    },
    onSettled: () => {
      setActiveDownloadRun(null);
    },
  });

  const rows = useMemo(() => normalizeRuns(query.data), [query.data]);

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
        header: "Type",
        accessorFn: (row) =>
          getStringValue(row, ["type", "run_type", "pipeline", "kind"]),
        cell: ({ row }) => {
          const value = getStringValue(row.original, [
            "type",
            "run_type",
            "pipeline",
            "kind",
          ]);
          return value ? String(value) : "-";
        },
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
        id: "items",
        header: "Items",
        accessorFn: (row) =>
          getCountValue(row, ["total_items", "items_count", "item_count"]),
        cell: ({ row }) => {
          const value = getCountValue(row.original, [
            "total_items",
            "items_count",
            "item_count",
          ]);
          return value !== null ? formatNumber(value) : "-";
        },
      },
      {
        id: "clients",
        header: "Clients",
        accessorFn: (row) =>
          getCountValue(row, [
            "total_clients",
            "clients_count",
            "client_count",
          ]),
        cell: ({ row }) => {
          const value = getCountValue(row.original, [
            "total_clients",
            "clients_count",
            "client_count",
          ]);
          return value !== null ? formatNumber(value) : "-";
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const runId = getRunId(row.original);
          const isDownloading =
            downloadMutation.isPending && runId === activeDownloadRun;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => runId && setSelectedRun(runId)}
                disabled={!runId}
              >
                Voir details
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!runId) return;
                  setActiveDownloadRun(runId);
                  downloadMutation.mutate({ runId });
                }}
                disabled={!runId || isDownloading}
              >
                {isDownloading ? "Export..." : "Exporter"}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/exports">Voir exports</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [downloadMutation, activeDownloadRun]
  );

  const hasRows = rows.length > 0;
  const isRefreshing = query.isFetching && !query.isLoading;
  const errorMessage =
    query.error instanceof ApiError
      ? query.error.message
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {isRefreshing ? "Rafraichir..." : "Rafraichir"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {query.error ? (
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
      <RunItemsDialog
        runId={selectedRun}
        open={Boolean(selectedRun)}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
      />
    </div>
  );
}
