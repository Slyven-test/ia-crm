"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";

type Recommendation = {
  id?: string | number;
  client_code?: string;
  product_key?: string;
  score?: number;
  status?: string;
};

export default function RecommendationsPage() {
  const [filter, setFilter] = useState("");
  const query = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => apiRequest<Recommendation[]>(endpoints.recommendations.list),
  });

  const filtered = useMemo(() => {
    if (!query.data) return [];
    if (!filter) return query.data;
    return query.data.filter((item) =>
      String(item.client_code || "")
        .toLowerCase()
        .includes(filter.toLowerCase())
    );
  }, [filter, query.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommandations"
        description="Liste globale et filtre par client."
      />
      <div className="max-w-sm">
        <Input
          placeholder="Filtrer par code client..."
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {query.error ? (
        <ErrorState message="Impossible de charger les recommandations." />
      ) : query.isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Chargement des recommandations...
        </div>
      ) : filtered.length ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((reco) => (
                <TableRow key={String(reco.id ?? `${reco.client_code}-${reco.product_key}`)}>
                  <TableCell>{reco.client_code || "-"}</TableCell>
                  <TableCell>{reco.product_key || "-"}</TableCell>
                  <TableCell>{formatNumber(reco.score ?? 0)}</TableCell>
                  <TableCell>
                    {reco.status ? <Badge variant="outline">{reco.status}</Badge> : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="Aucune recommandation disponible." />
      )}
    </div>
  );
}
