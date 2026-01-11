import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiCardTone = "neutral" | "primary" | "success" | "warning" | "info";

type KpiCardProps = {
  label: string;
  value: string;
  helper?: string;
  delta?: number;
  tone?: KpiCardTone;
};

const toneStyles: Record<KpiCardTone, { card: string; label: string }> = {
  neutral: {
    card: "border-l-4 border-muted/40 bg-muted/30",
    label: "text-muted-foreground",
  },
  primary: {
    card: "border-l-4 border-primary/20 bg-primary/5",
    label: "text-primary/70",
  },
  success: {
    card: "border-l-4 border-emerald-400/30 bg-emerald-500/5",
    label: "text-emerald-700/80",
  },
  warning: {
    card: "border-l-4 border-amber-400/30 bg-amber-400/5",
    label: "text-amber-700/80",
  },
  info: {
    card: "border-l-4 border-sky-400/30 bg-sky-400/5",
    label: "text-sky-700/80",
  },
};

export function KpiCard({
  label,
  value,
  helper,
  delta,
  tone = "neutral",
}: KpiCardProps) {
  const isPositive = typeof delta === "number" ? delta >= 0 : null;
  const toneStyle = toneStyles[tone];

  return (
    <Card className={toneStyle.card}>
      <CardContent className="space-y-3 p-5">
        <div
          className={cn(
            "text-xs font-medium uppercase tracking-wide",
            toneStyle.label
          )}
        >
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
