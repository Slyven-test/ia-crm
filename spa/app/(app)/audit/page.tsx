"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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
import { humanizeKey } from "@/lib/format";

type AuditRow = Record<string, unknown>;

type AuditPayload = {
  rows: AuditRow[];
  headers: string[];
  source: "json" | "csv";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): AuditRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "logs"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function buildHeaders(rows: AuditRow[]): string[] {
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
    return { headers: [] as string[], rows: [] as AuditRow[] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCsvLine(headerLine, delimiter).map((header) =>
    header.trim()
  );

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: AuditRow = {};
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

async function fetchAuditData(): Promise<AuditPayload> {
  try {
    const jsonData = await apiRequest<unknown>(endpoints.audit.logs);
    const rows = normalizeRows(jsonData);
    return { rows, headers: buildHeaders(rows), source: "json" };
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      ![404, 405, 501].includes(error.status)
    ) {
      throw error;
    }
  }

  const csvText = await apiRequest<string>(endpoints.export.audit, {
    headers: { Accept: "text/csv" },
  });
  const parsed = parseCsv(csvText);
  return { rows: parsed.rows, headers: parsed.headers, source: "csv" };
}

export default function AuditPage() {
  const query = useQuery({
    queryKey: ["audit", "logs"],
    queryFn: fetchAuditData,
  });

  const columns = useMemo<ColumnDef<AuditRow>[]>(
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        description="Journal des operations et executions."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Journal d'audit</CardTitle>
            <CardDescription>
              Suivi des executions, erreurs et alertes de qualite.
            </CardDescription>
            {query.data?.source === "csv" ? (
              <p className="text-xs text-muted-foreground">
                source: export audit
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
            <ErrorState message="Impossible de charger le journal d'audit." />
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
              title="Aucun audit disponible."
              description="Les audits apparaitront apres la premiere execution."
            />
          ) : (
            <DataTable
              columns={columns}
              data={query.data?.rows ?? []}
              isLoading={query.isLoading}
              filterPlaceholder="Rechercher dans l'audit..."
              emptyMessage={
                hasData
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucun audit disponible."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
