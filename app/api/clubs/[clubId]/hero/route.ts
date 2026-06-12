import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getClubHeroInfo } from "@/lib/db/queries/club-public-profile";
import { getClubMembershipRole } from "@/lib/db/queries/membership-requests";
import { getDocumentSignedUrl, readLocalDocument } from "@/lib/storage/documents";
import { uploadClubHero } from "@/lib/actions/club-profile";
import { rejectOversizedUpload } from "@/lib/storage/upload-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hero-Bild des öffentlichen Vereinsprofils /v/[slug] (Phase 5 Paket C).
 *
 * GET ist öffentlich (das Profil selbst ist öffentlich); POST ist der
 * Upload-Endpoint. Bewusst ein Route-Handler statt Server-Action: Next
 * drosselt Server-Action-Bodies auf 1 MB — gleiche Falle wie beim Team-Logo
 * (app/api/teams/[teamId]/logo). Auth/Validierung/HEIC→JPEG passieren in
 * `uploadClubHero`.
 */

/**
 * Prüft, dass der Storage-Key wirklich zum Verein gehört (R2 behält Slashes,
 * lokaler Storage ersetzt sie durch Unterstriche — siehe storeDocument).
 */
function isOwnClubKey(key: string, clubId: string): boolean {
  const rel = key.replace(/^r2:\/\/[^/]+\//, "").replace(/^local:\/\//, "");
  return rel.startsWith(`clubs/${clubId}/`) || rel.startsWith(`clubs_${clubId}_`);
}

function contentTypeFor(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await params;

  // Review N3 (2026-06-12): Das /v/[slug]-404-Gate (unverifiziert = nie
  // öffentlich) darf nicht über die Bild-Route umgehbar sein. Unverifizierte
  // Vereine liefern das Hero nur an eingeloggte Mitglieder (Editor-Vorschau
  // in den Einstellungen).
  const heroInfo = await getClubHeroInfo(clubId);
  if (!heroInfo?.heroUrl) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (!heroInfo.verifiedAt) {
    const session = await getServerSession();
    const role = session
      ? await getClubMembershipRole(session.user.id, clubId)
      : null;
    if (!role) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
  }

  const key = heroInfo.heroUrl;
  if (!isOwnClubKey(key, clubId)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (key.startsWith("r2://")) {
    const url = await getDocumentSignedUrl(key, 3600);
    return NextResponse.redirect(url);
  }
  const rel = key.startsWith("local://") ? key.slice("local://".length) : key;
  try {
    const buf = await readLocalDocument(rel);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(rel),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
  }
}

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await params;

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
    const { heroUrl } = await uploadClubHero({
      clubId,
      filename: file.name,
      contentType: file.type,
      bytes
    });

    const displayUrl = await getDocumentSignedUrl(heroUrl, 3600);
    return NextResponse.json({ ok: true, heroUrl: displayUrl });
  } catch (e) {
    // assertClubAccess redirectet bei fehlendem Zugriff → 403.
    if (isRedirectError(e)) {
      return NextResponse.json(
        { error: "forbidden", message: "Kein Zugriff auf diesen Verein." },
        { status: 403 }
      );
    }
    const message = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
    return NextResponse.json({ error: "upload-failed", message }, { status: 400 });
  }
}
