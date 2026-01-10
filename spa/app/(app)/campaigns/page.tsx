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
type RunRow = Record<string, unknown>;

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
  runId: string;
  batchSize: number;
};

type CampaignBatchPayload = {
  template_id: string;
  batch_size: number;
  preview_only: boolean;
  run_id?: string;
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

type TemplateOption = {
  value: string;
  label: string;
};

const defaultFormState: CampaignFormState = {
  name: "",
  subject: "",
  content: "",
  segment: "",
  templateId: "",
  runId: "",
  batchSize: 200,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveStringEndpoint(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveEndpointFn(value: unknown): ((id: string | number) => string) | null {
  return typeof value === "function" ? (value as (id: string | number) => string) : null;
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

function normalizeRuns(value: unknown): RunRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "runs"];
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

function getCampaignId(record: CampaignRow): string | number | null {
  const candidate = record.id ?? record.campaign_id;
  if (typeof candidate === "string" && candidate.trim()) return candidate;
  if (typeof candidate === "number") return candidate;
  return null;
}

function getRunId(record: RunRow): string | number | null {
  if (typeof record.run_id === "string" || typeof record.run_id === "number") {
    return record.run_id;
  }
  if (typeof record.id === "string" || typeof record.id === "number") {
    return record.id;
  }
  return null;
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

function normalizeTemplateOptions(value: unknown): TemplateOption[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") {
          const label = String(item);
          return { value: label, label };
        }
        if (isRecord(item)) {
          const id = getStringValue(item, ["id", "template_id", "templateId"]);
          const name = getStringValue(item, ["name", "label", "title"]);
          if (id !== null) {
            const label = name ? String(name) : String(id);
            return { value: String(id), label };
          }
        }
        return null;
      })
      .filter((item): item is TemplateOption => Boolean(item));
  }

  if (isRecord(value)) {
    const items = value.items ?? value.results ?? value.data;
    if (Array.isArray(items)) {
      return normalizeTemplateOptions(items);
    }
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
    useState<CampaignBatchPayload | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [sendResponse, setSendResponse] =
    useState<CampaignPreviewResponse | null>(null);
  const [sendPayload, setSendPayload] =
    useState<CampaignBatchPayload | null>(null);
  const [sendUnavailable, setSendUnavailable] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | number | null>(null);

  const endpointsRecord = endpoints as Record<string, unknown>;
  const campaignsRecord = isRecord(endpointsRecord.campaigns)
    ? endpointsRecord.campaigns
    : null;
  const rfmRecord = isRecord(endpointsRecord.rfm) ? endpointsRecord.rfm : null;
  const recoRunsRecord = isRecord(endpointsRecord.recoRuns)
    ? endpointsRecord.recoRuns
    : null;

  const campaignsEndpoint = resolveStringEndpoint(
    campaignsRecord?.create
  );
  const previewEndpoint = resolveStringEndpoint(
    campaignsRecord?.preview
  );
  const sendEndpoint = resolveStringEndpoint(campaignsRecord?.send);
  const sendByIdEndpoint = resolveEndpointFn(
    campaignsRecord?.sendById
  );
  const templatesEndpoint = resolveStringEndpoint(
    campaignsRecord?.templates
  );
  const segmentsEndpoint = resolveStringEndpoint(
    rfmRecord?.distribution
  );
  const runsEndpoint = resolveStringEndpoint(
    recoRunsRecord?.list
  );

  const templatesAvailable = Boolean(templatesEndpoint);
  const segmentsAvailable = Boolean(segmentsEndpoint);
  const campaignsAvailable = Boolean(campaignsEndpoint);
  const previewAvailable = Boolean(previewEndpoint);
  const sendAvailable = Boolean(sendEndpoint);

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", campaignsEndpoint ?? "none"],
    queryFn: () => {
      if (!campaignsEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(campaignsEndpoint);
    },
    enabled: campaignsAvailable,
  });

  const segmentsQuery = useQuery({
    queryKey: ["rfm", "distribution", segmentsEndpoint ?? "none"],
    queryFn: () => {
      if (!segmentsEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(segmentsEndpoint);
    },
    enabled: segmentsAvailable,
  });

  const templatesQuery = useQuery({
    queryKey: ["campaigns", "templates", templatesEndpoint ?? "none"],
    queryFn: () => {
      if (!templatesEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(templatesEndpoint);
    },
    enabled: templatesAvailable,
  });

  const runsQuery = useQuery({
    queryKey: ["reco-runs", "list", runsEndpoint ?? "none"],
    queryFn: () => {
      if (!runsEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(runsEndpoint);
    },
    enabled: Boolean(runsEndpoint),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CampaignCreatePayload) => {
      if (!campaignsEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest<CampaignRow>(campaignsEndpoint, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      toast.success("Campagne creee.");
      campaignsQuery.refetch();
      setDialogOpen(false);
      setForm(defaultFormState);
      setPreviewResponse(null);
      setPreviewPayload(null);
      setPreviewUnavailable(false);
      setPreviewNotice(null);
      setSendResponse(null);
      setSendPayload(null);
      setSendUnavailable(false);
      setSendNotice(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Impossible de creer la campagne."));
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: CampaignBatchPayload) => {
      if (!previewEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest<CampaignPreviewResponse>(previewEndpoint, {
        method: "POST",
        body: payload,
      });
    },
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
      setPreviewUnavailable(!previewEndpoint);
      toast.error(getErrorMessage(error, "Impossible de previsualiser."));
    },
  });

  const sendBatchMutation = useMutation({
    mutationFn: (payload: CampaignBatchPayload) => {
      if (!sendEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest<CampaignPreviewResponse>(sendEndpoint, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (data, payload) => {
      setSendResponse(data);
      setSendPayload(payload);
      setSendUnavailable(false);
      setSendNotice(null);
      toast.success("Batch d'envoi lance.");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      if (isUnavailableError(error)) {
        setSendUnavailable(true);
        setSendResponse(null);
        setSendPayload(null);
        return;
      }
      setSendUnavailable(!sendEndpoint);
      toast.error(getErrorMessage(error, "Impossible de lancer l'envoi."));
    },
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string | number) => {
      if (!sendByIdEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest(sendByIdEndpoint(campaignId), { method: "POST" });
    },
    onMutate: (campaignId) => {
      setSendingId(campaignId);
    },
    onSuccess: () => {
      toast.success("Envoi de campagne lance.");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      if (isUnavailableError(error)) {
        toast.error("Envoi non disponible.");
        return;
      }
      toast.error(getErrorMessage(error, "Impossible d'envoyer la campagne."));
    },
    onSettled: () => {
      setSendingId(null);
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
  const templateOptions = useMemo(
    () => normalizeTemplateOptions(templatesQuery.data),
    [templatesQuery.data]
  );
  const runOptions = useMemo(() => {
    const runs = normalizeRuns(runsQuery.data);
    const ids = runs
      .map((run) => getRunId(run))
      .filter((value): value is string | number => value !== null)
      .map((value) => String(value));
    return Array.from(new Set(ids));
  }, [runsQuery.data]);

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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const campaignId = getCampaignId(row.original);
          const status = getStringValue(row.original, ["status", "state"]);
          const normalizedStatus = status ? String(status).toLowerCase() : "";
          const isSent = ["sent", "success", "done", "completed"].includes(
            normalizedStatus
          );
          const isPending =
            sendMutation.isPending && campaignId !== null && campaignId === sendingId;

          if (!sendByIdEndpoint) {
            return (
              <Button size="sm" variant="outline" disabled>
                Non disponible
              </Button>
            );
          }

          if (isSent) {
            return (
              <Button size="sm" variant="outline" disabled>
                Deja envoyee
              </Button>
            );
          }

          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (campaignId !== null) {
                  sendMutation.mutate(campaignId);
                }
              }}
              disabled={campaignId === null || isPending}
            >
              {isPending ? "Envoi..." : "Envoyer"}
            </Button>
          );
        },
      },
    ],
    [sendByIdEndpoint, sendMutation, sendingId]
  );

  const canCreate = campaignsAvailable && form.name.trim().length > 0;
  const canPreview = previewAvailable && form.templateId.trim().length > 0;
  const canSendBatch = sendAvailable && form.templateId.trim().length > 0;

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
  const sendErrorMessage =
    sendBatchMutation.isError && !sendUnavailable
      ? getErrorMessage(sendBatchMutation.error, "Impossible d'envoyer le batch.")
      : null;
  const segmentsErrorMessage = segmentsQuery.isError
    ? getErrorMessage(
        segmentsQuery.error,
        "Impossible de charger les audiences."
      )
    : null;
  const templatesErrorMessage = templatesQuery.isError
    ? getErrorMessage(
        templatesQuery.error,
        "Impossible de charger les templates."
      )
    : null;
  const segmentsUnavailable =
    !segmentsAvailable ||
    (segmentsQuery.isError && isUnavailableError(segmentsQuery.error));
  const templatesUnavailable =
    !templatesAvailable ||
    (templatesQuery.isError && isUnavailableError(templatesQuery.error));

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPreviewResponse(null);
      setPreviewPayload(null);
      setPreviewUnavailable(false);
      setPreviewNotice(null);
      setSendResponse(null);
      setSendPayload(null);
      setSendUnavailable(false);
      setSendNotice(null);
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
    const payload: CampaignBatchPayload = {
      template_id: templateId,
      batch_size: form.batchSize,
      preview_only: true,
    };
    const runId = form.runId.trim();
    if (runId) {
      payload.run_id = runId;
    }
    if (form.segment.trim()) {
      payload.segment = form.segment.trim();
    }
    setPreviewNotice(null);
    previewMutation.mutate(payload);
  };

  const handleSendBatch = () => {
    const templateId = form.templateId.trim();
    if (!templateId) {
      setSendNotice("Renseignez un template pour envoyer.");
      return;
    }
    const runId = form.runId.trim();
    const payload: CampaignBatchPayload = {
      template_id: templateId,
      batch_size: form.batchSize,
      preview_only: false,
    };
    if (runId) {
      payload.run_id = runId;
    }
    if (form.segment.trim()) {
      payload.segment = form.segment.trim();
    }
    setSendNotice(null);
    if (!window.confirm("Confirmer l'envoi du batch de campagne ?")) {
      return;
    }
    sendBatchMutation.mutate(payload);
  };

  const previewStats = previewResponse
    ? {
        nSelected: previewResponse.n_selected ?? 0,
        nInBatch: previewResponse.n_in_batch ?? 0,
        dryRun: previewResponse.dry_run ? "Oui" : "Non",
      }
    : null;

  const sendStats = sendResponse
    ? {
        nSelected: sendResponse.n_selected ?? 0,
        nInBatch: sendResponse.n_in_batch ?? 0,
        dryRun: sendResponse.dry_run ? "Oui" : "Non",
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        description="Lister, creer et previsualiser vos campagnes email."
        actions={
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!campaignsAvailable}
          >
            {campaignsAvailable ? "Nouvelle campagne" : "Non disponible"}
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
              disabled={!campaignsAvailable || campaignsQuery.isFetching}
            >
              {campaignsQuery.isFetching ? "Chargement..." : "Rafraichir"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!campaignsAvailable ? (
            <EmptyState
              title="Campagnes indisponibles."
              description="Endpoint campagnes absent."
            />
          ) : campaignsQuery.isLoading ? (
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
                  list={
                    templateOptions.length ? "campaign-template-options" : undefined
                  }
                  placeholder="Ex: 42"
                />
                {templateOptions.length ? (
                  <datalist id="campaign-template-options">
                    {templateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>
                ) : null}
                {templatesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Chargement des templates...
                  </p>
                ) : null}
                {templatesUnavailable ? (
                  <div className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
                    Non disponible (endpoint templates absent).
                  </div>
                ) : null}
                {templatesQuery.isError ? (
                  <ErrorState message={templatesErrorMessage ?? ""} />
                ) : null}
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
                ) : segmentOptions.length && !segmentsUnavailable ? (
                  <>
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
                    {segmentsQuery.isError ? (
                      <ErrorState message={segmentsErrorMessage ?? ""} />
                    ) : null}
                  </>
                ) : (
                  <>
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
                    {segmentsUnavailable ? (
                      <div className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
                        Non disponible (endpoint segments absent).
                      </div>
                    ) : null}
                    {segmentsQuery.isError ? (
                      <ErrorState message={segmentsErrorMessage ?? ""} />
                    ) : null}
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-run-id">Run ID (optionnel)</Label>
                <Input
                  id="campaign-run-id"
                  value={form.runId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      runId: event.target.value,
                    }))
                  }
                  list={runOptions.length ? "campaign-run-options" : undefined}
                  placeholder="Dernier run si vide"
                />
                {runOptions.length ? (
                  <datalist id="campaign-run-options">
                    {runOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                ) : null}
                {runsEndpoint ? (
                  runsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">
                      Chargement des runs...
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Laissez vide pour utiliser le dernier run disponible.
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Liste des runs indisponible (endpoint manquant).
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-batch-size">Batch (200-300)</Label>
                <Input
                  id="campaign-batch-size"
                  type="number"
                  min={200}
                  max={300}
                  value={form.batchSize}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    const normalized = Number.isFinite(raw)
                      ? Math.min(300, Math.max(200, raw))
                      : 200;
                    setForm((prev) => ({
                      ...prev,
                      batchSize: normalized,
                    }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Taille du batch pour la previsualisation et l'envoi.
                </p>
              </div>
            </div>

            {createErrorMessage ? (
              <ErrorState message={createErrorMessage} />
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Previsualisation / Dry-run</CardTitle>
                  {previewResponse?.dry_run ? (
                    <Badge variant="outline">Simulation</Badge>
                  ) : null}
                </div>
                <CardDescription>
                  Estimez le volume cible et verifiez un exemple de payload.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!previewAvailable ? (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (endpoint previsualisation absent).
                  </div>
                ) : previewMutation.isPending ? (
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
                    {previewResponse.dry_run ? (
                      <p className="text-xs text-muted-foreground">
                        Simulation active (aucun envoi reel).
                      </p>
                    ) : null}
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
                    {previewResponse.result ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Resultat</p>
                        <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          {stringifyJson(previewResponse.result)}
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

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Envoi batch</CardTitle>
                  {sendResponse?.dry_run ? (
                    <Badge variant="outline">Simulation</Badge>
                  ) : null}
                </div>
                <CardDescription>
                  Envoie un batch de 200-300 contacts depuis le dernier run.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sendAvailable ? (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (endpoint envoi absent).
                  </div>
                ) : sendBatchMutation.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                ) : sendUnavailable ? (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Non disponible (backend non expose).
                  </div>
                ) : sendNotice ? (
                  <ErrorState message={sendNotice} />
                ) : sendErrorMessage ? (
                  <ErrorState message={sendErrorMessage} />
                ) : sendResponse ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Selectionnes
                        </div>
                        <div className="font-medium">
                          {sendStats?.nSelected ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Dans le batch
                        </div>
                        <div className="font-medium">
                          {sendStats?.nInBatch ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">
                          Dry run
                        </div>
                        <div className="font-medium">
                          {sendStats?.dryRun ?? "-"}
                        </div>
                      </div>
                    </div>
                    {sendResponse.dry_run ? (
                      <p className="text-xs text-muted-foreground">
                        Simulation active (aucun envoi reel).
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Payload</p>
                      <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        {stringifyJson(sendPayload)}
                      </pre>
                    </div>
                    {sendResponse.preview?.length ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          Exemple destinataire
                        </p>
                        <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          {stringifyJson(sendResponse.preview[0])}
                        </pre>
                      </div>
                    ) : null}
                    {sendResponse.result ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Resultat</p>
                        <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          {stringifyJson(sendResponse.result)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    title="Aucun envoi lance"
                    description="Lancez un batch pour suivre le statut."
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
              onClick={handleSendBatch}
              disabled={!canSendBatch || sendBatchMutation.isPending}
            >
              {sendBatchMutation.isPending ? "Envoi..." : "Envoyer le batch"}
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
