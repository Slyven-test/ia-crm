"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
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

type RecommendationRow = Record<string, unknown>;
type RunRow = Record<string, unknown>;

type EndpointWithRunId = (
  runId: string | number,
  format: "csv" | "json"
) => string;

type RecommendationsPayload = {
  rows: RecommendationRow[];
  headers: string[];
  source: "json" | "csv";
  raw?: unknown;
};

type RunExportPayload = {
  runId: string;
  format: "csv" | "json";
};

const APPROVABLE_STATUSES = new Set(["pending", "draft", "proposed"]);
const UNAVAILABLE_STATUSES = new Set([404, 501]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveStringEndpoint(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveEndpointFnWithFormat(value: unknown): EndpointWithRunId | null {
  return typeof value === "function" ? (value as EndpointWithRunId) : null;
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

function normalizeRows(value: unknown): RecommendationRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const candidates = ["items", "results", "data", "recommendations"];
    for (const key of candidates) {
      if (Array.isArray(value[key])) {
        return value[key].filter(isRecord);
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
        return value[key].filter(isRecord);
      }
    }
  }
  return [];
}

function buildHeaders(rows: RecommendationRow[]): string[] {
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

function detectDelimiter(line: string) {
  const commaCount = (line.match(/,/g) || []).length;
  const semiCount = (line.match(/;/g) || []).length;
  return semiCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const output: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current);
  return output;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) {
    return { headers: [] as string[], rows: [] as RecommendationRow[] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCsvLine(headerLine, delimiter).map((header) =>
    header.trim()
  );

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: RecommendationRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = values[index] ?? "";
    });
    return row;
  });

  const filteredRows = rows.filter((row) =>
    Object.values(row).some((value) => value !== "")
  );

  return { headers, rows: filteredRows };
}

