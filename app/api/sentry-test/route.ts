import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// TEMPORARY — wird nach Sentry-Smoke-Test entfernt (KIC-9)
export async function GET() {
  Sentry.captureException(new Error("KickPact Sentry smoke test — KIC-9"), {
    tags: { feature: "smoke-test", issue: "KIC-9" },
  });
  return NextResponse.json({ ok: true, message: "Sentry smoke test fired" });
}
