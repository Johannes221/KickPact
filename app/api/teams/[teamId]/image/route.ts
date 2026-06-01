import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { getTeamImageKey } from "@/lib/db/queries/team-images";
import { getDocumentSignedUrl, readLocalDocument } from "@/lib/storage/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prüft, dass ein Storage-Key wirklich zu teams/<teamId>/ gehört. */
function isOwnTeamKey(key: string, teamId: string): boolean {
  const rel = key.replace(/^r2:\/\/[^/]+\//, "").replace(/^local:\/\//, "");
  return rel.startsWith(`teams/${teamId}/`);
}

function contentTypeFor(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot");
  const id = searchParams.get("id");

  let key: string | null = null;
  if (slot === "cover" || slot === "logo") {
    const [row] = await db
      .select({ coverUrl: teams.coverUrl, logoUrl: teams.logoUrl })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    key = slot === "cover" ? (row?.coverUrl ?? null) : (row?.logoUrl ?? null);
  } else if (slot === "gallery" && id) {
    key = await getTeamImageKey(teamId, id);
  } else {
    return NextResponse.json({ error: "bad-slot" }, { status: 404 });
  }

  if (!key || !isOwnTeamKey(key, teamId)) {
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
      headers: { "Content-Type": contentTypeFor(rel), "Cache-Control": "public, max-age=3600" }
    });
  } catch {
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
  }
}
