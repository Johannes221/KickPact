/**
 * Operator-Admin-Panel (Spec 2026-05-29) — Phase A: Operator-Account-Bootstrap.
 *
 * Zwei Aufgaben:
 *  1. Backfill: setzt is_platform_admin=true für alle EXISTIERENDEN Nutzer,
 *     deren E-Mail in KICKPACT_ADMIN_EMAILS steht (Übergang ENV → DB-Flag).
 *  2. Optional: legt einen DEDIZIERTEN Operator-Account an (R1, getrennt von
 *     Vereins-/Sponsor-Rollen). Kein Passwort wird gesetzt — der Operator
 *     setzt es selbst via /admin/forgot-password (better-auth legt dabei den
 *     Credential-Account automatisch an).
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/operations/seed-operator.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/operations/seed-operator.ts operator@kickpact.de "KickPact Operator"
 */
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../../lib/db/client";
import { users } from "../../lib/db/schema/auth";

async function main() {
  const [emailArg, nameArg] = process.argv.slice(2);

  // ── 1. Backfill aus ENV-Allowlist ─────────────────────────────────────────
  const allowlist = (process.env.KICKPACT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  for (const email of allowlist) {
    const res = await db
      .update(users)
      .set({ isPlatformAdmin: true, updatedAt: new Date() })
      .where(eq(users.email, email))
      .returning({ id: users.id, email: users.email });
    if (res.length > 0) {
      console.log(`[backfill] is_platform_admin=true → ${res[0].email}`);
    } else {
      console.log(`[backfill] kein bestehender User für ${email} (übersprungen)`);
    }
  }

  // ── 2. Dedizierten Operator-Account anlegen/aktualisieren ──────────────────
  if (emailArg) {
    const email = emailArg.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      await db
        .update(users)
        .set({ isPlatformAdmin: true, updatedAt: new Date() })
        .where(eq(users.id, existing[0].id));
      console.log(`[operator] bestehender User ${email} → is_platform_admin=true`);
    } else {
      await db.insert(users).values({
        id: createId(),
        email,
        name: nameArg ?? "KickPact Operator",
        emailVerified: true,
        isPlatformAdmin: true
      });
      console.log(`[operator] neuer Operator-Account angelegt: ${email}`);
    }
    console.log(`\nNächster Schritt: /admin/forgot-password öffnen, ${email} eingeben`);
    console.log("und über den Reset-Link das Passwort setzen.");
  } else {
    console.log("\nKein E-Mail-Argument — nur Backfill ausgeführt.");
    console.log("Für einen dedizierten Account: ... seed-operator.ts operator@kickpact.de \"Name\"");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
