"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatNumber, humanizeKey } from "@/lib/format";

type TableRowData = Record<string, unknown>;

type NormalizedTable = {
  columns: string[];
  rows: TableRowData[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeTableData(
  data: unknown,
  labels?: { keyLabel?: string; valueLabel?: string; fallbackLabel?: string }
): NormalizedTable {
  const keyLabel = labels?.keyLabel ?? "Segment";
  const valueLabel = labels?.valueLabel ?? "Valeur";
  const fallbackLabel = labels?.fallbackLabel ?? "Valeur";

  if (Array.isArray(data)) {
    if (!data.length) return { columns: [], rows: [] };
    const columns: string[] = [];
    const rows = data.map((item) => {
      if (isPlainObject(item)) {
        Object.keys(item).forEach((key) => {
          if (!columns.includes(key)) columns.push(key);
        });
        return item;
      }
      if (!columns.includes(fallbackLabel)) columns.push(fallbackLabel);
      return { [fallbackLabel]: item };
    });
    return { columns, rows };
  }

  if (isPlainObject(data)) {
    const rows = Object.entries(data).map(([key, value]) => ({
      [keyLabel]: key,
      [valueLabel]: value,
    }));
    return { columns: [keyLabel, valueLabel], rows };
  }

  if (data !== null && data !== undefined) {
    return {
      columns: [fallbackLabel],
      rows: [{ [fallbackLabel]: data }],
    };
  }

  return { columns: [], rows: [] };
}

function SimpleTable({ columns, rows }: NormalizedTable) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{humanizeKey(column)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`row-${index}`}>
              {columns.map((column) => (
                <TableCell key={`${index}-${column}`}>
                  {formatCellValue(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SegmentationPage() {
  const rfmQuery = useQuery({
    queryKey: ["rfm", "distribution"],
    queryFn: () => apiRequest<unknown>(endpoints.rfm.distribution),
  });
  const clustersQuery = useQuery({
    queryKey: ["clusters"],
    queryFn: () => apiRequest<unknown>(endpoints.clusters.list),
  });

  const rfmRun = useMutation({
    mutationFn: () =>
      apiRequest(endpoints.rfm.run, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Analyse RFM lancee.");
      rfmQuery.refetch();
    },
    onError: () => {
      toast.error("Impossible de lancer l'analyse RFM.");
    },
  });

  const recomputeClusters = useMutation({
    mutationFn: () =>
      apiRequest(endpoints.clusters.recompute, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Recalcul des clusters lance.");
      clustersQuery.refetch();
    },
    onError: () => {
      toast.error("Impossible de recalculer les clusters.");
    },
  });

  const rfmTable = normalizeTableData(rfmQuery.data, {
    keyLabel: "Segment",
    valueLabel: "Valeur",
    fallbackLabel: "Valeur",
  });
  const clustersTable = normalizeTableData(clustersQuery.data, {
    keyLabel: "Cluster",
    valueLabel: "Valeur",
    fallbackLabel: "Valeur",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segmentation"
        description="RFM, clusters et segments clients."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>RFM</CardTitle>
            <Button
              onClick={() => rfmRun.mutate()}
              disabled={rfmRun.isPending}
            >
              Lancer RFM
            </Button>
          </CardHeader>
          <CardContent>
            {rfmQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : rfmQuery.error ? (
              <ErrorState message="Impossible de charger la distribution RFM." />
            ) : rfmTable.rows.length ? (
              <SimpleTable {...rfmTable} />
            ) : (
              <EmptyState
                title="Aucune distribution RFM disponible."
                description="Lancez une analyse pour generer les segments."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Clusters</CardTitle>
            <Button
              variant="outline"
              onClick={() => recomputeClusters.mutate()}
              disabled={recomputeClusters.isPending}
            >
              Recalculer clusters
            </Button>
          </CardHeader>
          <CardContent>
            {clustersQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : clustersQuery.error ? (
              <ErrorState message="Impossible de charger les clusters." />
            ) : clustersTable.rows.length ? (
              <SimpleTable {...clustersTable} />
            ) : (
              <EmptyState
                title="Aucun cluster disponible."
                description="Relancez le calcul pour obtenir des groupes."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
