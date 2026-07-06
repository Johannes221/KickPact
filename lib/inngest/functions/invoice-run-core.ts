import { eq, inArray, and, isNull } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import type { GetStepTools, Logger } from "inngest";
import type { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  invoices,
  invoiceItems,
  charges,
  sponsors,
  clubs,
  clubMemberships,
  users,
  teams,
  teamLicenses
} from "@/lib/db/schema";
import { highestPlanFrom } from "@/lib/mail/reply-to-pure";
import type { PlanKey } from "@/lib/stripe/pricing";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { getReplyToForClub } from "@/lib/mail/reply-to";
import { invoiceSponsorEmail } from "@/lib/mail/templates/invoice-sponsor";
import { invoiceSponsorSeasonEmail } from "@/lib/mail/templates/invoice-sponsor-season";
import { invoiceClubEmail } from "@/lib/mail/templates/invoice-club";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";
import { storePdf } from "@/lib/invoicing/storage";
import { InvoicePdf } from "@/lib/invoicing/builder";
import { renderGirocodeDataUrl } from "@/lib/invoicing/girocode";
import type { ChargeForBilling } from "@/lib/db/queries/charges";
import { triggerLabel } from "@/lib/triggers/labels";
import { formatSaisonLabel } from "@/lib/utils/saison";
import { maskEmail } from "@/lib/utils/log-pii";
import { notifyUsers } from "@/lib/notifications/deliver";
import { eur } from "@/lib/utils/currency";

/**
 * Geteilter Kern des Rechnungslaufs (Paket A.4): EINE Rechnung pro
 * (Sponsor, Club) inkl. Nummernkreis, PDF, Withhold-Gate, Draft-Recovery
 * und Mail-Versand. Wird vom Monats-Cron (`generate-invoices`) und vom
 * Saisonende-Cron (`generate-season-end-invoices`) mit unterschiedlicher
 * Periode/Mail-Variante aufgerufen — Verhalten ist 1:1 der bisherige
 * Monats-Lauf, nur Periode/Label/Mail sind Parameter.
 */

/**
 * Lesbare Labels für Trigger-Typen — landen auf der PDF + in der DB-Description.
 * Sollten konsistent mit lib/triggers/labels.ts sein, falls dort eine Master-Liste existiert.
 */
const TRIGGER_LABELS: Record<string, string> = {
  goal_total: "pro Tor",
  goal_by_player: "Tor von Spieler",
  win: "pro Sieg",
  home_win: "pro Heimsieg",
  away_win: "pro Auswärtssieg",
  comeback_win: "pro Comeback",
  hattrick: "pro Hattrick",
  clean_sheet: "pro Zu-Null",
  special_goal: "Spezial-Tor",
  goals_scored_min: "viele Tore (Mindestanzahl)",
  goal_diff_min: "hoher Sieg",
  // Manual trigger types
  yellow_card: "Gelbe Karte",
  red_card: "Rote Karte",
  assist: "Assist",
  man_of_match: "Spieler des Spiels",
  custom: "Custom-Event"
};

/**
 * Rechnungszeilen-Sicht auf eine Charge. Saison-Charges (matchDate=null) haben
 * keine Partie — als Zeilen-Datum dient confirmedAt, als Kontext-Label die
 * Saison (z.B. "Saison 2025/26 · Aufstieg").
 */
export function billingItemView(it: ChargeForBilling): {
  date: Date;
  contextLabel: string;
  triggerText: string;
  description: string;
} {
  const triggerText = TRIGGER_LABELS[it.triggerType] ?? triggerLabel(it.triggerType);
  if (it.matchDate == null) {
    const date = it.confirmedAt ? new Date(it.confirmedAt) : new Date();
    const contextLabel = formatSaisonLabel(it.saison);
    return {
      date,
      contextLabel,
      triggerText,
      description: `${contextLabel} · ${triggerText}`
    };
  }
  const date = new Date(it.matchDate);
  return {
    date,
    contextLabel: `${it.heimName} ${it.ergebnisHeim ?? "—"}:${it.ergebnisGast ?? "—"} ${it.gastName}`,
    triggerText,
    description: `${date.toLocaleDateString("de-DE")} · ${it.heimName} vs ${it.gastName} · ${triggerText}`
  };
}

