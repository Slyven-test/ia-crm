"use client";

import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
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

type Product = {
  product_key: string;
  name?: string;
  category?: string;
  price?: number;
  stock?: number;
};

export default function ProductsPage() {
  const query = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<Product[]>(endpoints.products.list),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Produits" description="Catalogue et performance des produits." />
      {query.error ? (
        <ErrorState message="Impossible de charger les produits." />
      ) : query.isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Chargement des produits...
        </div>
      ) : query.data && query.data.length ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cle</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((product) => (
                <TableRow key={product.product_key}>
                  <TableCell>{product.product_key}</TableCell>
                  <TableCell>{product.name || "-"}</TableCell>
                  <TableCell>{product.category || "-"}</TableCell>
                  <TableCell>{formatNumber(product.price ?? 0)}</TableCell>
                  <TableCell>{formatNumber(product.stock ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="Aucun produit disponible." />
      )}
    </div>
  );
}
