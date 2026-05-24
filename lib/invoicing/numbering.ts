import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceCounters } from "@/lib/db/schema";

/**
 * Race-safe Invoice-Nummerierung.
 *
 * Audit 2026-05-24 Phase 2 / Task 2.1: Vorher `COUNT(*) + 1` ohne Lock —
 * zwei parallele Cron+Manual-Runs konnten identische `KP-2026-0001`
 * produzieren, R2-PUT überschrieb dann eine PDF mit der anderen, Sponsor
 * bekam fremde Rechnung im Anhang.
 *
 * Jetzt: atomic INSERT … ON CONFLICT DO UPDATE SET counter = counter + 1
 * RETURNING counter. Postgres garantiert dass parallele Aufrufer
 * unterschiedliche counter-Werte zurückbekommen (row-level lock during
 * UPDATE), ohne dass wir selber ein SELECT FOR UPDATE oder advisory_lock
 * brauchen.
 */
export async function nextInvoiceNumber(clubId: string, year: number): Promise<string> {
  const [row] = await db
    .insert(invoiceCounters)
    .values({ clubId, year, counter: 1 })
    .onConflictDoUpdate({
      target: [invoiceCounters.clubId, invoiceCounters.year],
      set: {
        counter: sql`${invoiceCounters.counter} + 1`,
        updatedAt: sql`now()`
      }
    })
    .returning({ counter: invoiceCounters.counter });

  const seq = row?.counter ?? 1;
  return `KP-${year}-${String(seq).padStart(4, "0")}`;
}
