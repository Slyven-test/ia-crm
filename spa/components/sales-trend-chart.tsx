"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/format";

type SalesPoint = {
  period?: string;
  revenue?: number;
  label?: string;
  value?: number;
};

type SalesTrendChartProps = {
  data: SalesPoint[];
};

export default function SalesTrendChart({ data }: SalesTrendChartProps) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis
            dataKey={(point: SalesPoint) => point.label || point.period || ""}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
            labelFormatter={(label) => String(label)}
          />
          <Line
            type="monotone"
            dataKey={(point: SalesPoint) => point.value ?? point.revenue ?? 0}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
