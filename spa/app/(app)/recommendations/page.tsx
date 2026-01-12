"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type RecommendationRecord,
  listRecommendationsWithParams,
  normalizeApiError,
  updateRecommendationApproval,
} from "@/lib/api-client";
import { formatNumber } from "@/lib/format";

type RecommendationFilters = {
  scenario: string;
  approved_only: boolean;
  client_code: string;
};

const PAGE_SIZE = 25;

const createDefaultFilters = (): RecommendationFilters => ({
  scenario: "",
  approved_only: false,
  client_code: "",
});

const formatValue = (value: string | number | null | undefined) =>
  value === null || typeof value === "undefined" || value === ""
    ? "-"
    : String(value);

const buildCsv = (rows: RecommendationRecord[]) => {
  const headers = ["client_code", "product_key", "score", "scenario"];
  const escape = (value: string) =>
    value.includes(",") || value.includes('"') || value.includes("\n")
      ? `"${value.replace(/"/g, '""')}"`
      : value;
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        formatValue(row.client_code),
        formatValue(row.product_key),
        typeof row.score === "number" ? String(row.score) : "",
        formatValue(row.scenario),
      ]
        .map((value) => escape(String(value)))
        .join(",")
    ),
  ];
  return lines.join("\n");
};

const downloadCsv = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
};

export default function RecommendationsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<RecommendationFilters>(
    createDefaultFilters
  );
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffset(0);
  }, [filters]);

  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", filters, offset],
    queryFn: () =>
      listRecommendationsWithParams({
        scenario: filters.scenario || undefined,
        approved_only: filters.approved_only,
        client_code: filters.client_code || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const rows = useMemo(
    () => recommendationsQuery.data ?? [],
    [recommendationsQuery.data]
  );

  const toggleApprovalMutation = useMutation({
    mutationFn: (payload: { id: string | number; is_approved: boolean }) =>
      updateRecommendationApproval(payload.id, payload.is_approved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      toast.success("Mise a jour effectuee.");
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour la validation.")
      );
    },
  });

  const handleExportCsv = () => {
    if (!rows.length) {
      toast.error("Aucune recommandation a exporter.");
      return;
    }
    const csv = buildCsv(rows);
    downloadCsv(csv, "recommendations_campaign.csv");
  };

  const handleCopyCsv = async () => {
    if (!rows.length) {
      toast.error("Aucune recommandation a copier.");
      return;
    }
    const csv = buildCsv(rows);
    try {
      await navigator.clipboard.writeText(csv);
      toast.success("CSV copie dans le presse-papiers.");
    } catch {
      toast.error("Impossible de copier le CSV.");
    }
  };

  const hasNextPage = rows.length === PAGE_SIZE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommandations"
        description="Liste globale des recommandations pour les campagnes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleCopyCsv}>
              Copier CSV
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              Exporter CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="filter-client">Client</Label>
          <Input
            id="filter-client"
            placeholder="Rechercher un client..."
            value={filters.client_code}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                client_code: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-scenario">Scenario</Label>
          <Input
            id="filter-scenario"
            placeholder="cross-sell / rebuy / winback"
            value={filters.scenario}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scenario: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-approved">Validees</Label>
          <Button
            id="filter-approved"
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                approved_only: !prev.approved_only,
              }))
            }
          >
            {filters.approved_only ? "Seulement approuvees" : "Toutes"}
          </Button>
        </div>
      </div>

      {recommendationsQuery.error ? (
        <ErrorState message="Impossible de charger les recommandations." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead>Validee</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recommendationsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`loading-${index}`}>
                    <TableCell colSpan={6} className="py-6">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id ?? `${row.client_code}-${row.product_key}`}>
                    <TableCell>{formatValue(row.client_code)}</TableCell>
                    <TableCell>{formatValue(row.product_key)}</TableCell>
                    <TableCell>
                      {typeof row.score === "number"
                        ? formatNumber(row.score)
                        : "-"}
                    </TableCell>
                    <TableCell>{formatValue(row.scenario)}</TableCell>
                    <TableCell>{row.is_approved ? "Oui" : "Non"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!row.id) return;
                          toggleApprovalMutation.mutate({
                            id: row.id,
                            is_approved: !row.is_approved,
                          });
                        }}
                        disabled={
                          toggleApprovalMutation.isPending || typeof row.id === "undefined"
                        }
                      >
                        {row.is_approved ? "Annuler" : "Approuver"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm">
                    Aucune recommandation disponible.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Page {Math.floor(offset / PAGE_SIZE) + 1}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
            disabled={offset === 0 || recommendationsQuery.isLoading}
          >
            Precedent
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            disabled={!hasNextPage || recommendationsQuery.isLoading}
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
}
