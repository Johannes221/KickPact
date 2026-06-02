import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { uploadTeamCover } from "@/lib/actions/team-images";
import { rejectOversizedUpload } from "@/lib/storage/upload-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized", message: "Bitte zuerst anmelden." }, { status: 401 });
  }

  const oversized = rejectOversizedUpload(req);
  if (oversized) return oversized;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch {
    return NextResponse.json({ error: "bad-request", message: "Upload konnte nicht gelesen werden." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no-file", message: "Keine Datei empfangen." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { coverUrl } = await uploadTeamCover({ teamId, filename: file.name, contentType: file.type, bytes });
    return NextResponse.json({ ok: true, coverUrl });
  } catch (e) {
    if (isRedirectError(e)) {
      return NextResponse.json({ error: "forbidden", message: "Kein Zugriff auf diese Mannschaft." }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
    return NextResponse.json({ error: "upload-failed", message }, { status: 400 });
  }
}
