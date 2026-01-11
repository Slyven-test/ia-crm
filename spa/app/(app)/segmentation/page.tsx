"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatNumber, humanizeKey } from "@/lib/format";

type TableRowData = Record<string, unknown>;

type NormalizedTable = {
  columns: string[];
  rows: TableRowData[];
};

const UNAVAILABLE_STATUSES = new Set([404, 501]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function resolveStringEndpoint(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
  const [rfmRunUnavailable, setRfmRunUnavailable] = useState(false);
  const [clustersRecomputeUnavailable, setClustersRecomputeUnavailable] =
    useState(false);
  const endpointsRecord = endpoints as unknown as Record<string, unknown>;
  const rfmRecord = isRecord(endpointsRecord.rfm) ? endpointsRecord.rfm : null;
  const clustersRecord = isRecord(endpointsRecord.clusters)
    ? endpointsRecord.clusters
    : null;

  const rfmDistributionEndpoint = resolveStringEndpoint(
    rfmRecord?.distribution
  );
  const rfmRunEndpoint = resolveStringEndpoint(rfmRecord?.run);
  const clustersListEndpoint = resolveStringEndpoint(clustersRecord?.list);
  const clustersRecomputeEndpoint = resolveStringEndpoint(
    clustersRecord?.recompute
  );

  const rfmAvailable = Boolean(rfmDistributionEndpoint);
  const clustersAvailable = Boolean(clustersListEndpoint);

  const rfmQuery = useQuery({
    queryKey: ["rfm", "distribution", rfmDistributionEndpoint ?? "none"],
    queryFn: () => {
      if (!rfmDistributionEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(rfmDistributionEndpoint);
    },
    enabled: rfmAvailable,
  });
  const clustersQuery = useQuery({
    queryKey: ["clusters", clustersListEndpoint ?? "none"],
    queryFn: () => {
      if (!clustersListEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(clustersListEndpoint);
    },
    enabled: clustersAvailable,
  });

  const rfmRun = useMutation({
    mutationFn: () => {
      if (!rfmRunEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest(rfmRunEndpoint, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      toast.success("Analyse RFM lancee.");
      setRfmRunUnavailable(false);
      await rfmQuery.refetch();
    },
    onError: (error) => {
      if (isUnavailableError(error)) {
        setRfmRunUnavailable(true);
      }
      toast.error(
        formatApiErrorMessage(error, "Impossible de lancer l'analyse RFM.")
      );
    },
  });

  const recomputeClusters = useMutation({
    mutationFn: () => {
      if (!clustersRecomputeEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest(clustersRecomputeEndpoint, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      toast.success("Recalcul des clusters lance.");
      setClustersRecomputeUnavailable(false);
      await clustersQuery.refetch();
    },
    onError: (error) => {
      if (isUnavailableError(error)) {
        setClustersRecomputeUnavailable(true);
      }
      toast.error(
        formatApiErrorMessage(error, "Impossible de recalculer les clusters.")
      );
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

  const rfmUnavailable =
    !rfmAvailable ||
    (rfmQuery.isError && isUnavailableError(rfmQuery.error));
  const clustersUnavailable =
    !clustersAvailable ||
    (clustersQuery.isError && isUnavailableError(clustersQuery.error));

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
              disabled={
                !rfmRunEndpoint ||
                rfmRun.isPending ||
                rfmUnavailable ||
                rfmRunUnavailable
              }
            >
              {rfmRunEndpoint && !rfmUnavailable && !rfmRunUnavailable
                ? "Lancer RFM"
                : "Non disponible"}
            </Button>
          </CardHeader>
          <CardContent>
            {rfmUnavailable ? (
              <EmptyState
                title="RFM indisponible."
                description="Non disponible (endpoint RFM absent ou indisponible)."
              />
            ) : rfmQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : rfmQuery.error ? (
              <ErrorState
                message={formatApiErrorMessage(
                  rfmQuery.error,
                  "Impossible de charger la distribution RFM."
                )}
              />
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
              disabled={
                !clustersRecomputeEndpoint ||
                recomputeClusters.isPending ||
                clustersUnavailable ||
                clustersRecomputeUnavailable
              }
            >
              {clustersRecomputeEndpoint &&
              !clustersUnavailable &&
              !clustersRecomputeUnavailable
                ? "Recalculer clusters"
                : "Non disponible"}
            </Button>
          </CardHeader>
          <CardContent>
            {clustersUnavailable ? (
              <EmptyState
                title="Clusters indisponibles."
                description="Non disponible (endpoint clusters absent ou indisponible)."
              />
            ) : clustersQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : clustersQuery.error ? (
              <ErrorState
                message={formatApiErrorMessage(
                  clustersQuery.error,
                  "Impossible de charger les clusters."
                )}
              />
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
