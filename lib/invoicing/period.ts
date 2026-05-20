export interface BillingPeriod {
  year: number;
  month: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
}

export function lastBillingPeriod(now = new Date()): BillingPeriod {
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const startsAt = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
  const lastDay = new Date(y, m, 0).getDate();
  const endsAt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59Z`);
  return {
    year: y,
    month: m,
    label: startsAt.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    startsAt,
    endsAt
  };
}

export function billingPeriodFromString(period: string): BillingPeriod {
  // Format "YYYY-MM"
  const [y, m] = period.split("-").map(Number);
  const startsAt = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
  const lastDay = new Date(y, m, 0).getDate();
  const endsAt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59Z`);
  return {
    year: y,
    month: m,
    label: startsAt.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    startsAt,
    endsAt
  };
}
