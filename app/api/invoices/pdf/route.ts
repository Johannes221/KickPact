import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import { isPlatformAdminEmail } from "@/lib/auth/admin";
import { readLocalPdf } from "@/lib/invoicing/storage";
import { findInvoiceByPdfUrl } from "@/lib/db/queries/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streamt lokal gespeicherte Rechnungs-PDFs.
 * Auth: nur der Sponsor (owner) ODER ein Club-Admin des zugehörigen Vereins.
 *
 * Zugriffsmuster:
 * - `getDownloadUrl()` liefert `/api/invoices/pdf?key=<relPath>` für lokale PDFs
 * - Browser holt sich das File mit Auth-Cookie → wir prüfen wer drauf darf
 *
 * Sicherheit: key wird nur gegen die invoices-Tabelle resolved
 * (`pdfUrl LIKE 'local://%<key>'`), kein direkter Path-Traversal möglich.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing-key" }, { status: 400 });
  }

  // Finde die Invoice anhand der Storage-URL
  const row = await findInvoiceByPdfUrl(`local://${key}`);

  if (!row) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const isOwner = row.sponsorUserId === user.id;
  if (!isOwner) {
    // Plattform-Operator darf jede Rechnung herunterladen (Backoffice/Support).
    const isOperator = await isPlatformAdminEmail(user.email);
    if (!isOperator) {
      try {
        await assertClubAccess(row.clubSlug, "admin");
      } catch {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }

  let pdfBuf: Buffer;
  try {
    pdfBuf = await readLocalPdf(key);
  } catch {
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${key}"`,
      "Cache-Control": "private, max-age=0, no-store"
    }
  });
}
