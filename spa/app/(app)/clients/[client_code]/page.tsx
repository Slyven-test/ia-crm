"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";

type Client = {
  client_code: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  segment?: string;
};

type Sale = {
  date?: string;
  amount?: number;
  product?: string;
};

type Recommendation = {
  id?: string | number;
  product_key?: string;
  status?: string;
  score?: number;
};

export default function ClientDetailPage() {
  const params = useParams<{ client_code: string }>();
  const clientCode = params?.client_code ?? "";

  const clientQuery = useQuery({
    queryKey: ["clients", clientCode],
    queryFn: () => apiRequest<Client>(endpoints.clients.detail(clientCode)),
    enabled: Boolean(clientCode),
  });

  const salesQuery = useQuery({
    queryKey: ["sales", clientCode],
    queryFn: () =>
      apiRequest<Sale[]>(endpoints.sales.customerHistory(clientCode)),
    enabled: Boolean(clientCode),
  });

  const recosQuery = useQuery({
    queryKey: ["recommendations", clientCode],
    queryFn: () =>
      apiRequest<Recommendation[]>(endpoints.recommendations.byClient(clientCode)),
    enabled: Boolean(clientCode),
  });

  const generateReco = useMutation({
    mutationFn: () =>
      apiRequest(endpoints.recommendations.generate, {
        method: "POST",
        body: { client_code: clientCode },
      }),
    onSuccess: () => {
      toast.success("Generation des recommandations lancee.");
      recosQuery.refetch();
    },
    onError: () => {
      toast.error("Impossible de generer les recommandations.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Client ${clientCode}`}
        description="Profil, historique des ventes et recommandations."
        actions={
          <Button
            onClick={() => generateReco.mutate()}
            disabled={generateReco.isPending}
          >
            Generer recos
          </Button>
        }
      />

      {clientQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : clientQuery.error ? (
        <ErrorState message="Impossible de charger le client." />
      ) : clientQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Informations client</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Nom</p>
              <p className="text-sm font-medium">
                {clientQuery.data.name || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">
                {clientQuery.data.email || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Telephone</p>
              <p className="text-sm font-medium">
                {clientQuery.data.phone || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Segment</p>
              <p className="text-sm font-medium">
                {clientQuery.data.segment || "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Historique des ventes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : salesQuery.error ? (
              <ErrorState message="Impossible de charger les ventes." />
            ) : salesQuery.data && salesQuery.data.length ? (
              salesQuery.data.map((sale, index) => (
                <div key={`${clientCode}-sale-${index}`} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(sale.date)}
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {sale.product || "Produit"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(sale.amount ?? 0)}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Aucune vente enregistree." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommandations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recosQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : recosQuery.error ? (
              <ErrorState message="Impossible de charger les recommandations." />
            ) : recosQuery.data && recosQuery.data.length ? (
              recosQuery.data.map((reco, index) => (
                <div key={`${clientCode}-reco-${index}`} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Produit {reco.product_key || "-"}
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    Score {formatNumber(reco.score ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Statut {reco.status || "-"}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Aucune recommandation pour ce client." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
