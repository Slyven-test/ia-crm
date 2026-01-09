"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { formatDate, humanizeKey } from "@/lib/format";

type ExportSource = {
  key: string;
  label: string;
  description: string;
  path: string;
};

type ExportAction = {
  id: string;
  label: string;
  path: string;
  filename: string;
  format: "csv" | "json";
};

type ExportRow = Record<string, unknown> & {
  actions?: ExportAction[];
};

type ExportsPayload = {
  rows: ExportRow[];
  headers: string[];
  sourceNote?: string;
};

const EXPORT_SOURCES: ExportSource[] = [
  {
    key: "recommendations",
    label: "Recommandations",
    description: "Recommandations generees pour le tenant courant.",
    path: endpoints.export.recommendations,
  },
  {
    key: "audit",
    label: "Audit",
    description: "Journal d'audit exportable (erreurs, scores, details).",
    path: endpoints.export.audit,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "rows"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return (value[key] as unknown[]).filter(isRecord);
      }
    }
  }
  return [];
}

function buildHeaders(rows: ExportRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "actions") continue;
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function formatCellValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number") {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("date") || normalizedKey.endsWith("_at")) {
      return formatDate(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return `${value.length}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function triggerDownload(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fetchExports(): Promise<ExportsPayload> {
  const fallbackSources: string[] = [];

  const rows = await Promise.all(
    EXPORT_SOURCES.map(async (source) => {
      let recordCount: number | null = null;
      let jsonAvailable = true;

      try {
        const jsonData = await apiRequest<unknown>(`${source.path}?format=json`);
        recordCount = normalizeRows(jsonData).length;
      } catch (error) {
        if (
          error instanceof ApiError &&
          [404, 405, 415, 501].includes(error.status)
        ) {
          jsonAvailable = false;
          fallbackSources.push(`export ${source.key}`);
        } else {
          throw error;
        }
      }

      const actions: ExportAction[] = [
        {
          id: `${source.key}-csv`,
          label: "Telecharger CSV",
          path: source.path,
          filename: `${source.key}.csv`,
          format: "csv",
        },
      ];

      if (jsonAvailable) {
        actions.push({
          id: `${source.key}-json`,
          label: "Telecharger JSON",
          path: `${source.path}?format=json`,
          filename: `${source.key}.json`,
          format: "json",
        });
      }

      return {
        export: source.label,
        description: source.description,
        records: recordCount ?? "-",
        formats: jsonAvailable ? "CSV, JSON" : "CSV",
        actions,
      } satisfies ExportRow;
    })
  );

  const sourceNote = fallbackSources.length
    ? `source: ${fallbackSources.join(", ")}`
    : undefined;

  return {
    rows,
    headers: buildHeaders(rows),
    sourceNote,
  };
}

export default function ExportsPage() {
  const query = useQuery({
    queryKey: ["exports", "sources"],
    queryFn: fetchExports,
  });

  const downloadMutation = useMutation({
    mutationFn: async (action: ExportAction) => {
      if (action.format === "json") {
        const data = await apiRequest<unknown>(action.path, {
          headers: { Accept: "application/json" },
        });
        const payload =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        triggerDownload(payload, action.filename, "application/json");
        return;
      }

      const csvText = await apiRequest<string>(action.path, {
        headers: { Accept: "text/csv" },
      });
      triggerDownload(csvText, action.filename, "text/csv;charset=utf-8");
    },
    onSuccess: (_, action) => {
      toast.success(`${action.label} termine.`);
    },
    onError: () => {
      toast.error("Impossible de telecharger l'export.");
    },
  });

  const pendingActionId = downloadMutation.variables?.id;
  const isDownloading = downloadMutation.isPending;

  const columns = useMemo<ColumnDef<ExportRow>[]>(() => {
    const headers = query.data?.headers ?? [];
    const baseColumns = headers.map((header) => ({
      accessorKey: header,
      header: humanizeKey(header),
      cell: ({ row }: { row: { original: ExportRow } }) =>
        formatCellValue(row.original[header], header),
    }));

    return [
      ...baseColumns,
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        cell: ({ row }: { row: { original: ExportRow } }) => {
          const actions = row.original.actions ?? [];
          if (!actions.length) return null;
          return (
            <div className="flex flex-wrap justify-end gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant="outline"
                  onClick={() => downloadMutation.mutate(action)}
                  disabled={
                    isDownloading && pendingActionId === action.id
                  }
                >
                  {isDownloading && pendingActionId === action.id
                    ? "Telechargement..."
                    : action.label}
                </Button>
              ))}
            </div>
          );
        },
      },
    ];
  }, [
    downloadMutation,
    isDownloading,
    pendingActionId,
    query.data?.headers,
  ]);

  const hasRows = (query.data?.rows ?? []).length > 0;
  const hasColumns = (query.data?.headers ?? []).length > 0;
  const isRefreshing = query.isFetching && !query.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        description="Generation et telechargement des exports (CSV, etc.)."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Exports</CardTitle>
            <CardDescription>
              Liste des exports disponibles pour les equipes marketing et data.
            </CardDescription>
            {query.data?.sourceNote ? (
              <p className="text-xs text-muted-foreground">
                {query.data.sourceNote}
              </p>
            ) : null}
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
            <ErrorState message="Impossible de charger les exports." />
          ) : query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-48" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : !hasColumns ? (
            <EmptyState
              title="Aucun export disponible."
              description="Les exports apparaitront apres les premieres donnees."
            />
          ) : (
            <DataTable
              columns={columns}
              data={query.data?.rows ?? []}
              isLoading={query.isLoading}
              filterPlaceholder="Rechercher un export..."
              emptyMessage={
                hasRows
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucun export disponible."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
