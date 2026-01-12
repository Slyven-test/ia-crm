"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ClientRecord,
  type RecommendationRecord,
  createManualSale,
  getClient,
  listRecommendationsByClient,
  normalizeApiError,
  runRecommendationsForClient,
  updateClient,
  updateRecommendationApproval,
} from "@/lib/api-client";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

type Sale = {
  date?: string;
  amount?: number;
  product?: string;
};

type ClientFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  visibility: string;
};

type SaleFormState = {
  product_key: string;
  quantity: string;
  amount: string;
  sale_date: string;
};

type RecommendationRunState = {
  scenario: string;
  limit: string;
};

const createEmptySaleForm = (): SaleFormState => ({
  product_key: "",
  quantity: "",
  amount: "",
  sale_date: "",
});

const createEmptyRunForm = (): RecommendationRunState => ({
  scenario: "cross-sell",
  limit: "5",
});

const parseNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const buildClientPayload = (
  form: ClientFormState,
  client: ClientRecord | undefined
) => {
  const payload: Record<string, unknown> = {
    name: form.name.trim() || undefined,
    email: form.email.trim() || undefined,
  };

  if (client && "phone" in client) {
    payload.phone = form.phone.trim() || undefined;
  }

  if (client && "address" in client) {
    payload.address = form.address.trim() || undefined;
  }

  if (client && "visibility" in client) {
    payload.visibility = form.visibility.trim() || undefined;
  }

  return payload;
};

const buildSalePayload = (form: SaleFormState, clientCode: string) => ({
  client_code: clientCode,
  product_key: form.product_key.trim(),
  quantity: parseNumber(form.quantity),
  amount: parseNumber(form.amount),
  sale_date: form.sale_date || undefined,
});

const formatValue = (value: string | number | null | undefined) =>
  value === null || typeof value === "undefined" || value === ""
    ? "-"
    : String(value);

