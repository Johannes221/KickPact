import { eq, sql, inArray, and } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { inngest } from "@/lib/inngest/client";
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
import { invoiceClubEmail } from "@/lib/mail/templates/invoice-club";
import { lastBillingPeriod, type BillingPeriod } from "@/lib/invoicing/period";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";
import { storePdf } from "@/lib/invoicing/storage";
import { InvoicePdf } from "@/lib/invoicing/builder";
import { renderGirocodeDataUrl } from "@/lib/invoicing/girocode";
import {
  listConfirmedChargesByPeriod,
  groupChargesBySponsorClub
} from "@/lib/db/queries/charges";
import { maskEmail } from "@/lib/utils/log-pii";
import { notifyUsers } from "@/lib/notifications/deliver";

/**
 * Lesbare Labels für Trigger-Typen — landen auf der PDF + in der DB-Description.
 * Sollten konsistent mit lib/triggers/labels.ts sein, falls dort eine Master-Liste existiert.
 */
const TRIGGER_LABELS: Record<string, string> = {
  goal_total: "pro Tor",
  goal_by_player: "Tor von Spieler",
  win: "pro Sieg",
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

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function buildPeriodFromString(periodStr: string): BillingPeriod {
  // periodStr format: "YYYY-MM"
  const [y, m] = periodStr.split("-").map(Number);
  const startsAt = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endsAt = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return {
    year: y,
    month: m,
    label: new Date(y, m - 1, 1).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric"
    }),
    startsAt,
    endsAt
  };
}

/**
 * Generates monthly invoices for all confirmed charges of the previous month.
 *
 * Cron: 1. eines Monats, 03:17 UTC (vermeidet Mitternachts-Spike, gibt Crawler-
 * Job Zeit für Sonntagsspiele zu laufen).
 *
 * Auch via Event `invoices/manual-run` triggerbar mit optionalem `period: "2026-04"`
 * Payload für manuelle Re-Runs.
 *
 * Idempotenz: invoices(sponsor_id, club_id, period) hat UNIQUE-Index — bei retries
 * wird onConflictDoNothing ausgelöst und der Mail-Send-Step übersprungen.
 */
