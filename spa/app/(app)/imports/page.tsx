"use client";

import { type CellContext, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
import { formatDate, formatNumber } from "@/lib/format";

type ImportRun = Record<string, unknown>;

type StatusTone = "success" | "error" | "pending" | "neutral";

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
const statusPendingValues = new Set([
  "running",
  "in_progress",
  "pending",
  "processing",
  "queued",
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
  const candidates = ["upload", "create", "ingest"];
  for (const key of candidates) {
    const uploadValue = (importsValue as Record<string, unknown>)[key];
    if (typeof uploadValue === "string" && uploadValue.length > 0) {
      return uploadValue;
    }
  }
  return null;
}

function resolveUploadFieldName(): string {
  const record = endpoints as Record<string, unknown>;
  if (!("imports" in record)) return "file";
  const importsValue = record.imports;
  if (!importsValue || typeof importsValue !== "object") return "file";
  const fieldCandidate =
    (importsValue as Record<string, unknown>).fileField ??
    (importsValue as Record<string, unknown>).file_field;
  return typeof fieldCandidate === "string" && fieldCandidate.length > 0
    ? fieldCandidate
    : "file";
}

function resolveListEndpoint(): string | null {
  const record = endpoints as Record<string, unknown>;
  if ("imports" in record) {
    const importsValue = record.imports;
    if (importsValue && typeof importsValue === "object") {
      const candidates = ["list", "history", "runs", "items"];
      for (const key of candidates) {
        const listValue = (importsValue as Record<string, unknown>)[key];
        if (typeof listValue === "string" && listValue.length > 0) {
          return listValue;
        }
      }
    }
  }
  if ("audit" in record) {
    const auditValue = record.audit;
    if (auditValue && typeof auditValue === "object") {
      const logsValue = (auditValue as Record<string, unknown>).logs;
      if (typeof logsValue === "string" && logsValue.length > 0) {
        return logsValue;
      }
    }
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
    const candidates = ["results", "items", "runs", "imports", "data", "logs"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
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

function pickDateValue(run: ImportRun) {
  return pickValue(
    run,
    importDateKeys,
    (candidate): candidate is string | number =>
      typeof candidate === "string" || typeof candidate === "number"
  );
}

function getStatusValue(run: ImportRun): string | number | boolean | null {
  const raw = pickValue(
    run,
    ["success", "status", "state", "result", "outcome"],
    isStatusCandidate
  );
  if (raw !== null && raw !== undefined) return raw;
  if (isRecord(run.verification)) {
    const verification = run.verification;
    const nested = pickValue(
      verification,
      ["success", "status", "state", "result", "outcome"],
      isStatusCandidate
    );
    if (nested !== null && nested !== undefined) return nested;
  }
  return null;
}

function isStatusCandidate(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function getStatusBadge(value: string | number | boolean | null) {
  if (value === null) {
    return (
      <Badge variant="outline" className="capitalize">
        inconnu
      </Badge>
    );
  }

  if (typeof value === "boolean") {
    return value ? (
      <Badge className="capitalize border-emerald-200 bg-emerald-100 text-emerald-900">
        ok
      </Badge>
    ) : (
      <Badge className="capitalize border-rose-200 bg-rose-100 text-rose-900">
        echec
      </Badge>
    );
  }

  const label = String(value);
  const normalized = label.trim().toLowerCase();
  const tone: StatusTone = statusSuccessValues.has(normalized)
    ? "success"
    : statusFailureValues.has(normalized)
      ? "error"
      : statusPendingValues.has(normalized)
        ? "pending"
        : "neutral";

  if (tone === "success") {
    return (
      <Badge className="capitalize border-emerald-200 bg-emerald-100 text-emerald-900">
        {label}
      </Badge>
    );
  }
  if (tone === "error") {
    return (
      <Badge className="capitalize border-rose-200 bg-rose-100 text-rose-900">
        {label}
      </Badge>
    );
  }
  if (tone === "pending") {
    return (
      <Badge className="capitalize border-sky-200 bg-sky-100 text-sky-900">
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="capitalize">
      {label}
    </Badge>
  );
}

function getLinesValue(run: ImportRun) {
  const keys = [
    "rows",
    "lines",
    "imported_rows",
    "imported_lines",
    "records",
    "count",
    "total",
    "items",
    "inserted",
  ];
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

function getSourceValue(run: ImportRun) {
  const value = pickValue(
    run,
    ["source", "origin", "provider", "system", "channel", "type", "kind"],
    (candidate): candidate is string | number =>
      typeof candidate === "string" || typeof candidate === "number"
  );
  return value ? String(value) : null;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function getMessageValue(run: ImportRun) {
  const value = pickValue(
    run,
    ["message", "detail", "error", "status_message", "summary"],
    (candidate): candidate is string | number | Record<string, unknown> =>
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      isPlainRecord(candidate)
  );
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return null;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let index = -1;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export default function ImportsPage() {
  const uploadEndpoint = resolveUploadEndpoint();
  const uploadFieldName = resolveUploadFieldName();
  const listEndpoint = resolveListEndpoint();
  const [uploadUnavailable, setUploadUnavailable] = useState<boolean>(
    uploadEndpoint === null
  );
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const importsQuery = useQuery({
    queryKey: ["imports", listEndpoint ?? "none"],
    queryFn: () => {
      if (!listEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(listEndpoint);
    },
    enabled: Boolean(listEndpoint),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!uploadEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Endpoint d'upload indisponible.",
        });
      }
      const formData = new FormData();
      formData.append(uploadFieldName, file);
      return apiRequest(uploadEndpoint, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      toast.success("Fichier envoye avec succes.");
      setUploadFile(null);
      setFileInputKey((prev) => prev + 1);
      setUploadError(null);
      if (listEndpoint) {
        importsQuery.refetch();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        setUploadUnavailable(true);
      }
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Impossible d'envoyer le fichier.";
      setUploadError(message);
      toast.error(message);
    },
  });

  const columns = useMemo<ColumnDef<ImportRun>[]>(
    () => [
      {
        id: "status",
        header: "Statut",
        accessorFn: (row) => getStatusValue(row),
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          getStatusBadge(getStatusValue(ctx.row.original)),
      },
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => pickDateValue(row),
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          formatDate(pickDateValue(ctx.row.original)),
      },
      {
        id: "lines",
        header: "Lignes",
        accessorFn: (row) => getLinesValue(row),
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          formatNumber(getLinesValue(ctx.row.original)),
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (row) => getSourceValue(row) ?? "-",
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          getSourceValue(ctx.row.original) ?? "-",
      },
      {
        id: "message",
        header: "Message",
        accessorFn: (row) => getMessageValue(row) ?? "-",
        cell: (ctx: CellContext<ImportRun, unknown>) =>
          getMessageValue(ctx.row.original) ?? "-",
      },
    ],
    []
  );

  const rows = useMemo(
    () => (listEndpoint ? normalizeRuns(importsQuery.data) : []),
    [importsQuery.data, listEndpoint]
  );
  const hasRows = rows.length > 0;
  const isRefreshing = importsQuery.isFetching && !importsQuery.isLoading;
  const listUnavailable =
    !listEndpoint ||
    (importsQuery.error instanceof ApiError &&
      importsQuery.error.status === 404);
  const listErrorMessage =
    importsQuery.error instanceof ApiError
      ? importsQuery.error.message
      : "Impossible de charger les imports.";
  const uploadDisabled =
    uploadUnavailable || uploadMutation.isPending || uploadFile === null;
  const fileInfo = uploadFile
    ? {
        name: uploadFile.name,
        size: formatBytes(uploadFile.size),
        updatedAt: formatDate(uploadFile.lastModified),
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Sources: iSaVigne / Odoo / Woo CSV."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div>
              <CardTitle>Importer un fichier</CardTitle>
              <CardDescription>
                Envoyez un CSV pour lancer une ingestion manuelle.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!uploadEndpoint) {
                  setUploadUnavailable(true);
                  setUploadError("Upload non disponible.");
                  toast.error("Endpoint d'upload indisponible.");
                  return;
                }
                if (!uploadFile) {
                  const message = "Selectionnez un fichier CSV.";
                  setUploadError(message);
                  toast.error(message);
                  return;
                }
                setUploadError(null);
                uploadMutation.mutate(uploadFile);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="upload-file">Fichier CSV</Label>
                <Input
                  ref={fileInputRef}
                  key={fileInputKey}
                  id="upload-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setUploadFile(event.target.files?.[0] ?? null);
                    setUploadError(null);
                  }}
                />
              </div>
              <div
                className={`rounded-md border border-dashed p-4 text-sm ${
                  isDragging
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : "border-muted-foreground/40 text-muted-foreground"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    setUploadFile(file);
                    setUploadError(null);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                Glissez-deposez un fichier CSV ici, ou cliquez pour choisir.
              </div>
              {uploadMutation.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : fileInfo ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">
                    {fileInfo.name}
                  </p>
                  <p className="text-muted-foreground">
                    {fileInfo.size} · Derniere modification{" "}
                    {fileInfo.updatedAt}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun fichier selectionne.
                </p>
              )}
              {uploadUnavailable ? (
                <p className="text-sm text-muted-foreground">
                  Upload non disponible (endpoint absent).
                </p>
              ) : null}
              {uploadError ? (
                <p className="text-sm text-rose-600">{uploadError}</p>
              ) : null}
              <Button type="submit" disabled={uploadDisabled}>
                {uploadMutation.isPending ? "Envoi en cours..." : "Envoyer"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <div>
              <CardTitle>Historique des imports</CardTitle>
              <CardDescription>Derniers imports executes.</CardDescription>
            </div>
            <CardAction>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!listEndpoint) return;
                    importsQuery.refetch();
                  }}
                  disabled={!listEndpoint || importsQuery.isFetching}
                  variant="outline"
                >
                  {isRefreshing ? "Rafraichir..." : "Rafraichir"}
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {listUnavailable ? (
              <EmptyState
                title="Aucun endpoint d'import detecte"
                description="Aucun endpoint d'import n'est disponible pour afficher l'historique."
              />
            ) : importsQuery.error ? (
              <ErrorState message={listErrorMessage} />
            ) : importsQuery.isLoading ? (
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
                isLoading={importsQuery.isLoading}
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
