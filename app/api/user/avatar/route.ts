import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getDocumentSignedUrl, readLocalDocument } from "@/lib/storage/documents";
import { rejectOversizedUpload } from "@/lib/storage/upload-guard";
import { uploadUserAvatar, getUserAvatarKey } from "@/lib/actions/user-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Profilbild des angemeldeten Nutzers.
 *  - POST: Bild hochladen (Route-Handler wegen 1-MB-Server-Action-Limit; HEIC →
 *    JPEG in uploadUserAvatar). Setzt users.image.
 *  - GET: das eigene Profilbild ausliefern (r2 → signierte Redirect-URL,
 *    externe OAuth-URL → Redirect, lokaler Storage → direkt streamen).
 *
 * Kein-Bild-Fälle antworten 204 statt 404/410: die App-Shell fragt die Route
 * auf jedem Seitenladen an, ein 4xx würde dauerhaft als Fehler im Netzwerk-Log
 * auftauchen. 204 lässt <img> still in den Initialen-Fallback laufen.
 */
function contentTypeFor(key: string): string {
  const l = key.toLowerCase();
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = await getUserAvatarKey(session.user.id);
  if (!key) return new NextResponse(null, { status: 204 });

  // OAuth-Signups (Google/Apple) tragen in users.image eine externe URL —
  // die ist kein Storage-Key und darf nicht als lokaler Pfad gelesen werden.
  if (key.startsWith("https://") || key.startsWith("http://")) {
    return NextResponse.redirect(key);
  }
  if (key.startsWith("r2://")) {
    return NextResponse.redirect(await getDocumentSignedUrl(key, 3600));
  }
  const rel = key.startsWith("local://") ? key.slice("local://".length) : key;
  try {
    const buf = await readLocalDocument(rel);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": contentTypeFor(rel), "Cache-Control": "private, max-age=600" }
    });
  } catch {
    // Datei weg (z.B. lokales Volume nach Redeploy) → wie "kein Avatar".
    return new NextResponse(null, { status: 204 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Bitte zuerst anmelden." },
      { status: 401 }
    );
  }

  const oversized = rejectOversizedUpload(req);
  if (oversized) return oversized;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "bad-request", message: "Upload konnte nicht gelesen werden." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "no-file", message: "Keine Datei empfangen." },
      { status: 400 }
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadUserAvatar({
      userId: session.user.id,
      filename: file.name,
      contentType: file.type,
      bytes
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
    return NextResponse.json({ error: "upload-failed", message }, { status: 400 });
  }
}
