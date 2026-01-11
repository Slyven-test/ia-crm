"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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

type ImportTargetKey = "clients" | "products" | "sales";

type UploadMode = "multipart" | "json";

type ImportEndpointInfo = {
  uploadEndpoint: string | null;
  runEndpoint: string | null;
  validateEndpoint: string | null;
  listEndpoint: string | null;
  fileFieldName: string;
  uploadType: UploadMode;
};

type ImportSummary = {
  summary: Array<{ label: string; value: string }>;
  errors: string[];
  raw: string | null;
};

type ImportPayload =
  | {
      mode: "multipart";
      file: File;
      metadata: Record<string, unknown>;
    }
  | {
      mode: "json";
      body: Record<string, unknown>;
      metadata: Record<string, unknown>;
    };

type ImportCardConfig = {
  key: ImportTargetKey;
  title: string;
  description: string;
  invalidateKeys: QueryKey[];
};

const summaryKeyMap: Array<{ key: string; label: string }> = [
  { key: "message", label: "Message" },
  { key: "summary", label: "Resume" },
  { key: "detail", label: "Detail" },
  { key: "status", label: "Statut" },
  { key: "result", label: "Resultat" },
];

const countKeyMap: Array<{ key: string; label: string }> = [
  { key: "rows", label: "Lignes" },
  { key: "lines", label: "Lignes" },
  { key: "count", label: "Total" },
  { key: "total", label: "Total" },
  { key: "imported_rows", label: "Importees" },
  { key: "imported_lines", label: "Importees" },
  { key: "inserted", label: "Inseres" },
  { key: "updated", label: "Mises a jour" },
  { key: "created", label: "Creees" },
  { key: "skipped", label: "Ignorees" },
];

const errorKeyCandidates = [
  "errors",
  "error",
  "error_message",
  "errorMessage",
  "failures",
  "invalid",
  "invalid_rows",
];

const uploadEndpointCandidates = ["upload", "create", "ingest"];
const runEndpointCandidates = ["run", "start", "execute", "trigger"];
const validateEndpointCandidates = ["validate", "check", "verify"];
const listEndpointCandidates = ["list", "history", "runs", "items"];
const fileFieldCandidates = [
  "fileField",
  "file_field",
  "file",
  "fileKey",
  "file_key",
];
const etlFallbackEndpoint = "/etl/ingest";

const defaultImportConfigs: ImportCardConfig[] = [
  {
    key: "clients",
    title: "Clients",
    description: "Importer un fichier CSV de contacts ou comptes.",
    invalidateKeys: [
      ["customers", "list"],
      ["clients", "count"],
      ["audit", "latest"],
      ["runs", "latest"],
    ],
  },
  {
    key: "products",
    title: "Produits",
    description: "Importer le catalogue produits et ses attributs.",
    invalidateKeys: [
      ["products"],
      ["products", "count"],
      ["audit", "latest"],
      ["runs", "latest"],
    ],
  },
  {
    key: "sales",
    title: "Ventes",
    description: "Importer l'historique des ventes/transactions.",
    invalidateKeys: [
      ["analytics", "overview"],
      ["analytics", "outcomes"],
      ["analytics", "sales-trend"],
      ["sales"],
      ["audit", "latest"],
      ["runs", "latest"],
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveEndpoint(
  sources: Array<Record<string, unknown> | null>,
  keys: string[]
): string | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }
  return null;
}

function resolveString(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
  fallback: string
): string {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }
  return fallback;
}

function resolveImportEndpoints(target: ImportTargetKey): ImportEndpointInfo {
  const endpointsRecord = endpoints as unknown as Record<string, unknown>;
  const importsRoot = isRecord(endpointsRecord.imports)
    ? endpointsRecord.imports
    : null;
  const etlRoot = isRecord(endpointsRecord.etl)
    ? endpointsRecord.etl
    : null;
  const targetRoot =
    importsRoot && isRecord(importsRoot[target]) ? importsRoot[target] : null;

  const sources = [targetRoot, importsRoot, etlRoot, endpointsRecord];
  const etlIngest =
    etlRoot && typeof etlRoot.ingest === "string"
      ? etlRoot.ingest
      : null;

  const resolvedUpload = resolveEndpoint(sources, uploadEndpointCandidates);
  const uploadEndpoint =
    resolvedUpload ?? etlIngest ?? etlFallbackEndpoint ?? null;
  const uploadType: UploadMode =
    uploadEndpoint && uploadEndpoint.includes("/etl/ingest") ? "json" : "multipart";

  return {
    uploadEndpoint,
    runEndpoint: resolveEndpoint(sources, runEndpointCandidates),
    validateEndpoint: resolveEndpoint(sources, validateEndpointCandidates),
    listEndpoint: resolveEndpoint(sources, listEndpointCandidates),
    fileFieldName: resolveString(sources, fileFieldCandidates, "file"),
    uploadType,
  };
}

