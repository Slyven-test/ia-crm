"use client";

import { type CellContext, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";

type ImportRun = Record<string, unknown>;
type UploadKind = "clients" | "produits" | "ventes";

const importEndpoints = {
  status: "/etl/state",
  trigger: "/etl/ingest",
};

const uploadKinds: UploadKind[] = ["clients", "produits", "ventes"];
const statusSuccessValues = new Set([
  "success",
  "ok",
  "done",
  "completed",
  "complete",
  "succeeded",
  "finished",
]);
const statusFailureValues = new Set([
  "failed",
  "error",
  "ko",
  "echec",
  "canceled",
  "cancelled",
]);
const importDateKeys = [
  "imported_at",
  "started_at",
  "finished_at",
  "completed_at",
  "created_at",
  "updated_at",
  "run_at",
  "timestamp",
  "date",
];

function resolveUploadEndpoint(): string | null {
  const record = endpoints as Record<string, unknown>;
  if (!("imports" in record)) return null;
  const importsValue = record.imports;
  if (!importsValue || typeof importsValue !== "object") return null;
  const uploadValue = (importsValue as Record<string, unknown>).upload;
  if (typeof uploadValue === "string" && uploadValue.length > 0) {
    return uploadValue;
  }
  return null;
}

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

function parseStatusValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (statusSuccessValues.has(normalized)) return true;
  if (statusFailureValues.has(normalized)) return false;
  return null;
}

function getSuccessValue(run: ImportRun) {
  const direct = pickValue(run, ["success", "status", "state"], parseStatusValue);
  if (direct !== null) return direct;
  const verification = getVerification(run);
  if (verification) {
    const parsed = parseStatusValue(verification.success);
    if (parsed !== null) return parsed;
  }
  return null;
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

function pickDateValue(run: ImportRun) {
  return pickValue(
    run,
    importDateKeys,
    (candidate): candidate is string | number =>
      typeof candidate === "string" || typeof candidate === "number"
  );
}

function extractFileLabel(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.split("/").pop() ?? trimmed;
  }
  if (isRecord(value)) {
    const candidate = pickValue(
      value,
      ["file", "filename", "file_name", "name", "path", "source"],
      (item): item is string => typeof item === "string"
    );
    if (candidate) return candidate.split("/").pop() ?? candidate;
  }
  return null;
}

function getFileLabel(run: ImportRun) {
  const direct = pickValue(
    run,
    ["file", "filename", "file_name", "name", "path", "source_file", "source"],
    (candidate): candidate is string => typeof candidate === "string"
  );
  if (direct) return extractFileLabel(direct);
  if (Array.isArray(run.ingested_files)) {
    const labels = run.ingested_files
      .map(extractFileLabel)
      .filter((item): item is string => Boolean(item));
    if (labels.length === 1) return labels[0];
    if (labels.length > 1) {
      return `${labels[0]} (+${labels.length - 1})`;
    }
  }
  return null;
}

