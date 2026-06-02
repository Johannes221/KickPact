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
 *    lokaler Storage → direkt streamen).
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
  if (!key) return NextResponse.json({ error: "no-avatar" }, { status: 404 });

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
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
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
