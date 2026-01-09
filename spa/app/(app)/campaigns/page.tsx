"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { humanizeKey } from "@/lib/format";

type CampaignBatchPayload = {
  run_id?: string;
  template_id: string;
  batch_size?: number;
  preview_only?: boolean;
  dryRun?: boolean;
  segment_id?: string;
  segment?: string;
  cluster?: string;
};

type CampaignBatchResponse = {
  run_id?: string;
  dry_run?: boolean;
  preview_only?: boolean;
  n_selected?: number;
  n_in_batch?: number;
  preview?: Record<string, unknown>[];
  result?: unknown;
  [key: string]: unknown;
};

type JsonRecord = Record<string, unknown>;

type TargetType = "all" | "segment" | "cluster";

type CampaignFormState = {
  name: string;
  templateId: string;
  subject: string;
  content: string;
  targetType: TargetType;
  segment: string;
  cluster: string;
  batchSize: string;
  runId: string;
  dryRun: boolean;
  campaignId: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "preview", "rows"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return (value[key] as unknown[]).filter(isRecord);
      }
    }
  }
  return [];
}

function buildHeaders(rows: JsonRecord[]): string[] {
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function CampaignsPage() {
  const [form, setForm] = useState<CampaignFormState>({
    name: "",
    templateId: "",
    subject: "",
    content: "",
    targetType: "all",
    segment: "",
    cluster: "",
    batchSize: "200",
    runId: "",
    dryRun: true,
    campaignId: "",
  });
  const [lastResponse, setLastResponse] = useState<CampaignBatchResponse | null>(
    null
  );
  const [lastAction, setLastAction] = useState<"preview" | "send" | null>(null);
  const [lastPreviewPayload, setLastPreviewPayload] =
    useState<CampaignBatchPayload | null>(null);

  const clustersQuery = useQuery({
    queryKey: ["clusters", "distribution"],
    queryFn: () =>
      apiRequest<Record<string, number>>(endpoints.clusters.list),
  });

  const campaignId = form.campaignId.trim();
  const statsQuery = useQuery({
    queryKey: ["campaigns", "stats", campaignId],
    queryFn: () => apiRequest<JsonRecord>(endpoints.campaigns.stats(campaignId)),
    enabled: Boolean(campaignId),
  });

  const previewMutation = useMutation({
    mutationFn: (payload: CampaignBatchPayload) =>
      apiRequest<CampaignBatchResponse>(endpoints.campaigns.preview, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables) => {
      setLastResponse(data);
      setLastAction("preview");
      setLastPreviewPayload(variables);
      toast.success("Previsualisation generee.");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Impossible de previsualiser."));
    },
  });

  const sendMutation = useMutation({
    mutationFn: (payload: CampaignBatchPayload) =>
      apiRequest<CampaignBatchResponse>(endpoints.campaigns.send, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data) => {
      setLastResponse(data);
      setLastAction("send");
      toast.success("Campagne lancee.");
      if (campaignId) {
        statsQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Impossible d'envoyer la campagne."));
    },
  });

  const previewRows = useMemo(
    () => normalizeRows(lastResponse?.preview),
    [lastResponse?.preview]
  );
  const previewErrorMessage = previewMutation.isError
    ? getErrorMessage(
        previewMutation.error,
        "Impossible de charger la previsualisation."
      )
    : null;
  const sendErrorMessage = sendMutation.isError
    ? getErrorMessage(sendMutation.error, "Impossible d'envoyer la campagne.")
    : null;
  const errorMessage = sendErrorMessage ?? previewErrorMessage;
  const previewColumns = useMemo<ColumnDef<JsonRecord>[]>(
    () =>
      buildHeaders(previewRows).map((header) => ({
        accessorKey: header,
        header: humanizeKey(header),
        cell: ({ row }) => formatCellValue(row.original[header]),
      })),
    [previewRows]
  );

  const resultRows = useMemo(
    () => normalizeRows(lastResponse?.result),
    [lastResponse?.result]
  );
  const resultColumns = useMemo<ColumnDef<JsonRecord>[]>(
    () =>
      buildHeaders(resultRows).map((header) => ({
        accessorKey: header,
        header: humanizeKey(header),
        cell: ({ row }) => formatCellValue(row.original[header]),
      })),
    [resultRows]
  );

  const clusterOptions = useMemo(() => {
    const data = clustersQuery.data ?? {};
    return Object.keys(data).sort();
  }, [clustersQuery.data]);

  const clustersErrorMessage = clustersQuery.isError
    ? getErrorMessage(clustersQuery.error, "Impossible de charger les clusters.")
    : null;
  const statsErrorMessage = statsQuery.isError
    ? getErrorMessage(statsQuery.error, "Impossible de charger les stats.")
    : null;

  const hasTemplate = form.templateId.trim().length > 0;
  const defaultBatchSize = 200;
  const minBatchSize = 1;
  const maxBatchSize = 300;
  const rawBatchSize = form.batchSize.trim();
  const batchSizeValue = Number(rawBatchSize);
  const normalizedBatchSize = Number.isFinite(batchSizeValue)
    ? batchSizeValue
    : defaultBatchSize;
  const batchSize = rawBatchSize ? normalizedBatchSize : defaultBatchSize;
  const batchSizeError =
    batchSize > maxBatchSize
      ? `Le batch size ne peut pas depasser ${maxBatchSize}.`
      : batchSize < minBatchSize
      ? "Le batch size doit etre superieur ou egal a 1."
      : null;
  const canSubmit = hasTemplate;

  const basePayload: CampaignBatchPayload = {
    template_id: form.templateId.trim(),
    batch_size: batchSize,
    dryRun: form.dryRun,
  };
  if (form.runId.trim()) {
    basePayload.run_id = form.runId.trim();
  }
  if (form.targetType === "segment" && form.segment.trim()) {
    basePayload.segment_id = form.segment.trim();
    basePayload.segment = form.segment.trim();
  }
  if (form.targetType === "cluster" && form.cluster.trim()) {
    basePayload.cluster = form.cluster.trim();
  }

  const hasPreview = Boolean(lastResponse);
  const isRefreshing =
    (previewMutation.isPending && !previewMutation.isPaused) ||
    statsQuery.isFetching;

  const handlePreview = () => {
    if (batchSizeError) {
      toast.error(batchSizeError);
      return;
    }
    const payload = { ...basePayload, preview_only: true };
    previewMutation.mutate(payload);
  };

  const handleSend = () => {
    if (batchSizeError) {
      toast.error(batchSizeError);
      return;
    }
    const payload = { ...basePayload, preview_only: form.dryRun };
    sendMutation.mutate(payload);
  };

  const handleRefresh = () => {
    if (lastPreviewPayload) {
      previewMutation.mutate(lastPreviewPayload);
    }
    if (campaignId) {
      statsQuery.refetch();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        description="Previsualiser, cibler et lancer une campagne email en toute securite."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Les envois utilisent un template Brevo existant. Les champs
              campagne, sujet et contenu servent a preparer votre brief.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Nom de la campagne</Label>
                <Input
                  id="campaign-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Ex: Relance automne"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-id">Template Brevo</Label>
                <Input
                  id="template-id"
                  value={form.templateId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      templateId: event.target.value,
                    }))
                  }
                  placeholder="Ex: 42 (ID du template Brevo)"
                />
                <p className="text-xs text-muted-foreground">
                  Saisissez l&apos;ID numerique du template Brevo a utiliser.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Sujet</Label>
                <Input
                  id="subject"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  placeholder="Nouvelle selection rien que pour vous"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-id">Run ID (optionnel)</Label>
                <Input
                  id="run-id"
                  value={form.runId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, runId: event.target.value }))
                  }
                  placeholder="Dernier run par defaut"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Contenu</Label>
              <textarea
                id="content"
                value={form.content}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, content: event.target.value }))
                }
                rows={4}
                placeholder="Resume du contenu, CTA, variantes..."
                className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="target-type">Cible</Label>
                <select
                  id="target-type"
                  value={form.targetType}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      targetType: event.target.value as TargetType,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="all">Tous les contacts eligibles</option>
                  <option value="segment">Audience (segment)</option>
                  <option value="cluster">Cluster</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch size (1-300)</Label>
                <Input
                  id="batch-size"
                  type="number"
                  min={1}
                  max={300}
                  value={form.batchSize}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      batchSize: event.target.value,
                    }))
                  }
                />
                {batchSizeError ? (
                  <p className="text-xs text-destructive">{batchSizeError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    200–300 recommande. Max 300 (securite).
                  </p>
                )}
              </div>
              {form.targetType === "segment" && (
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="segment">Audience (segment)</Label>
                  <Input
                    id="segment"
                    value={form.segment}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        segment: event.target.value,
                      }))
                    }
                    placeholder="ID du segment (ex: 12)"
                  />
                  <p className="text-xs text-muted-foreground">
                    ID du segment (issu de Segmentation). Laisser vide pour
                    tous les clients.
                  </p>
                </div>
              )}
              {form.targetType === "cluster" && (
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="cluster">Cluster</Label>
                  {clustersQuery.isLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : clustersQuery.isError ? (
                    <ErrorState message={clustersErrorMessage ?? ""} />
                  ) : clusterOptions.length ? (
                    <select
                      id="cluster"
                      value={form.cluster}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          cluster: event.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="">Selectionner un cluster</option>
                      {clusterOptions.map((cluster) => (
                        <option key={cluster} value={cluster}>
                          {cluster} ({clustersQuery.data?.[cluster] ?? 0})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="cluster"
                      value={form.cluster}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          cluster: event.target.value,
                        }))
                      }
                      placeholder="Cluster (ex: A)"
                    />
                  )}
                </div>
              )}
            </div>
            {batchSizeError ? <ErrorState message={batchSizeError} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.dryRun}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      dryRun: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border border-input"
                />
                Mode safe (dry run) : aucun envoi reel, active par defaut
              </label>
              <div className="flex flex-1 items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={!canSubmit || previewMutation.isPending}
                >
                  {previewMutation.isPending ? "Chargement..." : "Previsualiser"}
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!canSubmit || sendMutation.isPending}
                >
                  {sendMutation.isPending
                    ? "Envoi..."
                    : form.dryRun
                    ? "Envoyer (simulation)"
                    : "Envoyer"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Resultat</CardTitle>
              <CardDescription>
                {lastAction
                  ? `Derniere action: ${lastAction}`
                  : "Aucune previsualisation encore."}
              </CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={!lastPreviewPayload && !campaignId}
                >
                  {isRefreshing ? "Rafraichissement..." : "Rafraichir"}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {errorMessage ? <ErrorState message={errorMessage} /> : null}
              {previewMutation.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : hasPreview ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">
                        Run ID
                      </div>
                      <div className="font-medium">
                        {lastResponse?.run_id ?? "-"}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">
                        Batch
                      </div>
                      <div className="font-medium">
                        {lastResponse?.n_in_batch ?? 0} /{" "}
                        {lastResponse?.n_selected ?? 0}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">
                        Dry run
                      </div>
                      <div className="font-medium">
                        {lastResponse?.dry_run ? "Oui" : "Non"}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">
                        Preview only
                      </div>
                      <div className="font-medium">
                        {lastResponse?.preview_only ? "Oui" : "Non"}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Contacts (aperçu)</h3>
                    {previewRows.length ? (
                      <DataTable
                        columns={previewColumns}
                        data={previewRows}
                        isLoading={previewMutation.isPending}
                        emptyMessage="Aucun contact a afficher."
                      />
                    ) : (
                      <EmptyState
                        title="Aucun contact."
                        description="La previsualisation ne retourne pas de contacts."
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Resultat brut</h3>
                    {resultRows.length ? (
                      <DataTable
                        columns={resultColumns}
                        data={resultRows}
                        isLoading={false}
                        emptyMessage="Aucun resultat disponible."
                      />
                    ) : (
                      <pre className="max-h-60 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        {stringifyJson(lastResponse?.result ?? lastResponse)}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Aucune previsualisation"
                  description="Lancez une previsualisation pour voir les contacts."
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stats campagne</CardTitle>
              <CardDescription>
                Renseignez un ID de campagne pour suivre les interactions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="campaign-id">Campaign ID</Label>
                <Input
                  id="campaign-id"
                  value={form.campaignId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      campaignId: event.target.value,
                    }))
                  }
                  placeholder="Ex: 12"
                />
              </div>
              {statsQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : statsQuery.isError ? (
                <ErrorState message={statsErrorMessage ?? ""} />
              ) : statsQuery.data ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(statsQuery.data).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-md border border-border/60 p-3 text-sm"
                    >
                      <div className="text-xs text-muted-foreground">
                        {humanizeKey(key)}
                      </div>
                      <div className="font-medium">
                        {formatCellValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Pas de stats"
                  description="Ajoutez un ID pour consulter les stats."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
