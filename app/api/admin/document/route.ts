import { NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { getDocumentSignedUrl, readLocalDocument } from "@/lib/storage/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

/**
 * Admin-only: liefert ein Verifizierungs-Dokument zur Inline-Ansicht aus.
 *
 * - r2://  → 302-Redirect auf eine kurzlebige signierte URL (absolut → ok).
 * - local:// (bzw. nackter rel-Pfad) → Datei direkt vom Volume streamen, damit
 *   sie sich sofort im Browser-Tab öffnet (kein Zwischen-Handler nötig).
 *
 * Vorher: `NextResponse.redirect()` bekam für local-Keys eine *relative* URL
 * (Handler existierte nicht) → 500. Jetzt wird lokal direkt gestreamt.
 */
export async function GET(req: Request) {
  await assertPlatformAdmin();
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }

  // R2: signierte URL ist absolut → Redirect funktioniert.
  if (key.startsWith("r2://")) {
    const url = await getDocumentSignedUrl(key, 600);
    return NextResponse.redirect(url);
  }

  // local:// oder nackter rel-Pfad → Datei direkt ausliefern.
  const relPath = key.startsWith("local://") ? key.slice("local://".length) : key;
  let buf: Buffer;
  try {
    buf = await readLocalDocument(relPath);
  } catch {
    return NextResponse.json(
      { error: "file-missing", detail: "Dokument nicht (mehr) auf dem Volume gefunden." },
      { status: 410 }
    );
  }

  const filename = relPath.split(/[_/]/).pop() ?? "dokument";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(relPath),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store"
    }
  });
}
