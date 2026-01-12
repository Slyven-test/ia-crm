"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { ApiError } from "@/lib/api";
import {
  type TasteDimensionRecord,
  createTasteDimension,
  listTasteDimensions,
  normalizeApiError,
  updateTasteDimension,
} from "@/lib/api-client";

type TasteDimensionFormState = {
  key: string;
  label: string;
  weight: string;
  is_active: boolean;
};

const createEmptyForm = (): TasteDimensionFormState => ({
  key: "",
  label: "",
  weight: "",
  is_active: true,
});

const parseWeight = (value: string) => {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const formatValue = (value: string | number | null | undefined) =>
  value === null || typeof value === "undefined" || value === ""
    ? "-"
    : String(value);

export default function TasteDimensionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TasteDimensionRecord | null>(
    null
  );
  const [createForm, setCreateForm] = useState<TasteDimensionFormState>(
    createEmptyForm
  );
  const [editForm, setEditForm] = useState<TasteDimensionFormState>(
    createEmptyForm
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const dimensionsQuery = useQuery({
    queryKey: ["taste-dimensions"],
    queryFn: () => listTasteDimensions(),
  });

  const dimensions = useMemo(
    () => dimensionsQuery.data ?? [],
    [dimensionsQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: (payload: TasteDimensionRecord) => createTasteDimension(payload),
    onSuccess: () => {
      toast.success("Dimension ajoutee.");
      setCreateOpen(false);
      setCreateForm(createEmptyForm());
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ["taste-dimensions"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setCreateError("Cette cle existe deja. Utilisez une cle unique.");
        return;
      }
      setCreateError(null);
      toast.error(
        normalizeApiError(error, "Impossible de creer la dimension.")
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: TasteDimensionRecord) =>
      updateTasteDimension(payload.id ?? payload.key ?? "", payload),
    onSuccess: () => {
      toast.success("Dimension mise a jour.");
      setEditTarget(null);
      setEditForm(createEmptyForm());
      setEditError(null);
      queryClient.invalidateQueries({ queryKey: ["taste-dimensions"] });
    },
    onError: (error) => {
      setEditError(null);
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour la dimension.")
      );
    },
  });

  const handleOpenEdit = (dimension: TasteDimensionRecord) => {
    setEditTarget(dimension);
    setEditForm({
      key: dimension.key ?? "",
      label: dimension.label ?? "",
      weight: dimension.weight?.toString() ?? "",
      is_active: dimension.is_active ?? true,
    });
    setEditError(null);
  };

  const handleCreate = () => {
    setCreateError(null);
    if (!createForm.key.trim()) {
      setCreateError("La cle est requise.");
      return;
    }
    const weight = parseWeight(createForm.weight);
    if (createForm.weight.trim() && typeof weight !== "number") {
      setCreateError("Le poids doit etre numerique.");
      return;
    }
    createMutation.mutate({
      key: createForm.key.trim(),
      label: createForm.label.trim() || undefined,
      weight,
      is_active: createForm.is_active,
    });
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    setEditError(null);
    const weight = parseWeight(editForm.weight);
    if (editForm.weight.trim() && typeof weight !== "number") {
      setEditError("Le poids doit etre numerique.");
      return;
    }
    updateMutation.mutate({
      id: editTarget.id,
      key: editTarget.key,
      label: editTarget.label,
      weight,
      is_active: editForm.is_active,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Taste dimensions"
        description="Administration des dimensions de gout."
        actions={<Button onClick={() => setCreateOpen(true)}>Ajouter</Button>}
      />

      {dimensionsQuery.error ? (
        <ErrorState message="Impossible de charger les dimensions." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cle</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Poids</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dimensionsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`loading-${index}`}>
                    <TableCell colSpan={5} className="py-6">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : dimensions.length ? (
                dimensions.map((dimension) => (
                  <TableRow key={dimension.id ?? dimension.key}>
                    <TableCell className="font-medium">
                      {formatValue(dimension.key)}
                    </TableCell>
                    <TableCell>{formatValue(dimension.label)}</TableCell>
                    <TableCell>{formatValue(dimension.weight)}</TableCell>
                    <TableCell>
                      {dimension.is_active ? "Actif" : "Inactif"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(dimension)}
                      >
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm">
                    Aucune dimension disponible.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter une dimension</DialogTitle>
            <DialogDescription>
              Renseignez la cle, le label et le poids.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dimension-key">Cle</Label>
              <Input
                id="dimension-key"
                value={createForm.key}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, key: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimension-label">Label</Label>
              <Input
                id="dimension-label"
                value={createForm.label}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    label: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimension-weight">Poids</Label>
              <Input
                id="dimension-weight"
                type="number"
                value={createForm.weight}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    weight: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimension-active">Actif</Label>
              <Button
                id="dimension-active"
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setCreateForm((prev) => ({
                    ...prev,
                    is_active: !prev.is_active,
                  }))
                }
              >
                {createForm.is_active ? "Actif" : "Inactif"}
              </Button>
            </div>
          </div>
          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setCreateOpen(false)}
            >
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier la dimension</DialogTitle>
            <DialogDescription>
              Ajustez le poids ou l&apos;activation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cle</Label>
              <Input value={editForm.key} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={editForm.label} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimension-edit-weight">Poids</Label>
              <Input
                id="dimension-edit-weight"
                type="number"
                value={editForm.weight}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    weight: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimension-edit-active">Actif</Label>
              <Button
                id="dimension-edit-active"
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setEditForm((prev) => ({
                    ...prev,
                    is_active: !prev.is_active,
                  }))
                }
              >
                {editForm.is_active ? "Actif" : "Inactif"}
              </Button>
            </div>
          </div>
          {editError ? (
            <p className="text-sm text-destructive">{editError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditTarget(null)}
            >
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
