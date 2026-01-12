"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
  createClient,
  listClients,
  normalizeApiError,
  updateClient,
} from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/format";

type ClientFormState = {
  client_code: string;
  name: string;
  email: string;
  visibility: string;
  owner: string;
  preferred_families: string;
  budget_band: string;
  aroma_profile: string;
};

const PAGE_SIZE = 20;

const createEmptyForm = (): ClientFormState => ({
  client_code: "",
  name: "",
  email: "",
  visibility: "tenant",
  owner: "",
  preferred_families: "",
  budget_band: "",
  aroma_profile: "",
});

const buildPayload = (form: ClientFormState) => ({
  client_code: form.client_code.trim(),
  name: form.name.trim() || undefined,
  email: form.email.trim() || undefined,
  visibility: form.visibility.trim() || undefined,
  owner: form.owner.trim() || undefined,
  preferred_families: form.preferred_families.trim() || undefined,
  budget_band: form.budget_band.trim() || undefined,
  aroma_profile: form.aroma_profile.trim() || undefined,
});

const formatValue = (value: string | number | null | undefined) =>
  value === null || typeof value === "undefined" || value === ""
    ? "-"
    : String(value);

export default function ClientsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [offset, setOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientRecord | null>(null);
  const [formState, setFormState] = useState<ClientFormState>(createEmptyForm);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchValue(searchInput.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const clientsQuery = useQuery({
    queryKey: ["clients", searchValue, offset],
    queryFn: () =>
      listClients({
        search: searchValue,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: ClientRecord) => createClient(payload),
    onSuccess: () => {
      toast.success("Client ajoute.");
      setDialogOpen(false);
      setFormState(createEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "Impossible de creer le client."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ClientRecord) =>
      updateClient(payload.client_code, payload),
    onSuccess: () => {
      toast.success("Client mis a jour.");
      setDialogOpen(false);
      setEditTarget(null);
      setFormState(createEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour le client.")
      );
    },
  });

  const canSubmit =
    formState.client_code.trim().length > 0 &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  const handleOpenCreate = () => {
    setEditTarget(null);
    setFormState(createEmptyForm());
    setDialogOpen(true);
  };

  const handleOpenEdit = (client: ClientRecord) => {
    setEditTarget(client);
    setFormState({
      client_code: client.client_code,
      name: client.name ?? "",
      email: client.email ?? "",
      visibility: client.visibility ?? "tenant",
      owner: client.owner ?? "",
      preferred_families: client.preferred_families ?? "",
      budget_band: client.budget_band ?? "",
      aroma_profile: client.aroma_profile ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = buildPayload(formState);
    if (editTarget) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const hasNextPage = clients.length === PAGE_SIZE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Suivi des comptes, historique et recommandations."
        actions={<Button onClick={handleOpenCreate}>Ajouter un client</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md flex-1">
          <Label htmlFor="clients-search">Rechercher</Label>
          <Input
            id="clients-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Rechercher par code, nom ou email..."
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {clientsQuery.isFetching && !clientsQuery.isLoading
            ? "Mise a jour..."
            : `${clients.length} resultat(s)`}
        </div>
      </div>

      {clientsQuery.error ? (
        <ErrorState message="Impossible de charger la liste des clients." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Commandes</TableHead>
                <TableHead>Total depense</TableHead>
                <TableHead>Recence</TableHead>
                <TableHead>Segment RFM</TableHead>
                <TableHead>Visibilite</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={`loading-${index}`}>
                    <TableCell colSpan={10} className="py-6">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : clients.length ? (
                clients.map((client) => (
                  <TableRow
                    key={client.client_code}
                    className="cursor-pointer"
                    onClick={() => router.push(`/clients/${client.client_code}`)}
                  >
                    <TableCell className="font-medium">
                      {client.client_code}
                    </TableCell>
                    <TableCell>{formatValue(client.name)}</TableCell>
                    <TableCell>{formatValue(client.email)}</TableCell>
                    <TableCell>
                      {formatValue(client.total_orders)}
                    </TableCell>
                    <TableCell>
                      {typeof client.total_spent === "number"
                        ? formatCurrency(client.total_spent)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {typeof client.recency === "number"
                        ? formatNumber(client.recency)
                        : "-"}
                    </TableCell>
                    <TableCell>{formatValue(client.rfm_segment)}</TableCell>
                    <TableCell>{formatValue(client.visibility)}</TableCell>
                    <TableCell>{formatValue(client.owner)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenEdit(client);
                        }}
                      >
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm">
                    Aucun client disponible.
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
            disabled={offset === 0 || clientsQuery.isLoading}
          >
            Precedent
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            disabled={!hasNextPage || clientsQuery.isLoading}
          >
            Suivant
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Modifier le client" : "Ajouter un client"}
            </DialogTitle>
            <DialogDescription>
              Renseignez les informations principales du client.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-code">Code client</Label>
              <Input
                id="client-code"
                value={formState.client_code}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    client_code: event.target.value,
                  }))
                }
                disabled={Boolean(editTarget)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-name">Nom</Label>
              <Input
                id="client-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                value={formState.email}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-visibility">Visibilite</Label>
              <Input
                id="client-visibility"
                value={formState.visibility}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    visibility: event.target.value,
                  }))
                }
                placeholder="tenant"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-owner">Owner</Label>
              <Input
                id="client-owner"
                value={formState.owner}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    owner: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-families">Familles preferees</Label>
              <Input
                id="client-families"
                value={formState.preferred_families}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    preferred_families: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-budget">Budget</Label>
              <Input
                id="client-budget"
                value={formState.budget_band}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    budget_band: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-aroma">Profil aromatique</Label>
              <Input
                id="client-aroma"
                value={formState.aroma_profile}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_profile: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {editTarget ? "Mettre a jour" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