function getRowId(row: RecommendationRow): number | null {
  const candidate = row.id ?? row.recommendation_id ?? row.reco_id;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getRunId(row: RunRow): string | number | null {
  if (typeof row.run_id === "string" || typeof row.run_id === "number") {
    return row.run_id;
  }
  if (typeof row.id === "string" || typeof row.id === "number") {
    return row.id;
  }
  return null;
}

function getRowStatus(row: RecommendationRow): string | null {
  const candidate = row.status ?? row.state ?? row.approval_status;
  if (typeof candidate === "string" && candidate.trim() !== "") {
    return candidate.toLowerCase();
  }
  return null;
}

function getRowApprovedFlag(row: RecommendationRow): boolean | null {
  const candidates = [row.is_approved, row.approved, row.isApproved];
  for (const value of candidates) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function isRowApprovable(row: RecommendationRow): boolean {
  const status = getRowStatus(row);
  if (status && APPROVABLE_STATUSES.has(status)) return true;
  const approvedFlag = getRowApprovedFlag(row);
  return approvedFlag === false;
}

async function fetchRecommendations(
  listEndpoint: string | null,
  exportEndpoint: string | null
): Promise<RecommendationsPayload> {
  if (listEndpoint) {
    try {
      const jsonData = await apiRequest<unknown>(listEndpoint);
      const rows = normalizeRows(jsonData);
      return { rows, headers: buildHeaders(rows), source: "json", raw: jsonData };
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        ![404, 405, 501].includes(error.status)
      ) {
        throw error;
      }
    }
  }

  if (!exportEndpoint) {
    throw new ApiError({
      status: 404,
      message: "Endpoint recommandations indisponible.",
    });
  }

  const csvText = await apiRequest<string>(exportEndpoint, {
    headers: { Accept: "text/csv" },
  });
  const parsed = parseCsv(csvText);
  return { rows: parsed.rows, headers: parsed.headers, source: "csv" };
}

function triggerDownload(payload: string, filename: string, mimeType: string) {
  const blob = new Blob([payload], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
}

export default function RecommendationsPage() {
  const queryClient = useQueryClient();
  const endpointsRecord = endpoints as unknown as Record<string, unknown>;
  const recommendationsRecord = isRecord(endpointsRecord.recommendations)
    ? endpointsRecord.recommendations
    : null;
  const exportRecord = isRecord(endpointsRecord.export)
    ? endpointsRecord.export
    : null;
  const recoRunsRecord = isRecord(endpointsRecord.recoRuns)
    ? endpointsRecord.recoRuns
    : null;
  const recommendationsListEndpoint = resolveStringEndpoint(
    recommendationsRecord?.list
  );
  const recommendationsGenerateEndpoint = resolveStringEndpoint(
    recommendationsRecord?.generate
  );
  const recommendationsApproveEndpoint = resolveStringEndpoint(
    recommendationsRecord?.approve
  );
  const exportRecommendationsEndpoint = resolveStringEndpoint(
    exportRecord?.recommendations
  );
  const exportRunsEndpoint = resolveEndpointFnWithFormat(
    exportRecord?.runs
  );
  const recoRunsListEndpoint = resolveStringEndpoint(
    recoRunsRecord?.list
  );

  const [isGenerateAvailable, setGenerateAvailable] = useState(
    Boolean(recommendationsGenerateEndpoint)
  );
  const [isApproveAvailable, setApproveAvailable] = useState(
    Boolean(recommendationsApproveEndpoint)
  );
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [runExportId, setRunExportId] = useState("");

  const recosAvailable =
    Boolean(recommendationsListEndpoint) || Boolean(exportRecommendationsEndpoint);

  const query = useQuery({
    queryKey: [
      "recommendations",
      recommendationsListEndpoint ?? "none",
      exportRecommendationsEndpoint ?? "none",
    ],
    queryFn: () =>
      fetchRecommendations(
        recommendationsListEndpoint,
        exportRecommendationsEndpoint
      ),
    enabled: recosAvailable,
  });

  const runsQuery = useQuery({
    queryKey: ["reco-runs", "list", recoRunsListEndpoint ?? "none"],
    queryFn: () => {
      if (!recoRunsListEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(recoRunsListEndpoint);
    },
    enabled: Boolean(recoRunsListEndpoint),
  });

  const hasData = (query.data?.rows ?? []).length > 0;
  const hasColumns = (query.data?.headers ?? []).length > 0;
  const isRefreshing = query.isFetching && !query.isLoading;
  const isRecommendationsUnavailable = isUnavailableError(query.error);
  const queryErrorMessage =
    query.error
      ? formatApiErrorMessage(
          query.error,
          "Impossible de charger les recommandations."
        )
      : "Impossible de charger les recommandations.";

  const csvDownload = useMutation({
    mutationFn: async () => {
      if (!exportRecommendationsEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Export recommandations indisponible.",
        });
      }
      const csvPayload = await apiRequest<string>(exportRecommendationsEndpoint, {
        headers: { Accept: "text/csv" },
      });
      triggerDownload(csvPayload, "recommendations.csv", "text/csv");
    },
    onSuccess: () => {
      toast.success("Export CSV des recommandations telecharge.");
    },
    onError: (error) => {
      toast.error(
        formatApiErrorMessage(
          error,
          "Impossible de telecharger le CSV des recommandations."
        )
      );
    },
  });

  const jsonDownload = useMutation({
    mutationFn: async () => {
      if (!recommendationsListEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Export JSON indisponible.",
        });
      }
      const payload =
        query.data?.source === "json"
          ? query.data?.raw
          : await apiRequest<unknown>(recommendationsListEndpoint);
      triggerDownload(
        JSON.stringify(payload ?? {}, null, 2),
        "recommendations.json",
        "application/json"
      );
    },
    onSuccess: () => {
      toast.success("Export JSON des recommandations telecharge.");
    },
    onError: (error) => {
      toast.error(
        formatApiErrorMessage(
          error,
          "Impossible de telecharger le JSON des recommandations."
        )
      );
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!recommendationsGenerateEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest(recommendationsGenerateEndpoint, { method: "POST" });
    },
    onSuccess: async (payload) => {
      const summary =
        payload && isRecord(payload)
          ? [payload.run_id, payload.id].find(
              (value) => typeof value === "string" || typeof value === "number"
            )
          : null;
      toast.success(
        summary
          ? `Generation des recommandations lancee (run ${summary}).`
          : "Generation des recommandations lancee."
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
        queryClient.invalidateQueries({ queryKey: ["reco-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["runs", "latest"] }),
        queryClient.invalidateQueries({ queryKey: ["audit", "latest"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
        setGenerateAvailable(false);
        toast.error(`HTTP ${error.status} - Non disponible`);
        return;
      }
      toast.error(
        formatApiErrorMessage(
          error,
          "Impossible de generer les recommandations."
        )
      );
    },
  });

  const approveMutation = useMutation({
    mutationFn: (recoId: number) => {
      if (!recommendationsApproveEndpoint) {
        throw new ApiError({ status: 404, message: "Endpoint absent." });
      }
      return apiRequest(recommendationsApproveEndpoint, {
        method: "POST",
        body: [recoId],
      });
    },
    onMutate: (recoId) => {
      setApprovingId(recoId);
    },
    onSuccess: async () => {
      toast.success("Recommandation approuvee.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
        queryClient.invalidateQueries({ queryKey: ["reco-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["runs", "latest"] }),
        queryClient.invalidateQueries({ queryKey: ["audit", "latest"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
        setApproveAvailable(false);
        toast.error(`HTTP ${error.status} - Non disponible`);
        return;
      }
      toast.error(
        formatApiErrorMessage(
          error,
          "Impossible d'approuver la recommandation."
        )
      );
    },
    onSettled: () => {
      setApprovingId(null);
    },
  });

  const runExportMutation = useMutation({
    mutationFn: async ({ runId, format }: RunExportPayload) => {
      if (!exportRunsEndpoint) {
        throw new ApiError({ status: 404, message: "Export indisponible." });
      }
      if (format === "csv") {
        const payload = await apiRequest<string>(exportRunsEndpoint(runId, "csv"), {
          headers: { Accept: "text/csv" },
        });
        triggerDownload(payload, `run_${runId}.csv`, "text/csv");
        return { format };
      }
      const jsonPayload = await apiRequest<unknown>(
        exportRunsEndpoint(runId, "json")
      );
      triggerDownload(
        JSON.stringify(jsonPayload ?? {}, null, 2),
        `run_${runId}.json`,
        "application/json"
      );
      return { format };
    },
    onSuccess: (_, variables) => {
      const label = variables.format === "json" ? "JSON" : "CSV";
      toast.success(`Export ${label} du run ${variables.runId} telecharge.`);
    },
    onError: (error) => {
      toast.error(
        formatApiErrorMessage(error, "Impossible d'exporter ce run.")
      );
    },
  });

  const columns = useMemo<ColumnDef<RecommendationRow>[]>(() => {
    const baseColumns = (query.data?.headers ?? []).map((header) => ({
      accessorKey: header,
      header: humanizeKey(header),
      cell: ({ row }: { row: { original: RecommendationRow } }) =>
        formatCellValue(row.original[header]),
    }));

    if (query.data?.source !== "json") {
      return baseColumns;
    }

    return [
      ...baseColumns,
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }: { row: { original: RecommendationRow } }) => {
          if (!isRowApprovable(row.original)) return "-";
          if (!isApproveAvailable) {
            return (
              <Button size="sm" variant="outline" disabled>
                Non disponible
              </Button>
            );
          }
          const rowId = getRowId(row.original);
          const isPending =
            approveMutation.isPending && approvingId === rowId;
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (rowId !== null) {
                  approveMutation.mutate(rowId);
                }
              }}
              disabled={rowId === null || isPending}
            >
              {isPending ? "Approbation..." : "Approuver"}
            </Button>
          );
        },
      },
    ];
  }, [
    approvingId,
    approveMutation,
    isApproveAvailable,
    query.data?.headers,
    query.data?.source,
  ]);

  const runOptions = useMemo(() => {
    const runs = normalizeRuns(runsQuery.data);
    const ids = runs
      .map((run) => getRunId(run))
      .filter((value): value is string | number => value !== null)
      .map((value) => String(value));
    return Array.from(new Set(ids));
  }, [runsQuery.data]);

  const isGeneratePending = generateMutation.isPending;
  const generateLabel = isGenerateAvailable
    ? isGeneratePending
      ? "Lancement..."
      : "Lancer un run"
    : "Non disponible";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommandations"
        description="Vue globale des recommandations et exports disponibles."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/runs">Voir les runs</Link>
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!isGenerateAvailable || isGeneratePending}
            >
              {isGeneratePending ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Lancement...
                </>
              ) : (
                generateLabel
              )}
            </Button>
          </div>
        }
      />
      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Liste des recommandations</CardTitle>
            <CardDescription>
              Consultez les recommandations issues des derniers calculs.
            </CardDescription>
            {query.data?.source === "csv" ? (
              <p className="text-xs text-muted-foreground">
                source: export recommandations
              </p>
            ) : null}
            {!recosAvailable ? (
              <p className="text-xs text-muted-foreground">
                Non disponible (endpoint recommandations absent).
              </p>
            ) : null}
          </div>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={!recosAvailable || query.isFetching}
            >
              {isRefreshing ? "Rafraichir..." : "Rafraichir"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => csvDownload.mutate()}
              disabled={!exportRecommendationsEndpoint || csvDownload.isPending}
            >
              {exportRecommendationsEndpoint ? "Telecharger CSV" : "Non disponible"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => jsonDownload.mutate()}
              disabled={!recommendationsListEndpoint || jsonDownload.isPending}
            >
              {recommendationsListEndpoint ? "Telecharger JSON" : "Non disponible"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!recosAvailable || isRecommendationsUnavailable ? (
            <EmptyState
              title="Recommandations indisponibles."
              description="Aucun endpoint ne permet de charger les recommandations."
            />
          ) : query.error ? (
            <ErrorState message={queryErrorMessage} />
          ) : query.isLoading ? (
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
              title="Aucune recommandation disponible."
              description="Les recommandations apparaitront apres une generation."
              action={
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={!isGenerateAvailable || isGeneratePending}
                >
                  {isGeneratePending ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Lancement...
                  </>
                ) : isGenerateAvailable ? (
                  "Lancer un run"
                ) : (
                  "Non disponible"
                )}
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={query.data?.rows ?? []}
              isLoading={query.isLoading}
              filterPlaceholder="Rechercher dans les recommandations..."
              emptyMessage={
                hasData
                  ? "Aucun resultat ne correspond au filtre."
                  : "Aucune recommandation disponible."
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Exports par run</CardTitle>
            <CardDescription>
              Telechargez les recommandations generees par un run specifique.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!exportRunsEndpoint ? (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              Non disponible (endpoint export runs absent).
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="run-export-id">Run ID</Label>
                <Input
                  id="run-export-id"
                  value={runExportId}
                  onChange={(event) => setRunExportId(event.target.value)}
                  list={runOptions.length ? "run-export-options" : undefined}
                  placeholder="Ex: 2024-09-12T10:15"
                />
                {runOptions.length ? (
                  <datalist id="run-export-options">
                    {runOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                ) : null}
                {recoRunsListEndpoint ? (
                  runsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">
                      Chargement des runs disponibles...
                    </p>
                  ) : runsQuery.error ? (
                    <p className="text-xs text-muted-foreground">
                      {isUnavailableError(runsQuery.error)
                        ? formatApiErrorMessage(
                            runsQuery.error,
                            "Liste des runs indisponible."
                          )
                        : formatApiErrorMessage(
                            runsQuery.error,
                            "Impossible de charger la liste des runs."
                          )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {runOptions.length
                        ? "Selectionnez un run recent ou saisissez un identifiant."
                        : "Saisissez un identifiant de run."}
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Liste des runs indisponible (endpoint manquant).
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const value = runExportId.trim();
                  if (!value) {
                    toast.error("Renseignez un run id.");
                    return;
                  }
                  runExportMutation.mutate({ runId: value, format: "csv" });
                }}
                disabled={runExportMutation.isPending}
              >
                Exporter CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const value = runExportId.trim();
                  if (!value) {
                    toast.error("Renseignez un run id.");
                    return;
                  }
                  runExportMutation.mutate({ runId: value, format: "json" });
                }}
                disabled={runExportMutation.isPending}
              >
                Exporter JSON
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