export interface InvoiceGroup {
  sponsorId: string;
  clubId: string;
  items: ChargeForBilling[];
}

export interface InvoiceRunResult {
  invoicesCreated: number;
  mailsSent: number;
  failures: { sponsorId: string; clubId: string; error: string }[];
}

export async function runInvoiceGroups(opts: {
  grouped: InvoiceGroup[];
  /** invoices.period-Wert, z.B. "2026-05" (Monat) oder "2025/26" (Saison). */
  periodStr: string;
  /** Menschlich lesbares Label für PDF + Mails, z.B. "Mai 2026" / "Saison 2025/26". */
  periodLabel: string;
  /** Jahr für den Rechnungsnummern-Kreis (nextInvoiceNumber). */
  invoiceYear: number;
  /** Steuert die Sponsor-Mail-Variante (Monats- vs. Saisonende-Copy). */
  mailKind: "monthly" | "season_end";
  step: GetStepTools<typeof inngest>;
  logger: Logger;
}): Promise<InvoiceRunResult> {
  const { grouped, periodStr, periodLabel, invoiceYear, mailKind, step, logger } =
    opts;
  // Step-IDs dürfen keinen "/" enthalten (Saison-Periode "2025/26") — für die
  // Monats-Periode "YYYY-MM" ist das Replace ein No-Op, bestehende Step-IDs
  // laufender Runs bleiben also identisch.
  const periodStepId = periodStr.replace(/\//g, "-");

  let invoicesCreated = 0;
  let mailsSent = 0;
  const failures: { sponsorId: string; clubId: string; error: string }[] = [];

  for (const group of grouped) {
    // Audit 2026-05-24 Phase 2 / Task 2.2: Mail-Send aus DB-Step rausgezogen.
    // Vorher war alles (DB-insert + PDF + 2 Mails) in einem step.run, bei
    // Inngest-Retry → doppelte Mail an Sponsor + Verein. Jetzt:
    //   Step A: create-invoice — DB + PDF + R2-Store (idempotent durch UNIQUE)
    //   Step B: mail-sponsor — Mail an Sponsor (deterministische step-id)
    //   Step C: mail-admins  — Mail an Club-Admins (deterministische step-id)
    // Retry triggert dann nur den fehlgeschlagenen Step erneut.
    const stepId = `invoice-${group.sponsorId}-${group.clubId}-${periodStepId}`;
    // B6 (Audit 2026-06-11): Nur der CREATE-Step ist group-isoliert
    // (try/catch → failures). Die Mail-Steps danach werfen bewusst aus dem
    // Handler heraus — Inngest retried dann die Function und memoisierte
    // Steps (create, bereits erfolgreiche Mails) werden übersprungen.
    // Vorher verschluckte das per-Group-catch den Mail-Fehler → kein Retry,
    // Rechnung stand auf 'sent', Sponsor bekam nie eine Mail.
    const result = await (async () => {
      try {
        return await step.run(stepId, async () => {
        // Load sponsor + user + club for billing details
        const [spRow] = await db
          .select({ sponsor: sponsors, user: users })
          .from(sponsors)
          .innerJoin(users, eq(sponsors.userId, users.id))
          .where(eq(sponsors.id, group.sponsorId))
          .limit(1);
        const [cl] = await db
          .select()
          .from(clubs)
          .where(eq(clubs.id, group.clubId))
          .limit(1);
        if (!spRow || !cl) {
          return { skipped: true, reason: "sponsor-or-club-missing" } as const;
        }

        // Paket B (Spec §1.5) + Review M1/M2 (2026-06-12): `group.clubId` ist
        // bereits der BILLING-Club (licensedUnderClubId ?? clubId — aufgelöst
        // in den Charge-Selektoren, lib/db/queries/charges.ts). Damit laufen
        // Gruppierung, Branding, Withhold-Gate, Nummernkreis UND die
        // invoices.clubId-Zuordnung einheitlich über den Absender-Verein:
        // das Verifizierungs-Release (releaseWithheldInvoicesForClub) und die
        // Abrechnungs-Seite des Vereins finden die Rechnung, und gemischte
        // Gruppen (Container mit teil-transferierten Teams) sind unmöglich.
        const billingClub = cl;

        const invoiceNumber = await nextInvoiceNumber(billingClub.id, invoiceYear);

        // Pricing v2: höchstes Tier aller Teams des Absender-Clubs → PDF-Footer.
        const planRows = await db
          .select({ plan: teamLicenses.plan })
          .from(teamLicenses)
          .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
          .where(eq(teams.clubId, billingClub.id));
        const clubPlan: PlanKey =
          planRows.length > 0
            ? highestPlanFrom(planRows.map((r) => r.plan as PlanKey))
            : "basic";

        // Privatpersonen-only (Spec 2026-07-06 §4): Zahlbetrag = Summe der
        // zugesagten Beiträge, KEIN USt-Aufschlag mehr. Beiträge von
        // Privatpersonen ohne Gegenleistung sind kein Leistungsaustausch —
        // das Dokument ist eine Zahlungsübersicht, keine Rechnung.
        const total = group.items.reduce((s, i) => s + i.amountCents, 0);

        // Render PDF to Buffer (Node-side, react-pdf)
        const clubAddress = (billingClub.addressJson as {
          street?: string;
          zip?: string;
          city?: string;
          country?: string;
        } | null) ?? { street: "", zip: "", city: "" };

        // Pre-render Girocode (EPC069-12) data-URL so the synchronous
        // react-pdf <Image> can embed it. Returns null when IBAN missing
        // → builder simply omits the QR side of the pay-box.
        const girocodeDataUrl = await renderGirocodeDataUrl({
          beneficiaryName: billingClub.name,
          iban: billingClub.iban ?? null,
          amountCents: total,
          remittance: invoiceNumber
        });

        const pdfBuf = await renderToBuffer(
          InvoicePdf({
            data: {
              invoiceNumber,
              period: periodLabel,
              issuedAt: new Date(),
              plan: clubPlan,
              girocodeDataUrl,
              club: {
                name: billingClub.name,
                address: {
                  street: clubAddress.street ?? "",
                  zip: clubAddress.zip ?? "",
                  city: clubAddress.city ?? "",
                  country: clubAddress.country
                },
                iban: billingClub.iban ?? null,
                // Spec §1.9 (Paket C): Zusatz-Zahlwege auf der PDF —
                // konditional, Girocode bleibt Default.
                paypalHandle: billingClub.paypalHandle ?? null,
                stripePaymentLink: billingClub.stripePaymentLink ?? null
              },
              sponsor: {
                displayName: spRow.sponsor.displayName,
                email: spRow.user.email
              },
              items: group.items.map((it) => {
                const view = billingItemView(it);
                return {
                  matchDate: view.date,
                  matchLabel: view.contextLabel,
                  triggerLabel: view.triggerText,
                  amountCents: it.amountCents
                };
              })
            }
          })
        );

        const storageUrl = await storePdf(`${cl.id}/${invoiceNumber}.pdf`, pdfBuf);

        // Phase E1 + Spec 2026-05-29 §3.2 Withhold-Gate:
        //   `clubs.verifiedAt` ist das einzige Verifizierungs-Gate. Ist der
        //   ABSENDER-Verein (billingClub: licensedUnder ?? Container) nicht
        //   verifiziert → Rechnung + PDF werden erstellt, aber
        //   status='withheld'. Bei Club-Approval wird re-evaluiert.
        //   (Das frühere team-level Gate `teams.verifiedAt` ist deaktiviert.)
        const verified = billingClub.verifiedAt !== null;

        // B6 (Audit 2026-06-11): Invoice startet als 'draft' — 'sent' wird
        // erst NACH erfolgreichem Mail-Versand gesetzt (mark-sent-Step
        // unten). Vorher stand die Rechnung sofort auf 'sent', auch wenn
        // die Mail nie rausging.
        const inserted = await db.transaction(async (tx) => {
          const [inv] = await tx
            .insert(invoices)
            .values({
              sponsorId: spRow.sponsor.id,
              // M1/N5: Rechnung gehört dem BILLING-Club (= cl, s.o.) — Gate,
              // Release, Abrechnungs-Seite und Push-Link sind damit konsistent.
              clubId: billingClub.id,
              period: periodStr,
              totalCents: total,
              pdfUrl: storageUrl,
              status: verified ? "draft" : "withheld",
              sentAt: null
            })
            .onConflictDoNothing()
            .returning();

          if (!inv) return null; // duplicate by UNIQUE constraint

          await tx.insert(invoiceItems).values(
            group.items.map((it) => ({
              invoiceId: inv.id,
              chargeId: it.chargeId,
              description: billingItemView(it).description,
              amountCents: it.amountCents
            }))
          );

          const chargeIds = group.items.map((i) => i.chargeId);
          // Review N2 (2026-06-12): status-Guard — falls eine Charge zwischen
          // Selektion und Insert von einem anderen Lauf gegriffen wurde
          // (Cycle-Flip im Fenster zweier Crons), wird sie nicht ein zweites
          // Mal auf eine Rechnung gezogen. Mismatch → Abbruch der Gruppe.
          const flipped = await tx
            .update(charges)
            .set({ status: "invoiced", invoiceId: inv.id })
            .where(
              and(
                inArray(charges.id, chargeIds),
                eq(charges.status, "confirmed")
              )
            )
            .returning({ id: charges.id });
          if (flipped.length !== chargeIds.length) {
            throw new Error(
              `invoice-run: charge-status-mismatch (${flipped.length}/${chargeIds.length}) — Gruppe abgebrochen, tx rollt zurück`
            );
          }

          return inv;
        });

        // B6: Draft-Recovery. Ein liegengebliebener 'draft' (Mail schlug in
        // einem früheren Run fehl, Items/Charges sind bereits verknüpft)
        // wird im Re-Run aufgegriffen: Versand + sent-Markierung nachholen
        // statt ihn als "duplicate" für immer liegen zu lassen.
        let invoiceRow = inserted;
        let recoveredDraft = false;
        if (!invoiceRow) {
          const [existing] = await db
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.sponsorId, spRow.sponsor.id),
                eq(invoices.clubId, cl.id),
                eq(invoices.period, periodStr),
                isNull(invoices.reversalOfInvoiceId)
              )
            )
            .limit(1);
          if (existing && existing.status === "draft") {
            // Sicherheits-Guard (Review 2026-06-11): Recovery nur, wenn ALLE
            // Charges der Gruppe bereits am Draft hängen. Sind seitdem neue
            // Charges in derselben Periode confirmed worden (Manual-Run
            // mitten im Monat), wären PDF/Total und invoiceItems inkonsistent
            // — dann lieber skippen und loggen statt falsch fakturieren.
            const groupChargeIds = group.items.map((i) => i.chargeId);
            const linked = await db
              .select({ id: charges.id })
              .from(charges)
              .where(
                and(
                  inArray(charges.id, groupChargeIds),
                  eq(charges.invoiceId, existing.id)
                )
              );
            if (linked.length !== groupChargeIds.length) {
              console.warn("[invoice-run] draft-recovery mismatch — skipping", {
                invoiceId: existing.id,
                linked: linked.length,
                group: groupChargeIds.length
              });
              return { skipped: true, reason: "draft-mismatch" } as const;
            }
            invoiceRow = existing;
            recoveredDraft = true;
            // Der Re-Run hat eine neue Rechnungsnummer gezogen und die PDF
            // frisch gerendert/gespeichert — Row darauf umbiegen, damit
            // Mail-Anhang und pdfUrl konsistent sind. Die im Fehl-Run
            // verbrauchte Nummer bleibt als Lücke im Zähler (bewusst:
            // Nummern werden nie wiederverwendet).
            await db
              .update(invoices)
              .set({ pdfUrl: storageUrl, totalCents: total })
              .where(eq(invoices.id, existing.id));
          } else {
            return { skipped: true, reason: "duplicate-invoice" } as const;
          }
        }

        // Sammle Mail-Metadaten — werden in separaten Steps unten versendet.
        // pdfBuf als base64 durch Inngest-Step-Boundary serialisierbar.
        // Admin-Mails + Reply-To folgen dem Absender-Club: unter Vereinslizenz
        // informiert die Rechnung den VORSTAND (Geld fließt zum Verein,
        // Spec §1.5-Trade-off), nicht den Container-Trainer.
        const adminRows = await db
          .select({ email: users.email, name: users.name })
          .from(clubMemberships)
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(eq(clubMemberships.clubId, billingClub.id));
        const adminEmails = adminRows.filter((a) => a.email).map((a) => a.email);
        const replyTo = await getReplyToForClub(billingClub.id);

        return {
          skipped: false as const,
          recoveredDraft,
          invoiceId: invoiceRow.id,
          invoiceNumber,
          clubId: billingClub.id,
          clubVerified: verified,
          sponsorEmail: spRow.user.email,
          sponsorName: spRow.sponsor.displayName,
          adminEmails,
          adminName: adminRows[0]?.name ?? null,
          clubName: billingClub.name,
          replyTo: replyTo ?? null,
          totalEur: eur(total),
          itemCount: group.items.length,
          // Spec §1.9: Zusatz-Zahlwege für die Rechnungs-Mail (Template
          // rendert sie konditional).
          paypalHandle: billingClub.paypalHandle ?? null,
          stripePaymentLink: billingClub.stripePaymentLink ?? null,
          pdfBase64: pdfBuf.toString("base64")
        };
        });
      } catch (err) {
        logger.error("invoice-group failed", {
          sponsorId: group.sponsorId,
          clubId: group.clubId,
          error: String(err)
        });
        failures.push({
          sponsorId: group.sponsorId,
          clubId: group.clubId,
          error: String(err)
        });
        return null;
      }
    })();

    if (!result || result.skipped) {
      continue;
    }

    if (!result.recoveredDraft) {
      invoicesCreated += 1;
    }
    const pdfBuf = Buffer.from(result.pdfBase64, "base64");

      // Phase E1 + Spec 2026-05-29 §3.2 Withhold-Gate: invoice exists
      // (status='withheld') but NO mails go out until the container-club is
      // verified. Re-release happens via approve-verification for the club.
      if (!result.clubVerified) {
        logger.info("invoice withheld — club not verified", {
          invoiceId: result.invoiceId,
          clubId: result.clubId,
          invoiceNumber: result.invoiceNumber
        });
        continue;
      }

      // Step B: Mail an Sponsor. Eigener step.run mit deterministischer
      // step-id basierend auf invoiceId → Inngest-Retry triggert genau
      // diesen Step neu, nicht den ganzen Group-Flow.
      await step.run(`mail-sponsor-${result.invoiceId}`, async () => {
        const mailArgs = {
          sponsorName: result.sponsorName,
          clubName: result.clubName,
          period: periodLabel,
          totalEur: result.totalEur,
          invoiceNumber: result.invoiceNumber,
          itemCount: result.itemCount,
          paypalHandle: result.paypalHandle,
          stripePaymentLink: result.stripePaymentLink
        };
        const sponsorMail =
          mailKind === "season_end"
            ? invoiceSponsorSeasonEmail(mailArgs)
            : invoiceSponsorEmail(mailArgs);
        const send = await resend.emails.send({
          from: MAIL_FROM,
          to: result.sponsorEmail,
          replyTo: result.replyTo ?? undefined,
          subject: sponsorMail.subject,
          text: sponsorMail.text,
          html: sponsorMail.html,
          attachments: [{ filename: `${result.invoiceNumber}.pdf`, content: pdfBuf }],
          headers: { "Idempotency-Key": `invoice-sponsor-${result.invoiceId}` }
        });
        if (send.error) {
          logger.error("sponsor-mail failed", {
            to: maskEmail(result.sponsorEmail),
            error: send.error
          });
          throw new Error(`sponsor-mail-failed: ${send.error}`);
        }
      });
      mailsSent += 1;

      // Step C: Mail an Club-Admins. Skippen wenn keine Admins.
      if (result.adminEmails.length > 0) {
        await step.run(`mail-admins-${result.invoiceId}`, async () => {
          const clubMail = invoiceClubEmail({
            adminName: result.adminName ?? undefined,
            clubName: result.clubName,
            sponsorName: result.sponsorName,
            period: periodLabel,
            totalEur: result.totalEur,
            invoiceNumber: result.invoiceNumber,
            itemCount: result.itemCount
          });
          const send = await resend.emails.send({
            from: MAIL_FROM,
            to: result.adminEmails,
            replyTo: result.replyTo ?? undefined,
            subject: clubMail.subject,
            text: clubMail.text,
            html: clubMail.html,
            attachments: [{ filename: `${result.invoiceNumber}.pdf`, content: pdfBuf }],
            headers: { "Idempotency-Key": `invoice-admins-${result.invoiceId}` }
          });
          if (send.error) {
            logger.error("club-mail failed", { to: maskEmail(result.adminEmails), error: send.error });
            throw new Error(`club-mail-failed: ${send.error}`);
          }
        });
        mailsSent += result.adminEmails.length;
      }

      // B6: erst NACH erfolgreichem Versand wird die Rechnung 'sent'.
      // Guard auf status='draft' macht den Step idempotent (Re-Run /
      // Inngest-Retry) und lässt withheld/paid unangetastet.
      await step.run(`mark-sent-${result.invoiceId}`, async () => {
        await db
          .update(invoices)
          .set({ status: "sent", sentAt: new Date() })
          .where(
            and(eq(invoices.id, result.invoiceId), eq(invoices.status, "draft"))
          );
      });

      // Step D: Push/In-App an Club-Admins (additiv zur E-Mail, best-effort,
      // eigener memoisierter Step → idempotent über Retries).
      try {
        await step.run(`invoice-push-${result.invoiceId}`, async () => {
          const admins = await db
            .select({ userId: clubMemberships.userId })
            .from(clubMemberships)
            .where(
              and(
                eq(clubMemberships.clubId, result.clubId),
                eq(clubMemberships.role, "admin")
              )
            );
          const [clubRow] = await db
            .select({ slug: clubs.slug })
            .from(clubs)
            .where(eq(clubs.id, result.clubId))
            .limit(1);
          await notifyUsers(
            admins.map((a) => a.userId),
            {
              type: "invoice_created",
              title: "Neue Rechnung erstellt",
              body: `Rechnung ${result.invoiceNumber} über ${result.totalEur} für ${result.clubName}.`,
              link: clubRow ? `/verein/${clubRow.slug}/abrechnungen` : null,
              data: { invoiceId: result.invoiceId, clubId: result.clubId }
            }
          );
        });
    } catch (err) {
      logger.error("invoice-push step error", {
        invoiceId: result.invoiceId,
        error: String(err)
      });
    }
  }

  return { invoicesCreated, mailsSent, failures };
}