export const generateInvoices = inngest.createFunction(
  { id: "generate-invoices", name: "Monthly Invoice Generation", concurrency: { limit: 1 } },
  [{ cron: "17 3 1 * *" }, { event: "invoices/manual-run" }],
  async ({ step, logger, event }) => {
    const overridePeriod = (event?.data as { period?: string } | undefined)?.period;
    const period = overridePeriod ? buildPeriodFromString(overridePeriod) : lastBillingPeriod();
    const periodStr = `${period.year}-${String(period.month).padStart(2, "0")}`;

    logger.info("generate-invoices start", { period: periodStr });

    const grouped = await step.run("load-charges", async () => {
      const rows = await listConfirmedChargesByPeriod({
        periodStart: period.startsAt,
        periodEnd: period.endsAt
      });
      return groupChargesBySponsorClub(rows);
    });

    if (grouped.length === 0) {
      logger.info("no charges to invoice for period", { period: periodStr });
      return { period: periodStr, groups: 0, invoicesCreated: 0, mailsSent: 0 };
    }

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
      const stepId = `invoice-${group.sponsorId}-${group.clubId}-${periodStr}`;
      try {
        const result = await step.run(stepId, async () => {
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

          const invoiceNumber = await nextInvoiceNumber(cl.id, period.year);

          // Pricing v2: höchstes Tier aller Teams des Clubs → steuert PDF-Footer.
          const planRows = await db
            .select({ plan: teamLicenses.plan })
            .from(teamLicenses)
            .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
            .where(eq(teams.clubId, cl.id));
          const clubPlan: PlanKey =
            planRows.length > 0
              ? highestPlanFrom(planRows.map((r) => r.plan as PlanKey))
              : "basic";

          const subtotal = group.items.reduce((s, i) => s + i.amountCents, 0);
          const ust = cl.isSmallBusiness ? 0 : Math.round(subtotal * 0.19);
          const total = subtotal + ust;

          // Render PDF to Buffer (Node-side, react-pdf)
          const clubAddress = (cl.addressJson as {
            street?: string;
            zip?: string;
            city?: string;
            country?: string;
          } | null) ?? { street: "", zip: "", city: "" };
          const businessAddress = (spRow.sponsor.businessAddressJson as {
            street?: string;
            zip?: string;
            city?: string;
            country?: string;
          } | null) ?? null;

          // Pre-render Girocode (EPC069-12) data-URL so the synchronous
          // react-pdf <Image> can embed it. Returns null when IBAN missing
          // → builder simply omits the QR side of the pay-box.
          const girocodeDataUrl = await renderGirocodeDataUrl({
            beneficiaryName: cl.name,
            iban: cl.iban ?? null,
            amountCents: total,
            remittance: invoiceNumber
          });

          const pdfBuf = await renderToBuffer(
            InvoicePdf({
              data: {
                invoiceNumber,
                period: period.label,
                issuedAt: new Date(),
                plan: clubPlan,
                girocodeDataUrl,
                club: {
                  name: cl.name,
                  address: {
                    street: clubAddress.street ?? "",
                    zip: clubAddress.zip ?? "",
                    city: clubAddress.city ?? "",
                    country: clubAddress.country
                  },
                  iban: cl.iban ?? null,
                  taxId: cl.taxId ?? null,
                  isSmallBusiness: cl.isSmallBusiness
                },
                sponsor: {
                  displayName: spRow.sponsor.displayName,
                  email: spRow.user.email,
                  type: spRow.sponsor.type,
                  businessName: spRow.sponsor.businessName ?? null,
                  businessAddress: businessAddress
                    ? {
                        street: businessAddress.street ?? "",
                        zip: businessAddress.zip ?? "",
                        city: businessAddress.city ?? "",
                        country: businessAddress.country
                      }
                    : null
                },
                items: group.items.map((it) => ({
                  matchDate: typeof it.matchDate === "string" ? new Date(it.matchDate) : it.matchDate,
                  matchLabel: `${it.heimName} ${it.ergebnisHeim ?? "—"}:${it.ergebnisGast ?? "—"} ${it.gastName}`,
                  triggerLabel: TRIGGER_LABELS[it.triggerType] ?? it.triggerType,
                  amountCents: it.amountCents
                }))
              }
            })
          );

          const storageUrl = await storePdf(`${cl.id}/${invoiceNumber}.pdf`, pdfBuf);

          // Phase E1 + Spec 2026-05-29 §3.2 Withhold-Gate:
          //   `clubs.verifiedAt` ist das einzige Verifizierungs-Gate. Ist der
          //   Container-Verein nicht verifiziert → Rechnung + PDF werden erstellt,
          //   aber status='withheld'. Bei Club-Approval wird re-evaluiert.
          //   (Das frühere team-level Gate `teams.verifiedAt` ist deaktiviert.)
          const verified = cl.verifiedAt !== null;

          const inserted = await db.transaction(async (tx) => {
            const [inv] = await tx
              .insert(invoices)
              .values({
                sponsorId: spRow.sponsor.id,
                clubId: cl.id,
                period: periodStr,
                totalCents: total,
                pdfUrl: storageUrl,
                status: verified ? "sent" : "withheld",
                sentAt: verified ? new Date() : null
              })
              .onConflictDoNothing()
              .returning();

            if (!inv) return null; // duplicate by UNIQUE constraint, skip

            await tx.insert(invoiceItems).values(
              group.items.map((it) => ({
                invoiceId: inv.id,
                chargeId: it.chargeId,
                description: `${new Date(it.matchDate).toLocaleDateString("de-DE")} · ${it.heimName} vs ${it.gastName} · ${TRIGGER_LABELS[it.triggerType] ?? it.triggerType}`,
                amountCents: it.amountCents
              }))
            );

            const chargeIds = group.items.map((i) => i.chargeId);
            await tx
              .update(charges)
              .set({ status: "invoiced", invoiceId: inv.id })
              .where(inArray(charges.id, chargeIds));

            return inv;
          });

          if (!inserted) {
            return { skipped: true, reason: "duplicate-invoice" } as const;
          }

          // Sammle Mail-Metadaten — werden in separaten Steps unten versendet.
          // pdfBuf als base64 durch Inngest-Step-Boundary serialisierbar.
          const adminRows = await db
            .select({ email: users.email, name: users.name })
            .from(clubMemberships)
            .innerJoin(users, eq(clubMemberships.userId, users.id))
            .where(eq(clubMemberships.clubId, cl.id));
          const adminEmails = adminRows.filter((a) => a.email).map((a) => a.email);
          const replyTo = await getReplyToForClub(cl.id);

          return {
            skipped: false as const,
            invoiceId: inserted.id,
            invoiceNumber,
            clubId: cl.id,
            clubVerified: verified,
            sponsorEmail: spRow.user.email,
            sponsorName: spRow.sponsor.displayName,
            adminEmails,
            adminName: adminRows[0]?.name ?? null,
            clubName: cl.name,
            replyTo: replyTo ?? null,
            totalEur: eur(total),
            itemCount: group.items.length,
            pdfBase64: pdfBuf.toString("base64")
          };
        });

        if (result.skipped) {
          continue;
        }

        invoicesCreated += 1;
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
          const sponsorMail = invoiceSponsorEmail({
            sponsorName: result.sponsorName,
            clubName: result.clubName,
            period: period.label,
            totalEur: result.totalEur,
            invoiceNumber: result.invoiceNumber,
            itemCount: result.itemCount
          });
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
              period: period.label,
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
      }
    }

    logger.info("generate-invoices done", {
      period: periodStr,
      groups: grouped.length,
      invoicesCreated,
      mailsSent,
      failures: failures.length
    });

    return {
      period: periodStr,
      groups: grouped.length,
      invoicesCreated,
      mailsSent,
      failures
    };
  }
);
