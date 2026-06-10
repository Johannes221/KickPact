"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MonthBucket {
  monthLabel: string;
  totalCents: number;
}

interface Props {
  data: MonthBucket[];
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function FinanzenTrendChart({ data }: Props) {
  if (data.every((d) => d.totalCents === 0)) {
    return (
      <div className="rounded-2xl bg-white shadow-ios-card p-8 text-center text-sm text-brand-night-navy/60">
        Noch keine monatlichen Beiträge. Sobald die ersten Pacts ausgelöst werden,
        erscheint hier der Trend.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70 mb-3">
        Monatlicher Trend (12 Monate)
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: "#525252" }}
              axisLine={false}
              tickLine={false}
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
