import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string;
  helper?: string;
  delta?: number;
};

export function KpiCard({ label, value, helper, delta }: KpiCardProps) {
  const isPositive = typeof delta === "number" ? delta >= 0 : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeof delta === "number" ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                isPositive
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600"
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          ) : null}
          {helper ? <span>{helper}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
