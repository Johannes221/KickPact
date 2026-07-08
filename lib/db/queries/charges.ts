import { and, eq, gte, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  matches,
  teams,
  eventApprovals,
  sponsors,
  users,
  invoices,
  clubs
} from "@/lib/db/schema";
import { isNull, isNotNull } from "drizzle-orm";

/**
 * SECURITY (H5): Sponsor-Kontakt + Eckdaten zu einer Charge (club-gescoped),
 * für die Storno-Benachrichtigung. Liefert null, wenn die Charge nicht zum
 * Club gehört.
 */
export async function getChargeSponsorContactForClub(
  chargeId: string,
  clubId: string
): Promise<{ sponsorEmail: string | null; amountCents: number; triggerType: string } | null> {
  const [row] = await db
    .select({
      sponsorEmail: users.email,
      amountCents: charges.amountCents,
      triggerType: charges.triggerType
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(and(eq(charges.id, chargeId), eq(teams.clubId, clubId)))
    .limit(1);
  return row ?? null;
}

export interface ChargeForBilling {
  chargeId: string;
  sponsorId: string;
  clubId: string;
  triggerType: string;
  amountCents: number;
  /** Saison-Code ("2526" / "2025/26") — gesetzt bei Saison-Charges (matchId=null). */
  saison: string | null;
  confirmedAt: Date | string | null;
  /** null bei Saison-Charges — die hängen an keiner Partie. */
  matchDate: Date | string | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
}

/**
 * Listet alle `confirmed` charges deren `confirmedAt` im angegebenen Zeitraum liegt.
 * Wird vom monatlichen Invoicing-Cron genutzt um pro (sponsor, club) eine Rechnung
 * zu erzeugen.
 *
 * Saison-Charges (evaluate-season) haben matchId=null — deshalb leftJoin auf
 * matches und der Team/Club-Scope über pledges.teamId statt matches.teamId
 * (vorher fielen Saison-Charges durch den innerJoin für immer aus jeder Rechnung).
 *
 * Paket A.3 (Spec 2026-05-26 §1.2) — Billing-Cycle-Filter:
 *  - snapshot='monthly' → normal monatlich fakturieren (Bestand, Default),
 *    gefenstert auf die Abrechnungs-Periode.
 *  - snapshot='season_end' nur, wenn der Sponsor AKTUELL 'monthly' ist
 *    (Spec-Wechsel-Regel „season_end→monthly: bisher gesammelte Charges
 *    werden mit der ersten Monatsrechnung beglichen"). Review K1
 *    (2026-06-12): dieser Zweig hat bewusst KEINE untere Fenstergrenze —
 *    Gesammeltes kann Monate alt sein (Okt-Charge, Wechsel im Mai). Mit
 *    unterer Grenze strandeten alle Charges, die älter als die laufende
 *    Periode waren, für immer (kein Cron hätte sie je selektiert).
 *    Steht der Sponsor weiter auf season_end, sammeln sich die Charges bis
 *    zum Saisonende-Rechnungslauf (generate-season-end-invoices).
 *
 * Review M2 (2026-06-12): `clubId` ist der BILLING-Club
 * (licensedUnderClubId ?? clubId) — Gruppierung, Rechnungs-Zuordnung und
 * Branding laufen einheitlich über den Absender-Verein. Sonst mischte eine
 * (sponsor, container)-Gruppe Teams mit unterschiedlichem Lizenz-Status und
 * das Branding der ganzen Rechnung hing an der Zeilen-Reihenfolge.
 */
const billingClubIdExpr = sql<string>`COALESCE(${teams.licensedUnderClubId}, ${teams.clubId})`;

export async function listConfirmedChargesByPeriod(opts: {
  periodStart: Date;
  periodEnd: Date;
}): Promise<ChargeForBilling[]> {
  const rows = await db
    .select({
      chargeId: charges.id,
      sponsorId: pledges.sponsorId,
      clubId: billingClubIdExpr,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      saison: charges.saison,
      confirmedAt: charges.confirmedAt,
      matchDate: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(charges.status, "confirmed"),
        or(
          and(
            eq(charges.billingCycleSnapshot, "monthly"),
            gte(charges.confirmedAt, opts.periodStart),
            // B8 (Audit 2026-06-11): periodEnd ist EXKLUSIV (Beginn Folgemonat).
            lt(charges.confirmedAt, opts.periodEnd)
          ),
          // K1: Gesammeltes ohne untere Fenstergrenze (siehe JSDoc).
          and(
            eq(charges.billingCycleSnapshot, "season_end"),
            eq(sponsors.billingCycle, "monthly"),
            lt(charges.confirmedAt, opts.periodEnd)
          )
        )
      )
    );
  return rows;
}

/**
 * Paket A.4 (Spec 2026-05-26 §1.2) — Selektion für den Saisonende-Rechnungslauf:
 * alle `confirmed` (= noch nicht fakturierten) Charges mit
 * snapshot='season_end', deren Sponsor AKTUELL auf season_end steht und deren
 * Abrechnungs-Zeitpunkt `COALESCE(confirmedAt, createdAt)` im Saison-Fenster
 * [1.7. Vorjahr, 1.7.) liegt. Sponsoren, die zurück auf monthly gewechselt
 * haben, fallen bewusst raus — deren Gesammeltes holt die erste
 * Monatsrechnung ab (listConfirmedChargesByPeriod).
 */
export async function listSeasonEndChargesForWindow(opts: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<ChargeForBilling[]> {
  const rows = await db
    .select({
      chargeId: charges.id,
      sponsorId: pledges.sponsorId,
      clubId: billingClubIdExpr,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      saison: charges.saison,
      confirmedAt: charges.confirmedAt,
      matchDate: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(charges.status, "confirmed"),
        eq(charges.billingCycleSnapshot, "season_end"),
        eq(sponsors.billingCycle, "season_end"),
        // Datum als ISO-String binden: COALESCE(...) ist ein rohes SQL-Fragment
        // ohne Spalten-Typ (vgl. getMonthlyChargedCents in evaluation.ts).
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${opts.windowStart.toISOString()}`,
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) < ${opts.windowEnd.toISOString()}`
      )
    );
  return rows;
}

/**
 * B6 (Audit 2026-06-11): Charges, die bereits auf einer 'draft'-Rechnung der
 * Periode hängen. Ein Draft entsteht, wenn der Rechnungslauf die Invoice
 * anlegte, der Mail-Versand aber fehlschlug — die Charges sind dann schon
 * 'invoiced' und fallen aus `listConfirmedChargesByPeriod` heraus. Ein
 * Re-Run muss diese Gruppen trotzdem sehen, um Versand + sent-Markierung
 * nachzuholen (Draft-Recovery in generate-invoices).
 */
export async function listChargesOfDraftInvoices(
  period: string
): Promise<ChargeForBilling[]> {
  return db
    .select({
      chargeId: charges.id,
      sponsorId: pledges.sponsorId,
      clubId: billingClubIdExpr,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      saison: charges.saison,
      confirmedAt: charges.confirmedAt,
      matchDate: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(invoices, eq(charges.invoiceId, invoices.id))
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(invoices.status, "draft"),
        eq(invoices.period, period),
        isNull(invoices.reversalOfInvoiceId)
      )
    );
}

/**
 * Groupiert charges nach (sponsorId, clubId) — eine Rechnung pro Paar.
 */
export function groupChargesBySponsorClub<T extends { sponsorId: string; clubId: string }>(
  rows: T[]
): { sponsorId: string; clubId: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = `${r.sponsorId}|${r.clubId}`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()].map(([key, items]) => {
    const [sponsorId, clubId] = key.split("|");
    return { sponsorId, clubId, items };
  });
}

/**
 * Markiert alle nicht-invoiced charges für ein Match als `cancelled`.
 *
 * Wird vom Match-Update-Path im Crawler aufgerufen wenn fussball.de Daten
 * für ein bereits gescraptes Spiel ändert (z.B. Korrektur des Ergebnisses,
 * nachgetragene Tore). Vor der Re-Evaluation müssen alle vorherigen Charges
 * unschädlich gemacht werden, damit `evaluate-match` neu zählen kann.
 *
 * `invoiced` Charges werden weiterhin NICHT storniert — sie wurden bereits
 * dem Sponsor in Rechnung gestellt, ein stilles Cancel wäre Buchhaltung, nicht
 * Crawler-Logik. ABER (Daten-Integrität 2026-07-07): Sie dürfen auch nicht
 * mehr geräuschlos liegen bleiben. Wird ein bereits fakturiertes Ergebnis
 * offiziell gekippt (Einspruch/Wertung/Annullierung), hätte der Sponsor sonst
 * für nicht mehr existierende Ereignisse gezahlt, ohne dass es jemand bemerkt.
 * Deshalb werden betroffene `invoiced`-Charges für die Admin-Review-Queue
 * markiert (`correctionFlaggedAt`); ein Operator entscheidet dort über eine
 * Teil-Gutschrift (siehe listChargesPendingCorrection / createCorrectionInvoice).
 */
export async function invalidateChargesForMatch(
  matchId: string,
  reason: string
): Promise<void> {
  // Audit 2026-05-24 Task 2.3: Approvals MÜSSEN auch expired werden, sonst
  // kann der Sponsor einen cancelled Charge via "Bestätigen" wiederbeleben
  // (siehe approvals.confirmApproval). Atomar in einer Transaction.
  await db.transaction(async (tx) => {
    const affectedCharges = await tx
      .select({ matchEventId: charges.matchEventId })
      .from(charges)
      .where(and(eq(charges.matchId, matchId), ne(charges.status, "invoiced")));

    await tx
      .update(charges)
      .set({ status: "cancelled", cancelledReason: reason, cancelledAt: new Date() })
      .where(and(eq(charges.matchId, matchId), ne(charges.status, "invoiced")));

    // Daten-Integrität (2026-07-07): bereits fakturierte Charges dieses Spiels
    // für die Admin-Review-Queue markieren. Der Aufrufer ruft diese Funktion
    // nur bei echtem Hash-Drift (crawl-matches.ts) — das Spiel hat sich also
    // tatsächlich geändert, jede invoiced-Charge darauf ist jetzt verdächtig.
    // Status bleibt `invoiced` (nicht stornieren); nur das Flag wird gesetzt.
    await tx
      .update(charges)
      .set({ correctionFlaggedAt: new Date() })
      .where(and(eq(charges.matchId, matchId), eq(charges.status, "invoiced")));

    const eventIds = affectedCharges
      .map((c) => c.matchEventId)
      .filter((id): id is string => id !== null);
    if (eventIds.length > 0) {
      await tx
        .update(eventApprovals)
        .set({ status: "expired", respondedAt: new Date() })
        .where(
          and(
            inArray(eventApprovals.matchEventId, eventIds),
            eq(eventApprovals.status, "pending")
          )
        );
    }
  });
}

/**
 * Charge-Anzahl je Status für EIN Match. Für den team-id-Backfill-Audit: er
 * bestimmt vor der Remediation (invalidateChargesForMatch), wie viele falsche
 * Charges storniert (non-invoiced) bzw. für die Korrektur-Queue markiert
 * (invoiced) werden — ohne die Remediation selbst zu duplizieren.
 */
export async function getMatchChargeStatusCounts(
  matchId: string
): Promise<{ pending_approval: number; confirmed: number; invoiced: number; cancelled: number }> {
  const rows = await db
    .select({ status: charges.status, n: sql<number>`count(*)::int` })
    .from(charges)
    .where(eq(charges.matchId, matchId))
    .groupBy(charges.status);
  const out = { pending_approval: 0, confirmed: 0, invoiced: 0, cancelled: 0 };
  for (const r of rows) out[r.status as keyof typeof out] = r.n;
  return out;
}

/**
 * Daten-Integrität (2026-07-07): Admin-Review-Queue für bereits fakturierte
 * Charges, deren Spiel nachträglich auf fussball.de korrigiert wurde
 * (correctionFlaggedAt gesetzt, Status noch `invoiced` = weder gutgeschrieben
 * noch verworfen). Flach pro Charge inkl. Rechnungs-, Sponsor-, Club- und
 * (korrigiertem) Spiel-Kontext; die Admin-Seite gruppiert nach Rechnung.
 */
export interface PendingCorrectionRow {
  chargeId: string;
  amountCents: number;
  triggerType: string;
  goalIndex: number;
  correctionFlaggedAt: Date | string | null;
  invoiceId: string;
  invoicePeriod: string;
  invoiceStatus: string;
  invoicePdfUrl: string | null;
  sponsorId: string;
  sponsorName: string;
  sponsorEmail: string | null;
  clubId: string;
  clubName: string;
  matchId: string | null;
  matchDate: Date | string | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
}

export async function listChargesPendingCorrection(): Promise<PendingCorrectionRow[]> {
  return db
    .select({
      chargeId: charges.id,
      amountCents: charges.amountCents,
      triggerType: charges.triggerType,
      goalIndex: charges.goalIndex,
      correctionFlaggedAt: charges.correctionFlaggedAt,
      invoiceId: invoices.id,
      invoicePeriod: invoices.period,
      invoiceStatus: invoices.status,
      invoicePdfUrl: invoices.pdfUrl,
      sponsorId: sponsors.id,
      sponsorName: sponsors.displayName,
      sponsorEmail: users.email,
      clubId: clubs.id,
      clubName: clubs.name,
      matchId: charges.matchId,
      matchDate: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(invoices, eq(charges.invoiceId, invoices.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(and(eq(charges.status, "invoiced"), isNotNull(charges.correctionFlaggedAt)))
    .orderBy(clubs.name, invoices.id, charges.correctionFlaggedAt);
}

/** Anzahl offener Korrektur-Fälle (für das Admin-Nav-Badge). */
export async function countChargesPendingCorrection(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(charges)
    .where(and(eq(charges.status, "invoiced"), isNotNull(charges.correctionFlaggedAt)));
  return row?.count ?? 0;
}

/**
 * Verwirft die Korrektur-Markierung (Operator hat entschieden: Scrape-Flake,
 * keine Gutschrift). Nur noch offene (`invoiced` + geflaggte) Charges werden
 * angefasst — bereits per Gutschrift stornierte bleiben unberührt.
 * Gibt die Anzahl tatsächlich zurückgesetzter Charges zurück.
 */
export async function dismissChargeCorrections(chargeIds: string[]): Promise<number> {
  if (chargeIds.length === 0) return 0;
  const res = await db
    .update(charges)
    .set({ correctionFlaggedAt: null })
    .where(
      and(
        inArray(charges.id, chargeIds),
        eq(charges.status, "invoiced"),
        isNotNull(charges.correctionFlaggedAt)
      )
    )
    .returning({ id: charges.id });
  return res.length;
}

/**
 * Cancel a single charge by club admin/trainer.
 *
 * Rules:
 *  - Only `confirmed` or `pending_approval` charges can be cancelled.
 *    `invoiced` charges have already been billed — touching them is accounting,
 *    not an ops action.
 *  - The charge must belong to the given club (via pledge → team → club).
 *
 * Returns `true` when cancelled, `false` when the charge was not found,
 * already in a terminal state, or doesn't belong to the club.
 */
export async function cancelChargeForClub(
  chargeId: string,
  clubId: string,
  reason: string,
  cancelledByUserId?: string | null
): Promise<boolean> {
  const result = await db
    .update(charges)
    .set({
      status: "cancelled",
      cancelledReason: reason,
      // SECURITY (H5): Actor + Zeitpunkt für den Audit-Trail festhalten.
      cancelledByUserId: cancelledByUserId ?? null,
      cancelledAt: new Date()
    })
    .where(
      and(
        eq(charges.id, chargeId),
        notInArray(charges.status, ["cancelled", "invoiced"]),
        // Tenant check: charge.pledgeId → pledges.teamId → teams.clubId
        inArray(
          charges.pledgeId,
          db
            .select({ id: pledges.id })
            .from(pledges)
            .innerJoin(teams, eq(pledges.teamId, teams.id))
            .where(eq(teams.clubId, clubId))
        )
      )
    )
    .returning({ id: charges.id });
  return result.length > 0;
}
