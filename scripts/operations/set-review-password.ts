/**
 * Setzt ein Passwort auf einen bestehenden Account (für den App-Store-Review-
 * Zugang / Operator). Nutzt better-auths EIGENES Hashing (auth.$context.password.
 * hash), damit `signIn.email` das Passwort später akzeptiert — kein manuelles
 * Hash-Format nachbauen. Legt den Credential-Account (providerId="credential")
 * an bzw. aktualisiert ihn.
 *
 *   DATABASE_URL=<ziel> npx tsx scripts/operations/set-review-password.ts <email> <passwort>
 */
import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { db } from "../../lib/db/client";
import { users, accounts } from "../../lib/db/schema/auth";

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  if (!emailArg || !passwordArg) {
    console.error('Aufruf: set-review-password.ts <email> <passwort (>=12 Zeichen)>');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  if (passwordArg.length < 12) {
    console.error("Passwort muss >= 12 Zeichen haben (minPasswordLength).");
    process.exit(1);
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`Kein User mit ${email} gefunden. Erst den Account/Seed anlegen.`);
    process.exit(1);
  }

  // better-auths eigenes Default-Hashing (identisch zu dem, was signIn.email
  // beim Login verifiziert — die Auth-Config setzt keinen eigenen Hasher).
  const hashed = await hashPassword(passwordArg);

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(accounts.id, existing.id));
    console.log(`Passwort aktualisiert für ${email}.`);
  } else {
    await db.insert(accounts).values({
      id: createId(),
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hashed
    });
    console.log(`Credential-Account + Passwort angelegt für ${email}.`);
  }
  console.log("Login jetzt per E-Mail + Passwort möglich (signIn.email).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
