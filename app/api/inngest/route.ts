import { serve } from "inngest/next";
import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Audit 2026-05-24 Phase 4 / Task 4.6: Fail-Closed bei fehlendem signingKey.
 *
 * Inngest verifiziert in Production normalerweise via signingKey. Wenn die
 * Env-Var fehlt, akzeptiert serve() silent jeden POST — jeder kann via
 * /api/inngest beliebige Functions triggern.
 *
 * Check passiert beim REQUEST (nicht Modul-Load), damit `next build` nicht
 * crasht wenn die Env-Var im Build-Step fehlt.
 */
const handlers = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY
});

function blockUnsigned() {
  if (process.env.NODE_ENV === "production" && !process.env.INNGEST_SIGNING_KEY) {
    return NextResponse.json(
      {
        error:
          "INNGEST_SIGNING_KEY missing in production — refusing to serve unsigned Inngest requests"
      },
      { status: 503 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  return blockUnsigned() ?? handlers.GET(req, undefined);
}

export async function POST(req: NextRequest) {
  return blockUnsigned() ?? handlers.POST(req, undefined);
}

export async function PUT(req: NextRequest) {
  return blockUnsigned() ?? handlers.PUT(req, undefined);
}
