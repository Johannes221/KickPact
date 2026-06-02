import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { upsertDeviceToken, deleteDeviceTokens } from "@/lib/db/queries/device-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Device-Token-Registrierung für native iOS-Push. Aufgerufen vom
 * `PushRegistrar`-Client in der Capacitor-App. Same-origin → die better-auth-
 * Session-Cookie trägt die Authentifizierung (Capacitor-Plan Variante A).
 */
const postSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android"]).optional()
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  await upsertDeviceToken({
    token: parsed.data.token,
    userId: session.user.id,
    platform: parsed.data.platform ?? "ios"
  });

  return NextResponse.json({ ok: true });
}

/** Token-Abmeldung (Logout / Push-Opt-out in der App). */
export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const parsed = z.object({ token: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  await deleteDeviceTokens([parsed.data.token]);
  return NextResponse.json({ ok: true });
}
