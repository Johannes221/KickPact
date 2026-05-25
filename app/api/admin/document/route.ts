import { NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { getDocumentSignedUrl } from "@/lib/storage/documents";

export const dynamic = "force-dynamic";

/**
 * Admin-only proxy: takes a storage-key (?key=…) and 302-redirects to a
 * signed download URL. Used by the operator's "Download" link on the
 * verifications-table.
 */
export async function GET(req: Request) {
  await assertPlatformAdmin();
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  const url = await getDocumentSignedUrl(key, 600);
  // For local:// keys, getDocumentSignedUrl returns a /api/documents/download
  // URL that we don't have a handler for yet — for E2 scope, R2 is the
  // expected production setup. Local-dev: operator opens the file from the
  // local filesystem directly.
  return NextResponse.redirect(url);
}
