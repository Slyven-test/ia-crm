"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";

type RecoRun = {
  id?: string | number;
  run_id?: string | number;
  executed_at?: string;
  created_at?: string;
  status?: string;
};

type ExportOverview = {
  counts: {
    recommendations?: number | null;
    audit?: number | null;
  };
  fallbackSources: string[];
};

type DownloadTarget = {
  endpoint: string;
  filename: string;
  accept: string;
  parseAsJson?: boolean;
};

type ExportRow = {
  id: string;
  export: string;
  description: string;
  format: string;
  scope: string;
  run: string;
  count?: number | null;
  status: string;
  download?: DownloadTarget;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function fetchLatestRun(): Promise<RecoRun | null> {
  const data = await apiRequest<RecoRun[]>(
    `${endpoints.recoRuns.list}?limit=1`
  );
  return data[0] ?? null;
}

async function fetchExportOverview(): Promise<ExportOverview> {
  const fallbackSources: string[] = [];
  const counts: ExportOverview["counts"] = {};

  const results = await Promise.allSettled([
    apiRequest<unknown>(`${endpoints.export.recommendations}?format=json`),
    apiRequest<unknown>(`${endpoints.export.audit}?format=json`),
  ]);

  const [recommendationsResult, auditResult] = results;

  if (recommendationsResult.status === "fulfilled") {
    counts.recommendations = normalizeRows(recommendationsResult.value).length;
  } else if (
    recommendationsResult.reason instanceof ApiError &&
    [404, 405, 501].includes(recommendationsResult.reason.status)
  ) {
    counts.recommendations = null;
    fallbackSources.push("export recommendations");
  } else {
    throw recommendationsResult.reason;
  }

  if (auditResult.status === "fulfilled") {
    counts.audit = normalizeRows(auditResult.value).length;
  } else if (
    auditResult.reason instanceof ApiError &&
    [404, 405, 501].includes(auditResult.reason.status)
  ) {
    counts.audit = null;
    fallbackSources.push("export audit");
  } else {
    throw auditResult.reason;
  }

  return { counts, fallbackSources };
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

export default function ExportsPage() {
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const latestRunQuery = useQuery({
    queryKey: ["reco-runs", "latest"],
    queryFn: fetchLatestRun,
  });
  const overviewQuery = useQuery({
    queryKey: ["exports", "overview"],
    queryFn: fetchExportOverview,
  });

  const downloadMutation = useMutation({
    mutationFn: async (row: ExportRow) => {
      if (!row.download) {
        throw new Error("Export indisponible.");
      }
      const { endpoint, filename, accept, parseAsJson } = row.download;
      if (parseAsJson) {
        const data = await apiRequest<unknown>(endpoint, {
          headers: { Accept: "application/json" },
        });
        triggerDownload(JSON.stringify(data, null, 2), filename, "application/json");
        return;
      }
      const payload = await apiRequest<string>(endpoint, {
        headers: { Accept: accept },
      });
      triggerDownload(payload, filename, accept);
    },
    onSuccess: (_, row) => {
      toast.success(`Export ${row.export} telecharge.`);
    },
    onError: (_, row) => {
      toast.error(
        row?.export
          ? `Impossible de telecharger ${row.export}.`
          : "Impossible de telecharger l'export."
      );
    },
    onSettled: () => {
      setActiveDownloadId(null);
    },
  });

  const latestRunId =
    latestRunQuery.data?.run_id ?? latestRunQuery.data?.id ?? null;
  const runLabel = latestRunId ? String(latestRunId) : "-";

  const rows = useMemo<ExportRow[]>(() => {
    const counts = overviewQuery.data?.counts ?? {};
    const hasRun = Boolean(latestRunId);

    return [
      {
        id: "recommendations",
        export: "Recommandations",
        description: "Export des recommandations clients.",
        format: "CSV",
        scope: "Tenant",
        run: "-",
        count: counts.recommendations ?? null,
        status: "Disponible",
        download: {
          endpoint: `${endpoints.export.recommendations}?format=csv`,
          filename: "recommendations.csv",
          accept: "text/csv",
        },
      },
      {
        id: "audit",
        export: "Audit",
        description: "Export des journaux d'audit.",
        format: "CSV",
        scope: "Tenant",
        run: "-",
        count: counts.audit ?? null,
        status: "Disponible",
        download: {
          endpoint: `${endpoints.export.audit}?format=csv`,
          filename: "audit_logs.csv",
          accept: "text/csv",
        },
      },
      {
        id: "reco_output",
        export: "Reco output",
        description: "Export complet des recommandations du run.",
        format: "CSV",
        scope: "Run",
        run: runLabel,
        status: hasRun ? "Disponible" : "Run manquant",
        download: hasRun
          ? {
              endpoint: `/export/runs/${latestRunId}/reco_output.csv`,
              filename: `reco_output_${latestRunId}.csv`,
              accept: "text/csv",
            }
          : undefined,
      },
      {
        id: "audit_output",
        export: "Audit output",
        description: "Export des regles et scores par client.",
        format: "CSV",
        scope: "Run",
        run: runLabel,
        status: hasRun ? "Disponible" : "Run manquant",
        download: hasRun
          ? {
              endpoint: `/export/runs/${latestRunId}/audit_output.csv`,
              filename: `audit_output_${latestRunId}.csv`,
              accept: "text/csv",
            }
          : undefined,
      },
      {
        id: "next_action_output",
        export: "Next action",
        description: "Export des eligibilites et actions proposees.",
        format: "CSV",
        scope: "Run",
        run: runLabel,
        status: hasRun ? "Disponible" : "Run manquant",
        download: hasRun
          ? {
              endpoint: `/export/runs/${latestRunId}/next_action_output.csv`,
              filename: `next_action_${latestRunId}.csv`,
              accept: "text/csv",
            }
          : undefined,
      },
      {
        id: "run_summary",
        export: "Run summary",
        description: "Resume JSON avec gating et scores.",
        format: "JSON",
        scope: "Run",
        run: runLabel,
        status: hasRun ? "Disponible" : "Run manquant",
        download: hasRun
          ? {
              endpoint: `/export/runs/${latestRunId}/run_summary.json`,
              filename: `run_summary_${latestRunId}.json`,
              accept: "application/json",
              parseAsJson: true,
            }
          : undefined,
      },
    ];
  }, [latestRunId, overviewQuery.data?.counts, runLabel]);

  const columns = useMemo<ColumnDef<ExportRow>[]>(
    () => [
      {
        accessorKey: "export",
        header: "Export",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.export}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.description}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "format",
        header: "Format",
        cell: ({ row }) => row.original.format,
      },
      {
        accessorKey: "scope",
        header: "Perimetre",
        cell: ({ row }) => row.original.scope,
      },
      {
        accessorKey: "run",
        header: "Run",
        cell: ({ row }) => row.original.run,
      },
      {
        accessorKey: "count",
        header: "Lignes",
        cell: ({ row }) => formatCellValue(row.original.count),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => row.original.status,
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => {
          const isDownloading =
            downloadMutation.isPending && activeDownloadId === row.original.id;
          const isDisabled = !row.original.download || isDownloading;
          return row.original.download ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveDownloadId(row.original.id);
                downloadMutation.mutate(row.original);
              }}
              disabled={isDisabled}
            >
              {isDownloading ? "Telechargement..." : "Telecharger"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Indisponible</span>
          );
        },
      },
    ],
    [activeDownloadId, downloadMutation]
  );

  const hasError = Boolean(latestRunQuery.error || overviewQuery.error);
  const isLoading =
    latestRunQuery.isLoading || overviewQuery.isLoading;
  const isRefreshing =
    (latestRunQuery.isFetching || overviewQuery.isFetching) && !isLoading;
  const fallbackSources = overviewQuery.data?.fallbackSources ?? [];
  const hasRows = rows.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        description="Telechargements CSV/JSON des donnees IA-CRM."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Exports disponibles</CardTitle>
            <CardDescription>
              Dernier run detecte :{" "}
              {latestRunId ? String(latestRunId) : "Aucun run trouve"}
            </CardDescription>
            {fallbackSources.length ? (
              <p className="text-xs text-muted-foreground">
                source: {fallbackSources.join(", ")}
              </p>
            ) : null}
          </div>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                latestRunQuery.refetch();
                overviewQuery.refetch();
              }}
              disabled={latestRunQuery.isFetching || overviewQuery.isFetching}
            >
              {isRefreshing ? "Rafraichir..." : "Rafraichir"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {hasError ? (
            <ErrorState message="Impossible de charger les exports." />
          ) : isLoading ? (
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
              title="Aucun export disponible."
              description="Lancez un run pour generer de nouveaux exports."
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              isLoading={isLoading}
              filterPlaceholder="Rechercher un export..."
              emptyMessage="Aucun export disponible."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
