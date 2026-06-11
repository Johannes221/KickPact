"use client";

/**
 * 12-Monats-Balkendiagramm für die Sponsor-Bilanz-Page. Genau dieselbe
 * visuelle Sprache wie `FinanzenTrendChart` auf der Team-Finanzen-Page —
 * eigene Komponente, weil sie eigene Empty-State-Texte + Axis-Behandlung
 * für sehr lange Zeiträume (All-Time) braucht.
 */

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { eur } from "@/lib/utils/currency";

export interface BilanzMonthlyPoint {
  month: string; // "YYYY-MM"
  totalCents: number;
}

interface Props {
  data: BilanzMonthlyPoint[];
  title?: string;
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

export function BilanzMonthlyChart({ data, title = "Monatlicher Verlauf" }: Props) {
  if (data.length === 0 || data.every((d) => d.totalCents === 0)) {
    return (
      <div className="rounded-2xl bg-white shadow-ios-card p-8 text-center text-sm text-brand-night-navy/60">
        Noch keine Beiträge im gewählten Zeitraum.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    month: monthLabel(d.month),
    totalCents: d.totalCents
  }));

  return (
    <div className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70 mb-3">
        {title}
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#525252" }}
              axisLine={false}
              tickLine={false}
              interval={chartData.length > 18 ? "preserveStartEnd" : 0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#525252" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(Number(v) / 100)} €`}
            />
            <Tooltip
              cursor={{ fill: "rgba(1, 196, 87, 0.05)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12
              }}
              formatter={(value) => [eur(Number(value) || 0), "Beiträge"]}
            />
            <Bar dataKey="totalCents" fill="#01C457" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
