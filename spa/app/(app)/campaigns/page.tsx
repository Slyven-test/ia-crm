"use client";

import { ColumnDef } from "@tanstack/react-table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";

type CampaignRow = Record<string, unknown>;

type CampaignCreatePayload = {
  name: string;
  subject?: string;
  content?: string;
  segment?: string;
  template_id?: string;
  status?: string;
  scheduled_at?: string | null;
};

type CampaignFormState = {
  name: string;
  subject: string;
  content: string;
  segment: string;
  templateId: string;
};

type CampaignPreviewPayload = {
  template_id: string;
  batch_size: number;
  preview_only: boolean;
  segment?: string;
};

type CampaignPreviewResponse = {
  run_id?: string;
  dry_run?: boolean;
  preview_only?: boolean;
  n_selected?: number;
  n_in_batch?: number;
  preview?: Record<string, unknown>[];
  result?: unknown;
  [key: string]: unknown;
};

type SegmentOption = {
  value: string;
  count?: number;
};

const defaultFormState: CampaignFormState = {
  name: "",
  subject: "",
  content: "",
  segment: "",
  templateId: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeCampaigns(value: unknown): CampaignRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "campaigns"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return (value[key] as unknown[]).filter(isRecord);
      }
    }
  }
  return [];
}

function pickValue<T>(
  record: CampaignRow,
  keys: string[],
  predicate: (value: unknown) => value is T
): T | null {
  for (const key of keys) {
    const value = record[key];
    if (predicate(value)) return value;
  }
  return null;
}

function getStringValue(record: CampaignRow, keys: string[]) {
  return pickValue(record, keys, (value): value is string | number =>
    ["string", "number"].includes(typeof value)
  );
}

function getDateValue(record: CampaignRow, keys: string[]) {
  return pickValue(
    record,
    keys,
    (value): value is string | number | Date =>
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date
  );
}

function formatDateValue(value: string | number | Date | null) {
  if (!value) return "-";
  return formatDate(value);
}

function getStatusBadge(status: string | number | null) {
  const label = status === null ? "-" : String(status);
  const normalized = label.toLowerCase();

  if (["sent", "success", "done", "completed"].includes(normalized)) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-900">
        {label}
      </Badge>
    );
  }

  if (["error", "failed", "cancelled", "canceled"].includes(normalized)) {
    return (
      <Badge className="border-rose-200 bg-rose-100 text-rose-900">
        {label}
      </Badge>
    );
  }

  if (["draft", "scheduled", "pending"].includes(normalized)) {
    return (
      <Badge className="border-sky-200 bg-sky-100 text-sky-900">{label}</Badge>
    );
  }

  return <Badge variant="outline">{label}</Badge>;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function isUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && [404, 501].includes(error.status);
}

