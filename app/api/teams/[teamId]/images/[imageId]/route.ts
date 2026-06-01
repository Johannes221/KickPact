import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { removeTeamGalleryImage } from "@/lib/actions/team-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string; imageId: string }> }) {
  const { teamId, imageId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await removeTeamGalleryImage({ teamId, imageId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isRedirectError(e)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ error: "delete-failed", message }, { status: 400 });
  }
}
