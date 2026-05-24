"use client";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import type { ClubMonthlyChargesPoint } from "@/lib/db/queries/club-dashboard";

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

export function RevenueChart({ points }: { points: ClubMonthlyChargesPoint[] }) {
  const data = points.map((p) => ({
    month: monthLabel(p.month),
    eur: p.cents / 100
  }));

  const hasAny = points.some((p) => p.cents > 0);
  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
        Noch keine Charges in den letzten 12 Monaten.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
      <div className="h-56 md:h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(20 21 49 / 0.08)" vertical={false} />
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
              width={40}
            />
            <Tooltip
              cursor={{ fill: "rgb(20 21 49 / 0.04)" }}
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid rgb(20 21 49 / 0.1)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem"
              }}
              formatter={(value) => [eur(Number(value) * 100), "Charges"]}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="eur" fill="rgb(234 88 12)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
