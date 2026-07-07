import { and, eq, inArray } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, charges, clubs, sponsors, users } from "@/lib/db/schema";
import { InvoicePdf } from "@/lib/invoicing/builder";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";
import { storePdf } from "@/lib/invoicing/storage";

export type StornoResult =
  | { ok: true; stornoInvoiceId: string; stornoNumber: string; amountCents: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "already_cancelled"
        | "is_storno"
        | "wrong_status"
        | "no_pdf"
        | "no_charges";
    };

function extractInvoiceNumber(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  const m = pdfUrl.match(/([^/]+)\.pdf$/);
  return m ? m[1] : null;
}

type InvoiceRow = typeof invoices.$inferSelect;

/**
 * Geteilter Kern für Storno-/Korrekturbelege: erzeugt eine Reversal-Rechnung
 * (neue fortlaufende Nummer, negative Beträge, Verweis auf die Original-Nummer,
 * eigenes PDF) und storniert die zugrunde liegenden Charges.
 *
 * `subsetChargeIds = null`  → VOLLSTORNO: reversed alle Items, Betrag exakt
 *   -orig.totalCents (inkl. Alt-Beleg-USt-Ausgleich), markiert das Original als
 *   storniert (cancelledAt).
 * `subsetChargeIds = Set`   → TEIL-GUTSCHRIFT (Daten-Integrität 2026-07-07):
 *   reversed NUR die Items der genannten Charges, Betrag = -Summe dieser Items,
 *   das Original bleibt gültig (andere Zeilen sind weiter offen/bezahlt).
 */
async function buildReversal(
  orig: InvoiceRow,
  opts: {
    subsetChargeIds: Set<string> | null;
    cancelOriginal: boolean;
    chargeCancelReason: string;
  }
): Promise<StornoResult> {
  const originalNumber = extractInvoiceNumber(orig.pdfUrl);
  if (!originalNumber) return { ok: false, reason: "no_pdf" };

  const [club] = await db.select().from(clubs).where(eq(clubs.id, orig.clubId)).limit(1);
  const [sponsorRow] = await db
    .select({
      displayName: sponsors.displayName,
      email: users.email
    })
    .from(sponsors)
    .innerJoin(users, eq(users.id, sponsors.userId))
    .where(eq(sponsors.id, orig.sponsorId))
    .limit(1);
  if (!club || !sponsorRow) return { ok: false, reason: "not_found" };

  const allItems = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, orig.id));
  const items =
    opts.subsetChargeIds === null
      ? allItems
      : allItems.filter((it) => opts.subsetChargeIds!.has(it.chargeId));
  if (items.length === 0) return { ok: false, reason: "no_charges" };

  const partial = opts.subsetChargeIds !== null;
  const itemSum = items.reduce((s, i) => s + i.amountCents, 0);
  // Vollstorno erstattet den exakt gebuchten Betrag (inkl. evtl. Alt-USt);
  // Teil-Gutschrift erstattet genau die Summe der betroffenen Zeilen.
  const reversedTotal = partial ? -itemSum : -orig.totalCents;

  const year = new Date().getFullYear();
  const stornoNumber = await nextInvoiceNumber(orig.clubId, year);

  const clubAddress = (club.addressJson as {
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
  } | null) ?? { street: "", zip: "", city: "" };

  const pdfBuf = await renderToBuffer(
    InvoicePdf({
      data: {
        invoiceNumber: stornoNumber,
        stornoOfNumber: originalNumber,
        period: orig.period,
        issuedAt: new Date(),
        girocodeDataUrl: null,
        club: {
          name: club.name,
          address: {
            street: clubAddress.street ?? "",
            zip: clubAddress.zip ?? "",
            city: clubAddress.city ?? "",
            country: clubAddress.country
          },
          iban: club.iban ?? null
        },
        sponsor: {
          displayName: sponsorRow.displayName,
          email: sponsorRow.email
        },
        items: (() => {
          const rows = items.map((it) => ({
            matchDate: orig.createdAt,
            matchLabel: it.description,
            triggerLabel: "",
            amountCents: -it.amountCents
          }));
          // Alt-Beleg-Kante (Review M1): NUR beim Vollstorno. Belege aus der
          // Zeit VOR dem Privatpersonen-Pivot tragen totalCents = Items + 19 %
          // USt. Der Vollstorno muss exakt -orig.totalCents ausweisen — sonst
          // weicht das PDF von DB/Erstattung ab. Bei der Teil-Gutschrift gibt
          // es keinen belastbaren USt-Anteil pro Zeile → keine Ausgleichszeile
          // (post-pivot USt-frei; Alt-Belege werden voll storniert, nicht
          // teil-gutgeschrieben).
          if (!partial) {
            const rest = orig.totalCents - itemSum;
            if (rest !== 0) {
              rows.push({
                matchDate: orig.createdAt,
                matchLabel: "Ausgleich (im Original enthaltene USt)",
                triggerLabel: "",
                amountCents: -rest
              });
            }
          }
          return rows;
        })()
      }
    })
  );

  const storageUrl = await storePdf(`${orig.clubId}/${stornoNumber}.pdf`, pdfBuf);

  const chargeIds = items.map((it) => it.chargeId);

  const stornoInvoiceId = await db.transaction(async (tx) => {
    const [storno] = await tx
      .insert(invoices)
      .values({
        sponsorId: orig.sponsorId,
        clubId: orig.clubId,
        period: orig.period,
        totalCents: reversedTotal,
        pdfUrl: storageUrl,
        status: "sent",
        sentAt: new Date(),
        reversalOfInvoiceId: orig.id
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceItems).values(
      items.map((it) => ({
        invoiceId: storno.id,
        chargeId: it.chargeId,
        description: `Storno: ${it.description}`,
        amountCents: -it.amountCents
      }))
    );

    if (opts.cancelOriginal) {
      await tx.update(invoices).set({ cancelledAt: new Date() }).where(eq(invoices.id, orig.id));
    }

    // Charges reversen: dürfen nicht auf 'invoiced' stehen bleiben, sonst zählt
    // jedes Sponsor-Reporting (confirmed|invoiced) + die Monats-Cap den
    // erstatteten Betrag dauerhaft weiter. 'cancelled' ist überall aus den
    // aktiven Aggregaten ausgeklammert; der Invoice-Item-Beleg bleibt für die
    // Historie. correctionFlaggedAt wird zurückgesetzt → verlässt die Queue.
    // Guard auf status='invoiced' + count-Abgleich: gibt der Betrag im PDF
    // (was wir gutschreiben) exakt das wieder, was tatsächlich storniert wurde
    // (Race gegen einen parallelen Lauf → rollback statt falscher Gutschrift).
    const reversed = await tx
      .update(charges)
      .set({
        status: "cancelled",
        cancelledReason: opts.chargeCancelReason,
        cancelledAt: new Date(),
        correctionFlaggedAt: null
      })
      .where(and(inArray(charges.id, chargeIds), eq(charges.status, "invoiced")))
      .returning({ id: charges.id });
    if (reversed.length !== chargeIds.length) {
      throw new Error(
        `storno: charge-status-mismatch (${reversed.length}/${chargeIds.length}) — rollback`
      );
    }
    return storno.id;
  });

  return { ok: true, stornoInvoiceId, stornoNumber, amountCents: reversedTotal };
}

