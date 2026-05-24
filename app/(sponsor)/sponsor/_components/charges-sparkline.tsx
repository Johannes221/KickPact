"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlySparklinePoint } from "@/lib/db/queries/sponsor-dashboard";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short" });
}

export function ChargesSparkline({ points }: { points: MonthlySparklinePoint[] }) {
  const data = points.map((p) => ({
    month: monthLabel(p.month),
    eur: p.cents / 100
  }));

  // Wenn alle Werte 0 sind, zeige leere-state-Hinweis statt langweiliger Linie auf 0
  const hasAny = points.some((p) => p.cents > 0);
  if (!hasAny) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-brand-night-navy/50">
        Noch keine Charges in den letzten {points.length} Monaten.
      </div>
    );
  }

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "rgb(20 21 49 / 0.5)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: "rgb(20 21 49 / 0.1)" }}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid rgb(20 21 49 / 0.1)",
              borderRadius: "0.5rem",
              fontSize: "0.75rem"
            }}
            formatter={(value) => [eur(Number(value) * 100), "Charges"]}
            labelFormatter={(label) => String(label)}
          />
          <Line
            type="monotone"
            dataKey="eur"
            stroke="rgb(234 88 12)"
            strokeWidth={2}
            dot={{ fill: "rgb(234 88 12)", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
