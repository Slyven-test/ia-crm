"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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

type RunRow = Record<string, unknown>;

type EndpointWithRunId = (
  runId: string | number,
  format: "csv" | "json"
) => string;

type RunExportPayload = {
  runId: string;
  format: "csv" | "json";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveStringEndpoint(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveEndpointFnWithFormat(value: unknown): EndpointWithRunId | null {
  return typeof value === "function" ? (value as EndpointWithRunId) : null;
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

function getRunId(row: RunRow): string | number | null {
  if (typeof row.run_id === "string" || typeof row.run_id === "number") {
    return row.run_id;
  }
  if (typeof row.id === "string" || typeof row.id === "number") {
    return row.id;
  }
  return null;
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

export default function ExportsPage() {
  const endpointsRecord = endpoints as Record<string, unknown>;
  const exportRecord = isRecord(endpointsRecord.export) ? endpointsRecord.export : null;
  const recommendationsRecord = isRecord(endpointsRecord.recommendations)
    ? endpointsRecord.recommendations
    : null;
  const recoRunsRecord = isRecord(endpointsRecord.recoRuns) ? endpointsRecord.recoRuns : null;
  const exportRecommendationsEndpoint = resolveStringEndpoint(
    exportRecord?.recommendations
  );
  const recommendationsListEndpoint = resolveStringEndpoint(
    recommendationsRecord?.list
  );
  const exportRunsEndpoint = resolveEndpointFnWithFormat(
    exportRecord?.runs
  );
  const recoRunsListEndpoint = resolveStringEndpoint(
    recoRunsRecord?.list
  );

  const [runExportId, setRunExportId] = useState("");

  const runsQuery = useQuery({
    queryKey: ["reco-runs", "list", recoRunsListEndpoint ?? "none"],
    queryFn: () => {
      if (!recoRunsListEndpoint) return Promise.resolve(null);
      return apiRequest<unknown>(recoRunsListEndpoint);
    },
    enabled: Boolean(recoRunsListEndpoint),
  });

  const csvRecommendationsDownload = useMutation({
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
    onError: () => {
      toast.error("Impossible de telecharger le CSV des recommandations.");
    },
  });

  const jsonRecommendationsDownload = useMutation({
    mutationFn: async () => {
      if (!recommendationsListEndpoint) {
        throw new ApiError({
          status: 404,
          message: "Export JSON indisponible.",
        });
      }
      const payload = await apiRequest<unknown>(recommendationsListEndpoint);
      triggerDownload(
        JSON.stringify(payload ?? {}, null, 2),
        "recommendations.json",
        "application/json"
      );
    },
    onSuccess: () => {
      toast.success("Export JSON des recommandations telecharge.");
    },
    onError: () => {
      toast.error("Impossible de telecharger le JSON des recommandations.");
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
    onError: () => {
      toast.error("Impossible d'exporter ce run.");
    },
  });

  const runOptions = useMemo(() => {
    const runs = normalizeRuns(runsQuery.data);
    const ids = runs
      .map((run) => getRunId(run))
      .filter((value): value is string | number => value !== null)
      .map((value) => String(value));
    return Array.from(new Set(ids));
  }, [runsQuery.data]);

  const listUnavailable = !exportRecommendationsEndpoint && !recommendationsListEndpoint;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        description="Telechargements des recommandations et runs."
      />

      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Recommandations</CardTitle>
            <CardDescription>
              Exportez les recommandations au format CSV ou JSON.
            </CardDescription>
            {listUnavailable ? (
              <p className="text-xs text-muted-foreground">
                Non disponible (endpoints recommandations absents).
              </p>
            ) : null}
          </div>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => csvRecommendationsDownload.mutate()}
              disabled={!exportRecommendationsEndpoint || csvRecommendationsDownload.isPending}
            >
              {exportRecommendationsEndpoint ? "Telecharger CSV" : "Non disponible"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => jsonRecommendationsDownload.mutate()}
              disabled={!recommendationsListEndpoint || jsonRecommendationsDownload.isPending}
            >
              {recommendationsListEndpoint ? "Telecharger JSON" : "Non disponible"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {listUnavailable ? (
            <EmptyState
              title="Exports indisponibles."
              description="Aucun endpoint ne permet d'exporter les recommandations."
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div>
            <CardTitle>Runs</CardTitle>
            <CardDescription>
              Telechargez les resultats d'un run specifique.
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
                <Label htmlFor="exports-run-id">Run ID</Label>
                <Input
                  id="exports-run-id"
                  value={runExportId}
                  onChange={(event) => setRunExportId(event.target.value)}
                  list={runOptions.length ? "exports-run-options" : undefined}
                  placeholder="Ex: 2024-09-12T10:15"
                />
                {runOptions.length ? (
                  <datalist id="exports-run-options">
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
          {runsQuery.isError ? (
            <ErrorState message="Impossible de charger la liste des runs." />
          ) : runsQuery.isLoading && recoRunsListEndpoint ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
