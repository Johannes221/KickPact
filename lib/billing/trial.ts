import { desc, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema/seasons";
import { TRIAL_DAYS } from "@/lib/stripe/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Phase 3 / R5 — Trial-Ende mit Saisonstart-Schutz.
 *
 * Regulär endet der Trial `TRIAL_DAYS` (30) Tage nach `now`. Onboardet ein
 * Verein aber in der Sommerpause (z.B. 1.7.), läge der komplette Trial in
 * der spielfreien Zeit — er hätte nie ein Spiel gesehen. Deshalb:
 *
 *   trialEndsAt = max(now + 30d, seasonStart + 30d)
 *
 * `seasonStart` = `startsAt` der relevanten Saison: die seasons-Row mit dem
 * GRÖSSTEN `startsAt <= now + 70d`. Während der laufenden Saison ist das die
 * aktuelle Saison (startsAt in der Vergangenheit → now+30d gewinnt
 * automatisch); in der Sommerpause die kommende Saison, sobald ihre Row
 * existiert. Fehlt jede passende Row → Fallback now + 30d.
 *
 * Review N4 (2026-06-11): Horizont 70d statt 60d — deckt den GANZEN Juni ab.
 * Mit 60d bekam ein Onboarding am 1.6. (Saisonstart 1.8. = 61d entfernt) den
 * Kurz-Trial bis 1.7., das Onboarding am 2.6. aber den langen bis 31.8. —
 * eine 61-Tage-Klippe zwischen zwei Kalendertagen, mitten im
 * Saisonfinale-Onboarding-Fenster.
 */
export async function computeTrialEndsAt(now: Date): Promise<Date> {
  const base = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);

  const horizon = new Date(now.getTime() + 70 * DAY_MS);
  const [season] = await db
    .select({ startsAt: seasons.startsAt })
    .from(seasons)
    .where(lte(seasons.startsAt, horizon))
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  if (!season) return base;

  const inSeason = new Date(season.startsAt.getTime() + TRIAL_DAYS * DAY_MS);
  return inSeason.getTime() > base.getTime() ? inSeason : base;
}
