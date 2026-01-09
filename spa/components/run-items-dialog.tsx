"use client";

import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type RunItemsDialogProps = {
  runId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RunItemsDialog({ runId, open, onOpenChange }: RunItemsDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reco-runs", runId, "items"],
    queryFn: () =>
      apiRequest<Array<Record<string, unknown>>>(
        endpoints.recoRuns.items(String(runId))
      ),
    enabled: Boolean(runId && open),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Items du run</DialogTitle>
        </DialogHeader>
        <Separator />
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState message="Impossible de charger les items." />
        ) : data && data.length ? (
          <div className="space-y-3">
            {data.map((item, index) => (
              <div
                key={`${runId}-${index}`}
                className="rounded-xl border bg-muted/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(item).map(([key, value]) => (
                    <Badge key={key} variant="outline">
                      {key}: {String(value)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Aucun item pour ce run." />
        )}
      </DialogContent>
    </Dialog>
  );
}
