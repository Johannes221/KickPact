import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, clubs, sponsors, users } from "@/lib/db/schema";
import { InvoicePdf } from "@/lib/invoicing/builder";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";
import { storePdf } from "@/lib/invoicing/storage";

export type StornoResult =
  | { ok: true; stornoInvoiceId: string; stornoNumber: string; amountCents: number }
  | { ok: false; reason: "not_found" | "already_cancelled" | "is_storno" | "wrong_status" | "no_pdf" };

function extractInvoiceNumber(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  const m = pdfUrl.match(/([^/]+)\.pdf$/);
  return m ? m[1] : null;
}

/**
 * Erzeugt einen Stornobeleg (Korrektur) zur Original-Zahlungsübersicht:
 * neue fortlaufende Nummer aus dem Nummernkreis, negative Beträge, Verweis auf
 * die Original-Nummer, eigenes PDF. Das Original wird als storniert
 * (cancelled_at) markiert. Betrifft die Verein→Sponsor-Zahlungsübersichten
 * (Privatpersonen-only, Spec 2026-07-06 §4 — früher „Stornorechnung").
 */
export async function createStornoInvoice(
  originalInvoiceId: string
): Promise<StornoResult> {
  const [orig] = await db.select().from(invoices).where(eq(invoices.id, originalInvoiceId)).limit(1);
  if (!orig) return { ok: false, reason: "not_found" };
  if (orig.reversalOfInvoiceId) return { ok: false, reason: "is_storno" };
  if (orig.cancelledAt) return { ok: false, reason: "already_cancelled" };
  if (orig.status !== "sent" && orig.status !== "paid") return { ok: false, reason: "wrong_status" };

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
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, orig.id));
  if (!club || !sponsorRow) return { ok: false, reason: "not_found" };

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
          // Alt-Beleg-Kante (Review M1): Belege aus der Zeit VOR dem
          // Privatpersonen-Pivot tragen totalCents = Items + 19 % USt. Der
          // Stornobeleg muss aber exakt den gebuchten/erstatteten Betrag
          // (-orig.totalCents) ausweisen — sonst weicht das PDF von DB,
          // Admin-Toast und tatsächlicher Erstattung ab. Differenz als
          // eigene Ausgleichszeile ausweisen.
          const itemSum = items.reduce((s, i) => s + i.amountCents, 0);
          const rest = orig.totalCents - itemSum;
          if (rest !== 0) {
            rows.push({
              matchDate: orig.createdAt,
              matchLabel: "Ausgleich (im Original enthaltene USt)",
              triggerLabel: "",
              amountCents: -rest
            });
          }
          return rows;
        })()
      }
    })
  );

  const storageUrl = await storePdf(`${orig.clubId}/${stornoNumber}.pdf`, pdfBuf);

  const stornoInvoiceId = await db.transaction(async (tx) => {
    const [storno] = await tx
      .insert(invoices)
      .values({
        sponsorId: orig.sponsorId,
        clubId: orig.clubId,
        period: orig.period,
        totalCents: -orig.totalCents,
        pdfUrl: storageUrl,
        status: "sent",
        sentAt: new Date(),
        reversalOfInvoiceId: orig.id
      })
      .returning({ id: invoices.id });

    if (items.length > 0) {
      await tx.insert(invoiceItems).values(
        items.map((it) => ({
          invoiceId: storno.id,
          chargeId: it.chargeId,
          description: `Storno: ${it.description}`,
          amountCents: -it.amountCents
        }))
      );
    }

    await tx.update(invoices).set({ cancelledAt: new Date() }).where(eq(invoices.id, orig.id));
    return storno.id;
  });

  return { ok: true, stornoInvoiceId, stornoNumber, amountCents: -orig.totalCents };
}
