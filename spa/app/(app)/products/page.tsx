"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type ProductRecord,
  createProduct,
  listProductsWithParams,
  normalizeApiError,
  updateProduct,
} from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/format";

type ProductFormState = {
  product_key: string;
  name: string;
  price_ttc: string;
  margin: string;
  season_tags: string;
  visibility: string;
  family_crm: string;
  sub_family: string;
  cepage: string;
  sucrosite_niveau: string;
  price_band: string;
  premium_tier: string;
  description: string;
  aroma_fruit: string;
  aroma_floral: string;
  aroma_spice: string;
  aroma_mineral: string;
  aroma_acidity: string;
  aroma_body: string;
  aroma_tannin: string;
};

const PAGE_SIZE = 20;

const createEmptyForm = (): ProductFormState => ({
  product_key: "",
  name: "",
  price_ttc: "",
  margin: "",
  season_tags: "",
  visibility: "tenant",
  family_crm: "",
  sub_family: "",
  cepage: "",
  sucrosite_niveau: "",
  price_band: "",
  premium_tier: "",
  description: "",
  aroma_fruit: "",
  aroma_floral: "",
  aroma_spice: "",
  aroma_mineral: "",
  aroma_acidity: "",
  aroma_body: "",
  aroma_tannin: "",
});

const formatValue = (value: string | number | null | undefined) =>
  value === null || typeof value === "undefined" || value === ""
    ? "-"
    : String(value);

const parseNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const buildPayload = (form: ProductFormState): ProductRecord => ({
  product_key: form.product_key.trim(),
  name: form.name.trim() || undefined,
  price_ttc: parseNumber(form.price_ttc),
  margin: parseNumber(form.margin),
  season_tags: form.season_tags.trim() || undefined,
  visibility: form.visibility.trim() || undefined,
  family_crm: form.family_crm.trim() || undefined,
  sub_family: form.sub_family.trim() || undefined,
  cepage: form.cepage.trim() || undefined,
  sucrosite_niveau: form.sucrosite_niveau.trim() || undefined,
  price_band: form.price_band.trim() || undefined,
  premium_tier: form.premium_tier.trim() || undefined,
  description: form.description.trim() || undefined,
  aroma_fruit: parseNumber(form.aroma_fruit),
  aroma_floral: parseNumber(form.aroma_floral),
  aroma_spice: parseNumber(form.aroma_spice),
  aroma_mineral: parseNumber(form.aroma_mineral),
  aroma_acidity: parseNumber(form.aroma_acidity),
  aroma_body: parseNumber(form.aroma_body),
  aroma_tannin: parseNumber(form.aroma_tannin),
});

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [offset, setOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductRecord | null>(null);
  const [formState, setFormState] = useState<ProductFormState>(createEmptyForm);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchValue(searchInput.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const productsQuery = useQuery({
    queryKey: ["products", searchValue, offset],
    queryFn: () =>
      listProductsWithParams({
        search: searchValue,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: (payload: ProductRecord) => createProduct(payload),
    onSuccess: () => {
      toast.success("Produit ajoute.");
      setDialogOpen(false);
      setFormState(createEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "Impossible de creer le produit."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ProductRecord) =>
      updateProduct(payload.product_key, payload),
    onSuccess: () => {
      toast.success("Produit mis a jour.");
      setDialogOpen(false);
      setEditTarget(null);
      setFormState(createEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      toast.error(
        normalizeApiError(error, "Impossible de mettre a jour le produit.")
      );
    },
  });

  const canSubmit =
    formState.product_key.trim().length > 0 &&
    formState.name.trim().length > 0 &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  const handleOpenCreate = () => {
    setEditTarget(null);
    setFormState(createEmptyForm());
    setDialogOpen(true);
  };

  const handleOpenEdit = (product: ProductRecord) => {
    setEditTarget(product);
    setFormState({
      product_key: product.product_key,
      name: product.name ?? "",
      price_ttc: product.price_ttc?.toString() ?? "",
      margin: product.margin?.toString() ?? "",
      season_tags: product.season_tags ?? "",
      visibility: product.visibility ?? "tenant",
      family_crm: product.family_crm ?? "",
      sub_family: product.sub_family ?? "",
      cepage: product.cepage ?? "",
      sucrosite_niveau: product.sucrosite_niveau ?? "",
      price_band: product.price_band ?? "",
      premium_tier: product.premium_tier ?? "",
      description: product.description ?? "",
      aroma_fruit: product.aroma_fruit?.toString() ?? "",
      aroma_floral: product.aroma_floral?.toString() ?? "",
      aroma_spice: product.aroma_spice?.toString() ?? "",
      aroma_mineral: product.aroma_mineral?.toString() ?? "",
      aroma_acidity: product.aroma_acidity?.toString() ?? "",
      aroma_body: product.aroma_body?.toString() ?? "",
      aroma_tannin: product.aroma_tannin?.toString() ?? "",
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

  const hasNextPage = products.length === PAGE_SIZE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits"
        description="Catalogue, prix et attributs produits."
        actions={<Button onClick={handleOpenCreate}>Ajouter un produit</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md flex-1">
          <Label htmlFor="products-search">Rechercher</Label>
          <Input
            id="products-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Rechercher par cle produit ou nom..."
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {productsQuery.isFetching && !productsQuery.isLoading
            ? "Mise a jour..."
            : `${products.length} resultat(s)`}
        </div>
      </div>

      {productsQuery.error ? (
        <ErrorState message="Impossible de charger la liste des produits." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cle</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Marge</TableHead>
                <TableHead>Saisons</TableHead>
                <TableHead>Visibilite</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={`loading-${index}`}>
                    <TableCell colSpan={7} className="py-6">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : products.length ? (
                products.map((product) => (
                  <TableRow key={product.product_key}>
                    <TableCell className="font-medium">
                      {product.product_key}
                    </TableCell>
                    <TableCell>{formatValue(product.name)}</TableCell>
                    <TableCell>
                      {typeof product.price_ttc === "number"
                        ? formatCurrency(product.price_ttc)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {typeof product.margin === "number"
                        ? formatNumber(product.margin)
                        : "-"}
                    </TableCell>
                    <TableCell>{formatValue(product.season_tags)}</TableCell>
                    <TableCell>{formatValue(product.visibility)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(product)}
                      >
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm">
                    Aucun produit disponible.
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
            disabled={offset === 0 || productsQuery.isLoading}
          >
            Precedent
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            disabled={!hasNextPage || productsQuery.isLoading}
          >
            Suivant
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Modifier le produit" : "Ajouter un produit"}
            </DialogTitle>
            <DialogDescription>
              Renseignez les informations principales et les attributs gustatifs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-key">Cle produit</Label>
              <Input
                id="product-key"
                value={formState.product_key}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    product_key: event.target.value,
                  }))
                }
                disabled={Boolean(editTarget)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-name">Nom</Label>
              <Input
                id="product-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-price">Prix</Label>
              <Input
                id="product-price"
                type="number"
                value={formState.price_ttc}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    price_ttc: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-margin">Marge</Label>
              <Input
                id="product-margin"
                type="number"
                value={formState.margin}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    margin: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-season">Saisons</Label>
              <Input
                id="product-season"
                value={formState.season_tags}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    season_tags: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-visibility">Visibilite</Label>
              <Input
                id="product-visibility"
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
              <Label htmlFor="product-family">Famille</Label>
              <Input
                id="product-family"
                value={formState.family_crm}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    family_crm: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-subfamily">Sous-famille</Label>
              <Input
                id="product-subfamily"
                value={formState.sub_family}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    sub_family: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-cepage">Cepage</Label>
              <Input
                id="product-cepage"
                value={formState.cepage}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    cepage: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-sweet">Sucrosite</Label>
              <Input
                id="product-sweet"
                value={formState.sucrosite_niveau}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    sucrosite_niveau: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-band">Price band</Label>
              <Input
                id="product-band"
                value={formState.price_band}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    price_band: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-tier">Premium tier</Label>
              <Input
                id="product-tier"
                value={formState.premium_tier}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    premium_tier: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="product-description">Description</Label>
              <Input
                id="product-description"
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-fruit">Arome fruit</Label>
              <Input
                id="aroma-fruit"
                type="number"
                value={formState.aroma_fruit}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_fruit: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-floral">Arome floral</Label>
              <Input
                id="aroma-floral"
                type="number"
                value={formState.aroma_floral}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_floral: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-spice">Arome epice</Label>
              <Input
                id="aroma-spice"
                type="number"
                value={formState.aroma_spice}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_spice: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-mineral">Arome mineral</Label>
              <Input
                id="aroma-mineral"
                type="number"
                value={formState.aroma_mineral}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_mineral: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-acidity">Acidite</Label>
              <Input
                id="aroma-acidity"
                type="number"
                value={formState.aroma_acidity}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_acidity: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-body">Corps</Label>
              <Input
                id="aroma-body"
                type="number"
                value={formState.aroma_body}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_body: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aroma-tannin">Tanins</Label>
              <Input
                id="aroma-tannin"
                type="number"
                value={formState.aroma_tannin}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    aroma_tannin: event.target.value,
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