function extractSummary(response: unknown): ImportSummary {
  if (response === null || response === undefined) {
    return { summary: [], errors: [], raw: null };
  }

  if (Array.isArray(response)) {
    return {
      summary: [{ label: "Lignes", value: formatNumber(response.length) }],
      errors: [],
      raw: stringifyValue(response),
    };
  }

  if (!isRecord(response)) {
    return {
      summary: [{ label: "Reponse", value: stringifyValue(response) }],
      errors: [],
      raw: stringifyValue(response),
    };
  }

  const summary: ImportSummary["summary"] = [];
  for (const { key, label } of summaryKeyMap) {
    if (key in response) {
      const value = response[key];
      if (value !== undefined && value !== null && value !== "") {
        summary.push({ label, value: stringifyValue(value) });
      }
    }
  }

  for (const { key, label } of countKeyMap) {
    if (!(key in response)) continue;
    const value = response[key];
    if (typeof value === "number") {
      summary.push({ label, value: formatNumber(value) });
      continue;
    }
    if (typeof value === "string") {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        summary.push({ label, value: formatNumber(numeric) });
        continue;
      }
    }
    if (Array.isArray(value)) {
      summary.push({ label, value: formatNumber(value.length) });
    }
  }

  const errors: string[] = [];
  for (const key of errorKeyCandidates) {
    if (!(key in response)) continue;
    const value = response[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const formatted = stringifyValue(item);
        if (formatted && formatted !== "-") errors.push(formatted);
      });
    } else if (value !== null && value !== undefined && value !== "") {
      errors.push(stringifyValue(value));
    }
  }

  const raw = stringifyValue(response);

  return { summary, errors, raw };
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

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const base = `HTTP ${error.status}`;
    if (error.status === 404 || error.status === 501) {
      return `${base} - Non disponible`;
    }
    return error.message ? `${base} - ${error.message}` : base;
  }
  if (error instanceof Error) return `HTTP 0 - ${error.message}`;
  return "HTTP 0 - Erreur inconnue.";
}

function summarizeForToast(summary: ImportSummary): string | null {
  if (!summary.summary.length) return null;
  const highlights = summary.summary.slice(0, 3);
  return highlights.map((item) => `${item.label}: ${item.value}`).join(", ");
}