export default function ClientDetailPage() {
  const params = useParams<{ client_code: string }>();
  const clientCode = params?.client_code ?? "";
  const queryClient = useQueryClient();
  const [clientForm, setClientForm] = useState<ClientFormState>({
    name: "",
    email: "",
    phone: "",
    address: "",
    visibility: "tenant",
  });
  const [saleForm, setSaleForm] = useState<SaleFormState>(createEmptySaleForm);
  const [runForm, setRunForm] = useState<RecommendationRunState>(
    createEmptyRunForm
  );
  const [expandedRecoIds, setExpandedRecoIds] = useState<Set<string>>(
    () => new Set()
  );

  const clientQuery = useQuery({
    queryKey: ["clients", clientCode],
    queryFn: () => getClient(clientCode),
    enabled: Boolean(clientCode),
  });

  useEffect(() => {
    if (!clientQuery.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientForm({
      name: clientQuery.data.name ?? "",
      email: clientQuery.data.email ?? "",
      phone:
        typeof clientQuery.data.phone === "string" ||
        typeof clientQuery.data.phone === "number"
          ? String(clientQuery.data.phone)
          : "",
      address:
        typeof clientQuery.data.address === "string" ||
        typeof clientQuery.data.address === "number"
          ? String(clientQuery.data.address)
          : "",
      visibility: clientQuery.data.visibility ?? "tenant",
    });
  }, [clientQuery.data]);

  const salesQuery = useQuery({
    queryKey: ["sales", clientCode],
    queryFn: () =>
      apiRequest<Sale[]>(endpoints.sales.customerHistory(clientCode)),
    enabled: Boolean(clientCode),
  });

  const recosQuery = useQuery({
    queryKey: ["recommendations-v2", clientCode],
    queryFn: () => listRecommendationsByClient(clientCode),
    enabled: Boolean(clientCode),
  });

  const updateClientMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      updateClient(clientCode, payload),
    onSuccess: () => {
      toast.success("Client mis a jour.");
      queryClient.invalidateQueries({ queryKey: ["clients", clientCode] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour le client.")
      );
    },
  });

  const createSaleMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildSalePayload>) =>
      createManualSale(payload),
    onSuccess: () => {
      toast.success("Vente ajoutee.");
      setSaleForm(createEmptySaleForm());
      salesQuery.refetch();
      clientQuery.refetch();
      recosQuery.refetch();
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "Impossible de creer la vente."));
    },
  });

  const runRecommendationsMutation = useMutation({
    mutationFn: () =>
      runRecommendationsForClient(clientCode, {
        scenario: runForm.scenario,
        limit: parseNumber(runForm.limit),
      }),
    onSuccess: () => {
      toast.success("Recommandations lancees.");
      recosQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de lancer les recommandations.")
      );
    },
  });

  const toggleApprovalMutation = useMutation({
    mutationFn: (payload: { id: string | number; is_approved: boolean }) =>
      updateRecommendationApproval(payload.id, payload.is_approved),
    onSuccess: () => {
      recosQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour la validation.")
      );
    },
  });

  const metrics = useMemo(() => {
    const data = clientQuery.data;
    if (!data) return [];
    return [
      { label: "Segment RFM", value: data.rfm_segment },
      { label: "Recence", value: data.recency },
      { label: "Frequence", value: data.frequency },
      { label: "Monetaire", value: data.monetary },
      { label: "Dernier achat", value: data.last_purchase_date },
      { label: "Commandes", value: data.total_orders },
      { label: "Total depense", value: data.total_spent },
    ].filter(
      (metric) =>
        metric.value !== null &&
        typeof metric.value !== "undefined" &&
        metric.value !== ""
    );
  }, [clientQuery.data]);

  const recos = useMemo(() => recosQuery.data ?? [], [recosQuery.data]);

  const handleToggleReco = (reco: RecommendationRecord) => {
    if (!reco.id) return;
    const next = !reco.is_approved;
    toggleApprovalMutation.mutate({ id: reco.id, is_approved: next });
  };

  const toggleExpanded = (reco: RecommendationRecord) => {
    if (!reco.id) return;
    const key = String(reco.id);
    setExpandedRecoIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSaveClient = () => {
    if (!clientQuery.data) return;
    updateClientMutation.mutate(buildClientPayload(clientForm, clientQuery.data));
  };

  const handleCreateSale = () => {
    if (!clientCode) return;
    if (!saleForm.product_key.trim()) {
      toast.error("Le produit est requis.");
      return;
    }
    createSaleMutation.mutate(buildSalePayload(saleForm, clientCode));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Client ${clientCode}`}
        description="Profil, historique des ventes et recommandations."
        actions={
          <Button onClick={handleSaveClient} disabled={updateClientMutation.isPending}>
            Enregistrer
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
            <div className="space-y-2">
              <Label htmlFor="client-name">Nom</Label>
              <Input
                id="client-name"
                value={clientForm.name}
                onChange={(event) =>
                  setClientForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                value={clientForm.email}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />
            </div>
            {"phone" in clientQuery.data ? (
              <div className="space-y-2">
                <Label htmlFor="client-phone">Telephone</Label>
                <Input
                  id="client-phone"
                  value={clientForm.phone}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}
            {"address" in clientQuery.data ? (
              <div className="space-y-2">
                <Label htmlFor="client-address">Adresse</Label>
                <Input
                  id="client-address"
                  value={clientForm.address}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      address: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}
            {"visibility" in clientQuery.data ? (
              <div className="space-y-2">
                <Label htmlFor="client-visibility">Visibilite</Label>
                <Input
                  id="client-visibility"
                  value={clientForm.visibility}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      visibility: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {metrics.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Indicateurs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-sm font-medium">
                  {metric.label === "Total depense"
                    ? formatCurrency(metric.value as number)
                    : metric.label === "Dernier achat"
                      ? formatDate(metric.value as string)
                      : typeof metric.value === "number"
                        ? formatNumber(metric.value)
                        : formatValue(metric.value as string)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* TODO: Hook notes list/create endpoints when available. */}
            <EmptyState title="Aucune note disponible." />
            <div className="space-y-2">
              <Label htmlFor="note-title">Titre</Label>
              <Input id="note-title" placeholder="Ajouter un titre..." />
              <Label htmlFor="note-body">Note</Label>
              <Input id="note-body" placeholder="Ajouter une note..." />
              <Button variant="outline" disabled>
                Ajouter la note
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ajout manuel de vente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sale-product">Produit</Label>
                <Input
                  id="sale-product"
                  value={saleForm.product_key}
                  onChange={(event) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      product_key: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-quantity">Quantite</Label>
                <Input
                  id="sale-quantity"
                  type="number"
                  value={saleForm.quantity}
                  onChange={(event) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      quantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-amount">Montant</Label>
                <Input
                  id="sale-amount"
                  type="number"
                  value={saleForm.amount}
                  onChange={(event) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-date">Date</Label>
                <Input
                  id="sale-date"
                  type="date"
                  value={saleForm.sale_date}
                  onChange={(event) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      sale_date: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <Button onClick={handleCreateSale} disabled={createSaleMutation.isPending}>
              Ajouter la vente
            </Button>
          </CardContent>
        </Card>
      </div>

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
          <CardTitle>Recommandations v2</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reco-scenario">Scenario</Label>
              <Input
                id="reco-scenario"
                value={runForm.scenario}
                onChange={(event) =>
                  setRunForm((prev) => ({
                    ...prev,
                    scenario: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reco-limit">Limite</Label>
              <Input
                id="reco-limit"
                type="number"
                value={runForm.limit}
                onChange={(event) =>
                  setRunForm((prev) => ({
                    ...prev,
                    limit: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => runRecommendationsMutation.mutate()}
                disabled={runRecommendationsMutation.isPending}
              >
                Lancer
              </Button>
            </div>
          </div>

          {recosQuery.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : recosQuery.error ? (
            <ErrorState message="Impossible de charger les recommandations." />
          ) : recos.length ? (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Creation</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recos.map((reco) => {
                    const key = reco.id ? String(reco.id) : `${reco.client_code}`;
                    const isExpanded = reco.id
                      ? expandedRecoIds.has(String(reco.id))
                      : false;
                    return (
                      <Fragment key={key}>
                        <TableRow key={key}>
                          <TableCell>{formatValue(reco.product_key)}</TableCell>
                          <TableCell>
                            {typeof reco.score === "number"
                              ? formatNumber(reco.score)
                              : "-"}
                          </TableCell>
                          <TableCell>{formatValue(reco.scenario)}</TableCell>
                          <TableCell>
                            {reco.created_at ? formatDate(reco.created_at) : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleReco(reco)}
                              disabled={toggleApprovalMutation.isPending}
                            >
                              {reco.is_approved ? "Approuvee" : "Approuver"}
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleExpanded(reco)}
                              disabled={!reco.id}
                            >
                              {isExpanded ? "Masquer" : "Voir"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="grid gap-2 text-xs text-muted-foreground">
                                <div>
                                  Taste score:{" "}
                                  {typeof reco.taste_score === "number"
                                    ? formatNumber(reco.taste_score)
                                    : "-"}
                                </div>
                                <div>Boosts: {reco.boosts ? JSON.stringify(reco.boosts) : "-"}</div>
                                <div>
                                  Scenario adjustment:{" "}
                                  {reco.scenario_adjustment
                                    ? JSON.stringify(reco.scenario_adjustment)
                                    : "-"}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="Aucune recommandation pour ce client." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
