"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface MrrChartProps {
  series: Array<{ monthLabel: string; mrrCents: number }>;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

export function MrrChart({ series }: MrrChartProps) {
  const data = series.map((s) => ({ month: s.monthLabel, eur: s.mrrCents / 100 }));

  const hasAny = series.some((s) => s.mrrCents > 0);
  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
        Noch keine MRR — Stripe-Daten kommen sobald Trials enden.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-3">
        MRR (letzte 6 Monate)
      </div>
      <div className="h-56 md:h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgb(20 21 49 / 0.08)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "rgb(20 21 49 / 0.5)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgb(20 21 49 / 0.5)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}€`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "rgb(20 21 49 / 0.1)" }}
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid rgb(20 21 49 / 0.1)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem"
              }}
              formatter={(value) => [eur(Number(value) * 100), "MRR"]}
              labelFormatter={(label) => String(label)}
            />
            <Line
              type="monotone"
              dataKey="eur"
              stroke="rgb(234 88 12)"
              strokeWidth={2}
              dot={{ r: 3, fill: "rgb(234 88 12)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
