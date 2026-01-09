"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RunItemsDialog } from "@/components/run-items-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";

type RecoRun = {
  id?: string | number;
  run_id?: string | number;
  created_at?: string;
  status?: string;
  total_items?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export default function RunsPage() {
  const [selectedRun, setSelectedRun] = useState<string | number | null>(null);
  const query = useQuery({
    queryKey: ["reco-runs"],
    queryFn: () => apiRequest<RecoRun[]>(endpoints.recoRuns.list),
  });

  const rows = useMemo(
    () =>
      (query.data ?? []).map((run) => ({
        id: run.id ?? run.run_id ?? "",
        createdAt: run.created_at,
        status: run.status,
        totalItems: run.total_items,
      })),
    [query.data]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Runs" description="Suivi des executions de recommandations." />
      {query.error ? (
        <ErrorState message="Impossible de charger les runs." />
      ) : query.isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Chargement des runs...
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Exports</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((run) => (
                  <TableRow key={String(run.id)}>
                    <TableCell>{run.id}</TableCell>
                    <TableCell>{formatDate(run.createdAt)}</TableCell>
                    <TableCell>
                      {run.status ? (
                        <Badge variant="outline">{run.status}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{run.totalItems ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="text-xs text-primary underline"
                          href={`${API_BASE}${endpoints.export.runs(run.id, "csv")}`}
                        >
                          CSV
                        </a>
                        <a
                          className="text-xs text-primary underline"
                          href={`${API_BASE}${endpoints.export.runs(run.id, "json")}`}
                        >
                          JSON
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRun(run.id)}
                      >
                        Voir items
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Aucun run disponible.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <RunItemsDialog
        runId={selectedRun}
        open={Boolean(selectedRun)}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
      />
    </div>
  );
}
