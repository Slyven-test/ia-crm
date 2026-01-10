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

type ImportEndpointInfo = {
  uploadEndpoint: string | null;
  runEndpoint: string | null;
  validateEndpoint: string | null;
  listEndpoint: string | null;
  fileFieldName: string;
};

type ImportSummary = {
  summary: Array<{ label: string; value: string }>;
  errors: string[];
  raw: string | null;
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

const defaultImportConfigs: ImportCardConfig[] = [
  {
    key: "clients",
    title: "Clients",
    description: "Importer un fichier CSV de contacts ou comptes.",
    invalidateKeys: [["customers"], ["clients", "count"], ["audit", "latest"]],
  },
  {
    key: "products",
    title: "Produits",
    description: "Importer le catalogue produits et ses attributs.",
    invalidateKeys: [["products"], ["products", "count"], ["audit", "latest"]],
  },
  {
    key: "sales",
    title: "Ventes",
    description: "Importer l'historique des ventes/transactions.",
    invalidateKeys: [["analytics", "sales-trend"], ["sales"], ["audit", "latest"]],
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
  const record = endpoints as Record<string, unknown>;
  const importsRoot = isRecord(record.imports)
    ? (record.imports as Record<string, unknown>)
    : null;
  const etlRoot = isRecord(record.etl)
    ? (record.etl as Record<string, unknown>)
    : null;
  const targetRoot = importsRoot && isRecord(importsRoot[target])
    ? (importsRoot[target] as Record<string, unknown>)
    : null;

  const sources = [targetRoot, importsRoot, etlRoot, record];

  return {
    uploadEndpoint: resolveEndpoint(sources, uploadEndpointCandidates),
    runEndpoint: resolveEndpoint(sources, runEndpointCandidates),
    validateEndpoint: resolveEndpoint(sources, validateEndpointCandidates),
    listEndpoint: resolveEndpoint(sources, listEndpointCandidates),
    fileFieldName: resolveString(sources, fileFieldCandidates, "file"),
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
    } else if (value) {
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
  const [uploadUnavailable, setUploadUnavailable] = useState<boolean>(
    endpointInfo.uploadEndpoint === null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const responseSummary = useMemo(
    () => extractSummary(lastResponse),
    [lastResponse]
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!endpointInfo.uploadEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Endpoint d'upload indisponible.",
        });
      }
      const formData = new FormData();
      formData.append(endpointInfo.fileFieldName, file);
      return apiRequest(endpointInfo.uploadEndpoint, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (data) => {
      toast.success(`Import ${config.title.toLowerCase()} lance.`);
      setLastResponse(data);
      setLastError(null);
      setUploadError(null);
      setUploadFile(null);
      setFileInputKey((prev) => prev + 1);
      await Promise.all(
        config.invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
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
      setLastError(message);
      toast.error(message);
    },
  });

  const uploadDisabled =
    uploadUnavailable || uploadMutation.isPending || uploadFile === null;
  const fileInfo = uploadFile
    ? {
        name: uploadFile.name,
        size: formatBytes(uploadFile.size),
        updatedAt: formatDate(uploadFile.lastModified),
      }
    : null;

  const missingReason =
    !endpointInfo.uploadEndpoint &&
    "Aucun endpoint d'upload n'est configure dans endpoints.ts pour cet import.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {config.title}
            {endpointInfo.uploadEndpoint ? (
              <Badge variant="outline">Actif</Badge>
            ) : (
              <Badge variant="outline">Non disponible</Badge>
            )}
          </CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {!endpointInfo.uploadEndpoint ? (
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
              disabled={uploadUnavailable}
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
