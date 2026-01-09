"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { humanizeKey } from "@/lib/format";

type CustomerRow = Record<string, unknown>;

function isRecord(value: unknown): value is CustomerRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): CustomerRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "clients", "customers"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return (value[key] as unknown[]).filter(isRecord);
      }
    }
  }
  return [];
}

function buildHeaders(rows: CustomerRow[]): string[] {
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

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function getCustomerId(row: CustomerRow | null) {
  if (!row) return null;
  const candidateKeys = [
    "client_code",
    "clientCode",
    "customer_code",
    "customerCode",
    "customer_id",
    "customerId",
    "id",
    "code",
    "email",
  ];
  for (const key of candidateKeys) {
    if (key in row && row[key] !== null && row[key] !== undefined) {
      return String(row[key]);
    }
  }
  return null;
}

export default function CustomersPage() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null
  );
  const [showRecommendations, setShowRecommendations] = useState(false);
  const lastToastRef = useRef<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => apiRequest<unknown>(endpoints.clients.list),
  });

  const rows = useMemo(
    () => normalizeRows(customersQuery.data),
    [customersQuery.data]
  );
  const headers = useMemo(() => buildHeaders(rows), [rows]);
  const selectedId = getCustomerId(selectedCustomer);

  const detailQuery = useQuery({
    queryKey: ["customers", "detail", selectedId],
    queryFn: () =>
      apiRequest<CustomerRow>(endpoints.clients.detail(selectedId as string)),
    enabled: Boolean(selectedId),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["customers", "recommendations", selectedId],
    queryFn: () =>
      apiRequest<unknown>(endpoints.recommendations.byClient(selectedId as string)),
    enabled: Boolean(selectedId) && showRecommendations,
  });

  const listErrorMessage = customersQuery.error
    ? getErrorMessage(customersQuery.error, "Impossible de charger les clients.")
    : null;

  useEffect(() => {
    if (!listErrorMessage || lastToastRef.current === listErrorMessage) return;
    toast.error(listErrorMessage);
    lastToastRef.current = listErrorMessage;
  }, [listErrorMessage]);

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      ...headers.map((header) => ({
        accessorKey: header,
        header: humanizeKey(header),
        cell: ({ row }) => formatCellValue(row.original[header]),
      })),
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedCustomer(row.original);
              setShowRecommendations(false);
            }}
          >
            Voir details
          </Button>
        ),
      },
    ],
    [headers]
  );

  const hasRows = rows.length > 0;
  const hasColumns = headers.length > 0;
  const isRefreshing = customersQuery.isFetching && !customersQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Contacts et comptes du CRM."
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Clients et contacts</CardTitle>
            <CardDescription>
              Consultez les profils disponibles et leurs metadonnees.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => customersQuery.refetch()}
              disabled={customersQuery.isFetching}
            >
              {isRefreshing ? "Rafraichir..." : "Rafraichir"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {customersQuery.error ? (
            <ErrorState message={listErrorMessage ?? "Erreur inconnue."} />
          ) : customersQuery.isLoading ? (
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
              title="Aucun client disponible."
              description="Les clients apparaitront apres synchronisation."
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              isLoading={customersQuery.isLoading}
              filterPlaceholder="Rechercher un client..."
              emptyMessage={
                hasRows
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucun client disponible."
              }
            />
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selectedCustomer)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCustomer(null);
            setShowRecommendations(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Details du client</DialogTitle>
          </DialogHeader>
          {selectedCustomer ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => detailQuery.refetch()}
                  disabled={!selectedId || detailQuery.isFetching}
                >
                  {detailQuery.isFetching ? "Chargement..." : "Rafraichir"}
                </Button>
                {selectedId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRecommendations(true)}
                    disabled={recommendationsQuery.isFetching}
                  >
                    {recommendationsQuery.isFetching
                      ? "Chargement..."
                      : "Voir recommandations"}
                  </Button>
                ) : null}
              </div>
              {detailQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : detailQuery.error ? (
                <ErrorState
                  message={getErrorMessage(
                    detailQuery.error,
                    "Details indisponibles."
                  )}
                />
              ) : null}
              <pre className="max-h-[50vh] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">
                {formatJson(detailQuery.data ?? selectedCustomer)}
              </pre>
              {showRecommendations ? (
                recommendationsQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : recommendationsQuery.error ? (
                  <ErrorState
                    message={getErrorMessage(
                      recommendationsQuery.error,
                      "Recommandations indisponibles."
                    )}
                  />
                ) : (
                  <pre className="max-h-[40vh] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">
                    {formatJson(recommendationsQuery.data)}
                  </pre>
                )
              ) : null}
            </div>
          ) : (
            <EmptyState title="Aucun detail disponible." />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