export default function ImportsPage() {
  const uploadEndpoint = resolveUploadEndpoint();
  const [uploadUnavailable, setUploadUnavailable] = useState<boolean>(
    uploadEndpoint === null
  );
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState<UploadKind>("clients");
  const [fileInputKey, setFileInputKey] = useState<number>(0);

  const historyQuery = useQuery({
    queryKey: ["etl-state"],
    queryFn: () => apiRequest<unknown>(importEndpoints.status),
  });

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: () => apiRequest<unknown>(endpoints.tenants.list),
  });

  const rows = useMemo(
    () => normalizeRuns(historyQuery.data),
    [historyQuery.data]
  );
  const tenantIds = useMemo(
    () => normalizeTenantIds(tenantsQuery.data, rows),
    [tenantsQuery.data, rows]
  );
  const lastRunAt = getLastRunAt(historyQuery.data);

  const ingestMutation = useMutation({
    mutationFn: async (tenants: string[]) =>
      apiRequest(importEndpoints.trigger, {
        method: "POST",
        body: { tenants, isolate_schema: false },
      }),
    onSuccess: (_, tenants) => {
      toast.success(
        tenants.length
          ? `Import lance pour ${tenants.length} tenant(s).`
          : "Import lance."
      );
      historyQuery.refetch();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Impossible de lancer l'import.";
      toast.error(message);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; kind: UploadKind }) => {
      if (!uploadEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Endpoint d'upload indisponible.",
        });
      }
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("type", payload.kind);
      return apiRequest(uploadEndpoint, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      toast.success("Fichier envoye.");
      setUploadFile(null);
      setFileInputKey((prev) => prev + 1);
      historyQuery.refetch();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        setUploadUnavailable(true);
      }
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Impossible d'envoyer le fichier.";
      toast.error(message);
    },
  });

  const columns = useMemo<ColumnDef<ImportRun>[]>(
    () => [
      {
        id: "status",
        header: "Statut",
        accessorFn: (row) => getSuccessValue(row),
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          getStatusBadge(getSuccessValue(ctx.row.original)),
      },
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => pickDateValue(row),
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          formatDate(pickDateValue(ctx.row.original)),
      },
      {
        id: "file",
        header: "Fichier",
        accessorFn: (row) => getFileLabel(row) ?? "-",
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          getFileLabel(ctx.row.original) ?? "-",
      },
    ],
    []
  );

  const hasRows = rows.length > 0;
  const isRefreshing = historyQuery.isFetching && !historyQuery.isLoading;
  const historyUnavailable =
    historyQuery.error instanceof ApiError && historyQuery.error.status === 404;
  const errorMessage =
    historyQuery.error instanceof ApiError
      ? historyQuery.error.message
      : "Impossible de charger les imports.";
  const launchDisabled = ingestMutation.isPending || tenantIds.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Suivi des executions ETL et ingestion des donnees."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div>
              <CardTitle>Uploader un fichier</CardTitle>
              <CardDescription>
                Envoyez un CSV pour lancer une ingestion manuelle.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {uploadUnavailable ? (
              <EmptyState
                title="Non disponible"
                description="L'upload de fichiers n'est pas encore disponible."
              />
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!uploadEndpoint) {
                    setUploadUnavailable(true);
                    toast.error("Endpoint d'upload indisponible.");
                    return;
                  }
                  if (!uploadFile) {
                    toast.error("Selectionnez un fichier CSV.");
                    return;
                  }
                  uploadMutation.mutate({ file: uploadFile, kind: uploadKind });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="upload-file">Fichier CSV</Label>
                  <Input
                    key={fileInputKey}
                    id="upload-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) =>
                      setUploadFile(event.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload-kind">Type de donnees</Label>
                  <select
                    id="upload-kind"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={uploadKind}
                    onChange={(event) =>
                      setUploadKind(event.target.value as UploadKind)
                    }
                  >
                    {uploadKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? "Upload..." : "Envoyer le fichier"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
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
                      toast.error(
                        "Aucun tenant disponible pour lancer l'import."
                      );
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
                  onClick={() => historyQuery.refetch()}
                  disabled={historyQuery.isFetching}
                >
                  {isRefreshing ? "Rafraichir..." : "Rafraichir"}
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {historyUnavailable ? (
              <EmptyState
                title="Non disponible"
                description="L'historique des imports n'est pas disponible."
              />
            ) : historyQuery.error ? (
              <ErrorState message={errorMessage} />
            ) : historyQuery.isLoading ? (
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
                title="Aucun import pour le moment"
                description="L'historique apparaitra apres la premiere ingestion."
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                isLoading={historyQuery.isLoading}
                filterPlaceholder="Rechercher un import..."
                emptyMessage={
                  hasRows
                    ? "Aucun resultat ne correspond au filtre."
                    : "Aucun import pour le moment."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
