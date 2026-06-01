import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getDocumentSignedUrl } from "@/lib/storage/documents";
import { uploadTeamLogo } from "@/lib/actions/team-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logo-Upload-Endpoint. Bewusst ein Route-Handler statt Server-Action: Next
 * drosselt Server-Action-Bodies auf 1 MB (Default greift trotz Config, siehe
 * Sentry JAVASCRIPT-NEXTJS-9) → iPhone-Fotos und größere Logos schlugen fehl.
 * Route-Handler lesen den Body über `req.formData()` ohne dieses Limit.
 *
 * Auth, Format-/Größen-Validierung, HEIC-Konvertierung, Storage und DB-Update
 * passieren in `uploadTeamLogo` (als normaler Funktionsaufruf → kein Bodylimit).
 */
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
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Bitte zuerst anmelden." },
      { status: 401 }
    );
  }

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
    const { logoUrl } = await uploadTeamLogo({
      teamId,
      filename: file.name,
      contentType: file.type,
      bytes
    });

    // Sofort anzeigbare (signierte) URL für die Live-Vorschau im Client.
    const displayUrl = await getDocumentSignedUrl(logoUrl, 3600);
    return NextResponse.json({ ok: true, logoUrl: displayUrl });
  } catch (e) {
    // assertClubWriteAccess redirectet bei fehlendem Zugriff → 403.
    if (isRedirectError(e)) {
      return NextResponse.json(
        { error: "forbidden", message: "Kein Zugriff auf diese Mannschaft." },
        { status: 403 }
      );
    }
    // Validierungs-/Gate-Fehler (Format, Größe, Read-Only) → nutzerlesbar.
    const message =
      e instanceof Error ? e.message : "Upload fehlgeschlagen.";
    return NextResponse.json({ error: "upload-failed", message }, { status: 400 });
  }
}