function normalizeSegmentOptions(value: unknown): SegmentOption[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return { value: item };
        if (isRecord(item)) {
          const label = getStringValue(item, ["segment", "name", "label"]);
          const count = pickValue(
            item,
            ["count", "value", "total"],
            (payload): payload is number => typeof payload === "number"
          );
          if (label !== null) {
            return { value: String(label), count: count ?? undefined };
          }
        }
        return null;
      })
      .filter((item): item is SegmentOption => Boolean(item));
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([segment, count]) => ({ value: segment, count }));
  }

  return [];
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function CampaignsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(defaultFormState);
  const [previewResponse, setPreviewResponse] =
    useState<CampaignPreviewResponse | null>(null);
  const [previewPayload, setPreviewPayload] =
    useState<CampaignPreviewPayload | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiRequest<unknown>(endpoints.campaigns.create),
  });

  const segmentsQuery = useQuery({
    queryKey: ["rfm", "distribution"],
    queryFn: () => apiRequest<unknown>(endpoints.rfm.distribution),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CampaignCreatePayload) =>
      apiRequest<CampaignRow>(endpoints.campaigns.create, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      toast.success("Campagne creee.");
      campaignsQuery.refetch();
      setDialogOpen(false);
      setForm(defaultFormState);
      setPreviewResponse(null);
      setPreviewPayload(null);
      setPreviewUnavailable(false);
      setPreviewNotice(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Impossible de creer la campagne."));
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: CampaignPreviewPayload) =>
      apiRequest<CampaignPreviewResponse>(endpoints.campaigns.preview, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, payload) => {
      setPreviewResponse(data);
      setPreviewPayload(payload);
      setPreviewUnavailable(false);
      setPreviewNotice(null);
      toast.success("Previsualisation generee.");
    },
    onError: (error) => {
      if (isUnavailableError(error)) {
        setPreviewUnavailable(true);
        setPreviewResponse(null);
        setPreviewPayload(null);
        return;
      }
      setPreviewUnavailable(false);
      toast.error(getErrorMessage(error, "Impossible de previsualiser."));
    },
  });

  const campaigns = useMemo(
    () => normalizeCampaigns(campaignsQuery.data),
    [campaignsQuery.data]
  );
  const segmentOptions = useMemo(
    () => normalizeSegmentOptions(segmentsQuery.data),
    [segmentsQuery.data]
  );

  const columns = useMemo<ColumnDef<CampaignRow>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) =>
          getStringValue(row.original, ["id", "campaign_id"]) ?? "-",
      },
      {
        accessorKey: "name",
        header: "Nom",
        cell: ({ row }) =>
          getStringValue(row.original, ["name", "title"]) ?? "-",
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) =>
          getStatusBadge(
            getStringValue(row.original, ["status", "state"])
          ),
      },
      {
        accessorKey: "scheduled_at",
        header: "Planifiee",
        cell: ({ row }) =>
          formatDateValue(
            getDateValue(row.original, ["scheduled_at", "scheduledAt"])
          ),
      },
      {
        accessorKey: "created_at",
        header: "Creee",
        cell: ({ row }) =>
          formatDateValue(
            getDateValue(row.original, ["created_at", "createdAt"])
          ),
      },
    ],
    []
  );

  const canCreate = form.name.trim().length > 0;
  const canPreview = form.templateId.trim().length > 0;

  const listErrorMessage = campaignsQuery.isError
    ? getErrorMessage(
        campaignsQuery.error,
        "Impossible de charger les campagnes."
      )
    : null;
  const createErrorMessage = createMutation.isError
    ? getErrorMessage(createMutation.error, "Impossible de creer la campagne.")
    : null;
  const previewErrorMessage =
    previewMutation.isError && !previewUnavailable
      ? getErrorMessage(
          previewMutation.error,
          "Impossible de charger la previsualisation."
        )
      : null;
  const segmentsErrorMessage = segmentsQuery.isError
    ? getErrorMessage(
        segmentsQuery.error,
        "Impossible de charger les audiences."
      )
    : null;
  const segmentsUnavailable =
    segmentsQuery.isError && isUnavailableError(segmentsQuery.error);

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPreviewResponse(null);
      setPreviewPayload(null);
      setPreviewUnavailable(false);
      setPreviewNotice(null);
    }
  };

  const handleCreate = () => {
    const payload: CampaignCreatePayload = {
      name: form.name.trim(),
      subject: form.subject.trim() || undefined,
      content: form.content.trim() || undefined,
      segment: form.segment.trim() || undefined,
      template_id: form.templateId.trim() || undefined,
      status: "draft",
    };
    createMutation.mutate(payload);
  };

  const handlePreview = () => {
    const templateId = form.templateId.trim();
    if (!templateId) {
      setPreviewNotice("Renseignez un template pour previsualiser.");
      return;
    }
    const payload: CampaignPreviewPayload = {
      template_id: templateId,
      batch_size: 200,
      preview_only: true,
    };
    if (form.segment.trim()) {
      payload.segment = form.segment.trim();
    }
    setPreviewNotice(null);
    previewMutation.mutate(payload);
  };

  const previewStats = previewResponse
    ? {
        nSelected: previewResponse.n_selected ?? 0,
        nInBatch: previewResponse.n_in_batch ?? 0,
        dryRun: previewResponse.dry_run ? "Oui" : "Non",
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        description="Lister, creer et previsualiser vos campagnes email."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            Nouvelle campagne
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Campagnes</CardTitle>
            <CardDescription>
              Suivi du statut, dates de planification et historiques.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              variant="outline"
              onClick={() => campaignsQuery.refetch()}
              disabled={campaignsQuery.isFetching}
            >
              {campaignsQuery.isFetching ? "Chargement..." : "Rafraichir"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {campaignsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : campaignsQuery.isError ? (
            <ErrorState message={listErrorMessage ?? ""} />
          ) : campaigns.length ? (
            <DataTable
              columns={columns}
              data={campaigns}
              isLoading={false}
              emptyMessage="Aucune campagne disponible."
            />
          ) : (
            <EmptyState
              title="Aucune campagne."
              description="Creez votre premiere campagne pour la voir ici."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne</DialogTitle>
            <DialogDescription>
              Definissez un brouillon, puis previsualisez le volume cible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Nom</Label>
                <Input
                  id="campaign-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Relance automne"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-template">Template Brevo</Label>
                <Input
                  id="campaign-template"
                  value={form.templateId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      templateId: event.target.value,
                    }))
                  }
                  placeholder="Ex: 42"
                />
                <p className="text-xs text-muted-foreground">
                  Requis pour la previsualisation/dry-run.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-subject">Sujet</Label>
                <Input
                  id="campaign-subject"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      subject: event.target.value,
                    }))
                  }
                  placeholder="Nouvelle selection rien que pour vous"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-content">Contenu</Label>
                <textarea
                  id="campaign-content"
                  value={form.content}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      content: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Resume du contenu, CTA, variantes..."
                  className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-segment">Audience (segment)</Label>
                {segmentsQuery.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : segmentsUnavailable ? (
                  <div className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
                    Non disponible (backend non expose).
                  </div>
                ) : segmentsQuery.isError ? (
                  <ErrorState message={segmentsErrorMessage ?? ""} />
                ) : segmentOptions.length ? (
                  <select
                    id="campaign-segment"
                    value={form.segment}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        segment: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="">Tous les contacts eligibles</option>
                    {segmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                        {typeof option.count === "number"
                          ? ` (${option.count})`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="campaign-segment"
                    value={form.segment}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        segment: event.target.value,
                      }))
                    }
                    placeholder="Segment (ex: Champions)"
                  />
                )}
              </div>
            </div>

            {createErrorMessage ? (
              <ErrorState message={createErrorMessage} />
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Previsualisation / Dry-run</CardTitle>
                <CardDescription>
                  Estimez le volume cible et verifiez un exemple de payload.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {previewMutation.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                ) : previewUnavailable ? (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (backend non expose).
                  </div>
                ) : previewNotice ? (
                  <ErrorState message={previewNotice} />
                ) : previewErrorMessage ? (
                  <ErrorState message={previewErrorMessage} />
                ) : previewResponse ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Selectionnes
                        </div>
                        <div className="font-medium">
                          {previewStats?.nSelected ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Dans le batch
                        </div>
                        <div className="font-medium">
                          {previewStats?.nInBatch ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Dry run
                        </div>
                        <div className="font-medium">
                          {previewStats?.dryRun ?? "-"}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Payload</p>
                      <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        {stringifyJson(previewPayload)}
                      </pre>
                    </div>
                    {previewResponse.preview?.length ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          Exemple destinataire
                        </p>
                        <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          {stringifyJson(previewResponse.preview[0])}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    title="Aucune previsualisation"
                    description="Lancez une previsualisation pour estimer le volume."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!canPreview || previewMutation.isPending}
            >
              {previewMutation.isPending ? "Chargement..." : "Previsualiser"}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || createMutation.isPending}
            >
              {createMutation.isPending ? "Creation..." : "Creer la campagne"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
