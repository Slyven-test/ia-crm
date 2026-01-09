"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
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
import { humanizeKey } from "@/lib/format";

type RecommendationRow = Record<string, unknown>;

type RecommendationsPayload = {
  rows: RecommendationRow[];
  headers: string[];
  source: "json" | "csv";
  raw?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): RecommendationRow[] {
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

function buildHeaders(rows: RecommendationRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `${value.length} element(s)`;
  return JSON.stringify(value);
}

function detectDelimiter(line: string) {
  const commaCount = (line.match(/,/g) || []).length;
  const semiCount = (line.match(/;/g) || []).length;
  return semiCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const output: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current);
  return output;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) {
    return { headers: [] as string[], rows: [] as RecommendationRow[] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCsvLine(headerLine, delimiter).map((header) =>
    header.trim()
  );

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: RecommendationRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = values[index] ?? "";
    });
    return row;
  });

  const filteredRows = rows.filter((row) =>
    Object.values(row).some((value) => value !== "")
  );

  return { headers, rows: filteredRows };
}

async function fetchRecommendations(): Promise<RecommendationsPayload> {
  try {
    const jsonData = await apiRequest<unknown>(endpoints.recommendations.list);
    const rows = normalizeRows(jsonData);
    return { rows, headers: buildHeaders(rows), source: "json", raw: jsonData };
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      ![404, 405, 501].includes(error.status)
    ) {
      throw error;
    }
  }

  const csvText = await apiRequest<string>(endpoints.export.recommendations, {
    headers: { Accept: "text/csv" },
  });
  const parsed = parseCsv(csvText);
  return { rows: parsed.rows, headers: parsed.headers, source: "csv" };
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

export default function RecommendationsPage() {
  const query = useQuery({
    queryKey: ["recommendations"],
    queryFn: fetchRecommendations,
  });

  const columns = useMemo<ColumnDef<RecommendationRow>[]>(
    () =>
      (query.data?.headers ?? []).map((header) => ({
        accessorKey: header,
        header: humanizeKey(header),
        cell: ({ row }) => formatCellValue(row.original[header]),
      })),
    [query.data?.headers]
  );

  const hasData = (query.data?.rows ?? []).length > 0;
  const hasColumns = columns.length > 0;
  const isRefreshing = query.isFetching && !query.isLoading;

  const csvDownload = useMutation({
    mutationFn: async () => {
      const csvPayload = await apiRequest<string>(
        endpoints.export.recommendations,
        { headers: { Accept: "text/csv" } }
      );
      triggerDownload(csvPayload, "recommendations.csv", "text/csv");
    },
    onSuccess: () => {
      toast.success("Export CSV des recommandations telecharge.");
    },
    onError: () => {
      toast.error("Impossible de telecharger le CSV des recommandations.");
    },
  });

  const jsonDownload = useMutation({
    mutationFn: async () => {
      const payload =
        query.data?.source === "json"
          ? query.data?.raw
          : await apiRequest<unknown>(endpoints.recommendations.list);
      triggerDownload(
        JSON.stringify(payload ?? {}, null, 2),
        "recommendations.json",
        "application/json"
      );
    },
    onSuccess: () => {
      toast.success("Export JSON des recommandations telecharge.");
    },
    onError: () => {
      toast.error("Impossible de telecharger le JSON des recommandations.");
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest(endpoints.recommendations.generate, { method: "POST" }),
    onSuccess: () => {
      toast.success("Generation des recommandations lancee.");
      query.refetch();
    },
    onError: () => {
      toast.error("Impossible de generer les recommandations.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommandations"
        description="Vue globale des recommandations et exports disponibles."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Liste des recommandations</CardTitle>
            <CardDescription>
              Consultez les recommandations issues des derniers calculs.
            </CardDescription>
            {query.data?.source === "csv" ? (
              <p className="text-xs text-muted-foreground">
                source: export recommandations
              </p>
            ) : null}
          </div>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {isRefreshing ? "Rafraichir..." : "Rafraichir"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => csvDownload.mutate()}
              disabled={csvDownload.isPending}
            >
              Telecharger CSV
            </Button>
            {query.data?.source === "json" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => jsonDownload.mutate()}
                disabled={jsonDownload.isPending}
              >
                Telecharger JSON
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              Generer
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {query.error ? (
            <ErrorState message="Impossible de charger les recommandations." />
          ) : query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-56" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : !hasColumns ? (
            <EmptyState
              title="Aucune recommandation disponible."
              description="Les recommandations apparaitront apres une generation."
            />
          ) : (
            <DataTable
              columns={columns}
              data={query.data?.rows ?? []}
              isLoading={query.isLoading}
              filterPlaceholder="Rechercher dans les recommandations..."
              emptyMessage={
                hasData
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucune recommandation disponible."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