function ImportCard({
  config,
  endpointInfo,
}: {
  config: ImportCardConfig;
  endpointInfo: ImportEndpointInfo;
}) {
  const queryClient = useQueryClient();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastMetadata, setLastMetadata] = useState<Record<string, unknown> | null>(
    null
  );
  const [uploadUnavailable, setUploadUnavailable] = useState<boolean>(
    endpointInfo.uploadEndpoint === null
  );
  const [tenantInput, setTenantInput] = useState<string>("");
  const [isolateSchema, setIsolateSchema] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const responseSummary = useMemo(
    () => extractSummary(lastResponse),
    [lastResponse]
  );
  const parsedTenants = useMemo(() => {
    return tenantInput
      .split(",")
      .map((tenant) => tenant.trim())
      .filter(Boolean);
  }, [tenantInput]);

  const uploadMutation = useMutation({
    mutationFn: async (payload: ImportPayload) => {
      if (!endpointInfo.uploadEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Endpoint d'upload indisponible.",
        });
      }
      if (payload.mode === "multipart") {
        const formData = new FormData();
        formData.append(endpointInfo.fileFieldName, payload.file);
        return apiRequest(endpointInfo.uploadEndpoint, {
          method: "POST",
          body: formData,
        });
      }
      return apiRequest(endpointInfo.uploadEndpoint, {
        method: "POST",
        body: payload.body,
      });
    },
    onSuccess: async (data, payload) => {
      const summary = extractSummary(data);
      const extra = summarizeForToast(summary);
      toast.success(
        `Import ${config.title.toLowerCase()} lance${extra ? ` (${extra})` : ""}.`
      );
      setLastResponse(data);
      setLastError(null);
      setUploadError(null);
      setLastMetadata(payload.metadata);
      setUploadFile(null);
      setFileInputKey((prev) => prev + 1);
      await Promise.all(
        config.invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && [404, 501].includes(error.status)) {
        setUploadUnavailable(true);
      }
      const message = formatApiError(error);
      setUploadError(message);
      setLastError(message);
      toast.error(message);
    },
  });

  const isUnavailable = uploadUnavailable || !endpointInfo.uploadEndpoint;
  const uploadDisabled =
    isUnavailable ||
    uploadMutation.isPending ||
    (endpointInfo.uploadType === "multipart" ? uploadFile === null : false) ||
    (endpointInfo.uploadType === "json" ? parsedTenants.length === 0 : false);
  const fileInfo = uploadFile
    ? {
        name: uploadFile.name,
        size: formatBytes(uploadFile.size),
        updatedAt: formatDate(uploadFile.lastModified),
      }
    : null;

  const missingReason = !endpointInfo.uploadEndpoint
    ? "Aucun endpoint d'upload n'est configure dans endpoints.ts pour cet import."
    : "Endpoint d'upload indisponible (HTTP 404/501).";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {config.title}
            {!isUnavailable ? (
              <Badge variant="outline">Actif</Badge>
            ) : (
              <Badge variant="outline">Non disponible</Badge>
            )}
          </CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isUnavailable ? (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            {missingReason}
          </div>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!endpointInfo.uploadEndpoint) {
              setUploadUnavailable(true);
              setUploadError("Upload non disponible.");
              toast.error("Endpoint d'upload indisponible.");
              return;
            }
            setUploadError(null);
            if (endpointInfo.uploadType === "multipart") {
              if (!uploadFile) {
                const message = "Selectionnez un fichier CSV.";
                setUploadError(message);
                toast.error(message);
                return;
              }
              const metadata = {
                filename: uploadFile.name,
                size: uploadFile.size,
                type: uploadFile.type || "unknown",
                lastModified: uploadFile.lastModified,
              };
              setLastMetadata(metadata);
              uploadMutation.mutate({
                mode: "multipart",
                file: uploadFile,
                metadata,
              });
              return;
            }
            if (!parsedTenants.length) {
              const message = "Indiquez au moins un tenant.";
              setUploadError(message);
              toast.error(message);
              return;
            }
            const body = {
              tenants: parsedTenants,
              isolate_schema: isolateSchema,
            };
            setLastMetadata(body);
            uploadMutation.mutate({
              mode: "json",
              body,
              metadata: body,
            });
          }}
        >
          {endpointInfo.uploadType === "multipart" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`upload-${config.key}`}>Fichier CSV</Label>
                <Input
                  ref={fileInputRef}
                  key={fileInputKey}
                  id={`upload-${config.key}`}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                setUploadFile(event.target.files?.[0] ?? null);
                setUploadError(null);
                setLastError(null);
              }}
              disabled={isUnavailable}
            />
          </div>
              {uploadMutation.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : fileInfo ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">{fileInfo.name}</p>
                  <p className="text-muted-foreground">
                    {fileInfo.size} · Derniere modification {fileInfo.updatedAt}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun fichier selectionne.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`tenant-${config.key}`}>
                Tenants (separes par des virgules)
              </Label>
              <Input
                id={`tenant-${config.key}`}
                placeholder="ruhlmann, valentinr"
                value={tenantInput}
                onChange={(event) => {
                  setTenantInput(event.target.value);
                  setUploadError(null);
                  setLastError(null);
                }}
                disabled={isUnavailable}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isolateSchema}
                  onChange={(event) => setIsolateSchema(event.target.checked)}
                  disabled={isUnavailable}
                />
                Isoler les schemas (isolate_schema)
              </label>
            </div>
          )}
          {uploadError ? (
            <p className="text-sm text-rose-600">{uploadError}</p>
          ) : null}
          <Button type="submit" disabled={uploadDisabled}>
            {uploadMutation.isPending ? "Envoi en cours..." : "Envoyer"}
          </Button>
        </form>

        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="text-sm font-medium">Dernier retour</p>
          {lastError ? (
            <p className="mt-2 text-rose-600">{lastError}</p>
          ) : lastResponse ? (
            <div className="mt-2 space-y-2">
              {responseSummary.summary.length ? (
                <div className="space-y-1">
                  {responseSummary.summary.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className="flex items-center justify-between text-muted-foreground"
                    >
                      <span>{item.label}</span>
                      <span className="font-medium text-foreground">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Aucun resume disponible.
                </p>
              )}
              {responseSummary.errors.length ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-rose-600">
                    Erreurs
                  </p>
                  {responseSummary.errors.map((errorItem, index) => (
                    <p key={`${errorItem}-${index}`} className="text-rose-600">
                      {errorItem}
                    </p>
                  ))}
                </div>
              ) : null}
              {responseSummary.raw ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Details JSON</summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-background/80 p-2">
                    {responseSummary.raw}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Aucun import lance"
              description="Chargez un fichier pour lancer l'import."
            />
          )}
        </div>

        <div className="rounded-md border border-dashed border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
          <p className="text-xs font-semibold uppercase text-foreground">
            Mode test
          </p>
          <div className="mt-2 space-y-1">
            <p>
              Endpoint:{" "}
              <span className="font-medium text-foreground">
                {endpointInfo.uploadEndpoint ?? "Non disponible"}
              </span>
            </p>
            <p>
              Type d'upload:{" "}
              <span className="font-medium text-foreground">
                {endpointInfo.uploadType === "json"
                  ? "json"
                  : "multipart/form-data"}
              </span>
            </p>
            <p>Dernier payload (metadata)</p>
            <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-border/60 bg-background/80 p-2 text-[11px]">
              {lastMetadata ? stringifyValue(lastMetadata) : "-"}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ImportsPage() {
  const importCards = useMemo(
    () =>
      defaultImportConfigs.map((config) => ({
        config,
        endpointInfo: resolveImportEndpoints(config.key),
      })),
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Chargez les donnees clients, produits et ventes via CSV."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {importCards.map(({ config, endpointInfo }) => (
          <ImportCard
            key={config.key}
            config={config}
            endpointInfo={endpointInfo}
          />
        ))}
      </div>
    </div>
  );
}