/**
 * Erzeugt einen Stornobeleg (Vollkorrektur) zur Original-Zahlungsübersicht.
 * Betrifft die Verein→Sponsor-Zahlungsübersichten (Privatpersonen-only,
 * Spec 2026-07-06 §4 — früher „Stornorechnung").
 */
export async function createStornoInvoice(
  originalInvoiceId: string
): Promise<StornoResult> {
  const [orig] = await db.select().from(invoices).where(eq(invoices.id, originalInvoiceId)).limit(1);
  if (!orig) return { ok: false, reason: "not_found" };
  if (orig.reversalOfInvoiceId) return { ok: false, reason: "is_storno" };
  if (orig.cancelledAt) return { ok: false, reason: "already_cancelled" };
  if (orig.status !== "sent" && orig.status !== "paid") return { ok: false, reason: "wrong_status" };

  return buildReversal(orig, {
    subsetChargeIds: null,
    cancelOriginal: true,
    chargeCancelReason: "invoice_reversed"
  });
}

/**
 * Daten-Integrität (2026-07-07): Teil-Gutschrift für einzelne bereits
 * fakturierte Charges, deren Spiel nachträglich korrigiert wurde
 * (Admin-Review-Queue → createCorrectionInvoice). Erstattet genau die
 * genannten Charges auf einem eigenen Korrekturbeleg; die restlichen Zeilen
 * der Original-Rechnung bleiben unverändert gültig.
 *
 * `chargeIds` wird serverseitig gegen die Items der Rechnung gefiltert
 * (kein Vertrauen auf die Client-Liste) — fremde/nicht zugehörige IDs fallen
 * raus; bleibt danach nichts übrig → `no_charges`.
 */
export async function createCorrectionInvoice(
  originalInvoiceId: string,
  chargeIds: string[]
): Promise<StornoResult> {
  if (chargeIds.length === 0) return { ok: false, reason: "no_charges" };
  const [orig] = await db.select().from(invoices).where(eq(invoices.id, originalInvoiceId)).limit(1);
  if (!orig) return { ok: false, reason: "not_found" };
  if (orig.reversalOfInvoiceId) return { ok: false, reason: "is_storno" };
  if (orig.cancelledAt) return { ok: false, reason: "already_cancelled" };
  // Nur versendete/bezahlte Belege können teil-gutgeschrieben werden. Steht die
  // Rechnung noch auf draft/withheld, ging sie nie an den Sponsor — dann ist
  // Verwerfen (dismiss) der richtige Weg, nicht ein Korrekturbeleg.
  if (orig.status !== "sent" && orig.status !== "paid") return { ok: false, reason: "wrong_status" };

  return buildReversal(orig, {
    subsetChargeIds: new Set(chargeIds),
    cancelOriginal: false,
    chargeCancelReason: "correction_reversed"
  });
}
