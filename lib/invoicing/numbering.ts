import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";

export async function nextInvoiceNumber(clubId: string, year: number): Promise<string> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.clubId, clubId), sql`EXTRACT(YEAR FROM ${invoices.createdAt}) = ${year}`));
  const seq = (row?.count ?? 0) + 1;
  return `KP-${year}-${String(seq).padStart(4, "0")}`;
}
