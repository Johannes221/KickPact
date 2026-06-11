export interface BillingPeriod {
  year: number;
  month: number;
  label: string;
  startsAt: Date;
  /**
   * EXKLUSIVES Perioden-Ende = Beginn des Folgemonats (Audit 2026-06-11 / B8).
   * Vorher inklusiv `lastDay 23:59:59` — eine Charge mit confirmedAt
   * 23:59:59.500 fiel in keine Periode und wurde nie fakturiert.
   * Konsumenten müssen mit `< endsAt` vergleichen (lt, nicht lte).
   * UTC-Anker bleibt (dokumentierte Vereinfachung).
   */
  endsAt: Date;
}

function buildPeriod(year: number, month: number): BillingPeriod {
  const startsAt = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endsAt = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return {
    year,
    month,
    label: startsAt.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }),
    startsAt,
    endsAt
  };
}

export function lastBillingPeriod(now = new Date()): BillingPeriod {
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return buildPeriod(y, m);
}

export function billingPeriodFromString(period: string): BillingPeriod {
  // Format "YYYY-MM"
  const [y, m] = period.split("-").map(Number);
  return buildPeriod(y, m);
}
