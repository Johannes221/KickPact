import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Audit 2026-05-24 Phase 4 / Task 4.6: Fail-Closed bei fehlendem signingKey.
 *
 * Inngest verifiziert in Production normalerweise via signingKey (gesetzt
 * über INNGEST_SIGNING_KEY env). Wenn die Env-Var fehlt, akzeptiert serve()
 * silent jeden POST — d.h. JEDER kann beliebige Functions triggern
 * (`crawler/manual`, `invoices/manual-run`, `pledges/season-end-test`, …).
 *
 * In Production: throw beim Modul-Load wenn die Var fehlt. Im Dev (Inngest
 * Dev-Server hat keinen signing-key) bleibt's weich.
 */
if (process.env.NODE_ENV === "production" && !process.env.INNGEST_SIGNING_KEY) {
  throw new Error(
    "INNGEST_SIGNING_KEY ist in Production zwingend — sonst kann jeder via /api/inngest beliebige Inngest-Functions triggern."
  );
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY
});
