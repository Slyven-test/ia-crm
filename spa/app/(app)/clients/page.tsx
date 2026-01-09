"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { DataTable } from "@/components/data-table";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type Client = {
  client_code: string;
  name?: string;
  email?: string;
  status?: string;
  segment?: string;
};

const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "client_code",
    header: "Code",
  },
  {
    accessorKey: "name",
    header: "Nom",
    cell: ({ row }) => row.original.name || "-",
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email || "-",
  },
  {
    accessorKey: "segment",
    header: "Segment",
    cell: ({ row }) => row.original.segment || "-",
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) =>
      row.original.status ? (
        <Badge variant="outline">{row.original.status}</Badge>
      ) : (
        "-"
      ),
  },
];

export default function ClientsPage() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiRequest<Client[]>(endpoints.clients.list),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Suivi des comptes, historique et recommandations."
      />
      {query.error ? (
        <ErrorState message="Impossible de charger la liste des clients." />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          isLoading={query.isLoading}
          filterPlaceholder="Rechercher par code, nom ou email..."
          emptyMessage="Aucun client disponible."
          onRowClick={(row) => router.push(`/clients/${row.client_code}`)}
        />
      )}
    </div>
  );
}
