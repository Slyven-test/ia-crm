"use client";

import { type CellContext, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";

type ProductRow = Record<string, unknown>;
type ProductValue = ProductRow[keyof ProductRow];

const preferredKeys = ["product_key", "name", "category", "price", "stock"];

const formatHeaderLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatCellValue = (value: ProductValue) => {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return formatNumber(value);
  }

  if (typeof value === "string") {
    return value.trim() === "" ? "-" : value;
  }

  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  return JSON.stringify(value);
};

export default function ProductsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);

  const query = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<ProductRow[]>(endpoints.products.list),
  });

  const products = useMemo<ProductRow[]>(() => query.data ?? [], [query.data]);

  const columnKeys = useMemo(() => {
    const keys = new Set<string>();

    products.forEach((product) => {
      Object.keys(product).forEach((key) => keys.add(key));
    });

    const ordered = preferredKeys.filter((key) => keys.has(key));
    const remaining = Array.from(keys)
      .filter((key) => !preferredKeys.includes(key))
      .sort((left, right) => left.localeCompare(right, "fr"));

    return [...ordered, ...remaining];
  }, [products]);

  const handleViewDetails = useCallback((product: ProductRow) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<ProductRow, ProductValue>[]>(
    () => [
      ...columnKeys.map((key) => ({
        accessorKey: key,
        header: formatHeaderLabel(key),
        cell: (ctx: CellContext<ProductRow, ProductValue>) => {
          const value = ctx.getValue();
          return (
            <span className="text-sm text-foreground">
              {formatCellValue(value)}
            </span>
          );
        },
      })),
      {
        id: "actions",
        header: "Actions",
        cell: (ctx: CellContext<ProductRow, unknown>) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewDetails(ctx.row.original)}
          >
            Voir details
          </Button>
        ),
      },
    ],
    [columnKeys, handleViewDetails]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits"
        description="Catalogue et performance des produits."
        actions={
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            Rafraichir
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Catalogue produits</CardTitle>
        </CardHeader>
        <CardContent>
          {query.error ? (
            <ErrorState message="Impossible de charger les produits." />
          ) : columnKeys.length === 0 && !query.isLoading ? (
            <EmptyState title="Aucun produit disponible." />
          ) : (
            <DataTable
              columns={columns}
              data={products}
              isLoading={query.isLoading}
              emptyMessage="Aucun produit disponible."
            />
          )}
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Details du produit</DialogTitle>
            <DialogDescription>
              Donnees brutes du produit selectionne.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 text-xs text-foreground">
            {selectedProduct ? JSON.stringify(selectedProduct, null, 2) : "{}"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
