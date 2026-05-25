/**
 * Audit 2026-05-24 Phase 4 / Task 4.2: DSGVO Art. 17 — Account-Anonymisierung.
 *
 * Tägliche Function. User mit `deletion_requested_at < now - 14d`:
 *   - email → "deleted-<userId>@kickpact.invalid"  (NULL geht nicht — Better Auth notNull + unique)
 *   - name → "Gelöschter Nutzer"
 *   - image → NULL
 *   - sessions → CASCADE-delete (user.id → sessions.user_id)
 *   - accounts (OAuth tokens) → CASCADE-delete
 *
 * KickPact behält invoices/charges für § 147 AO (10 J), aber der Sponsor-
 * Anzeigename wird auch anonymisiert. Pledges bleiben mit anonymisiertem
 * Sponsor-Profil verknüpft.
 *
 * Cron: täglich 04:00 UTC (nach Session-Cleanup).
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { users, sponsors, accounts, sessions } from "@/lib/db/schema";

const COOLDOWN_DAYS = 14;
const DELETED_EMAIL_DOMAIN = "kickpact.invalid";
const DELETED_NAME = "Gelöschter Nutzer";
const DELETED_SPONSOR_DISPLAY = "Gelöschter Sponsor";

export const anonymizeAccounts = inngest.createFunction(
  { id: "anonymize-accounts", concurrency: { limit: 1 } },
  { cron: "0 4 * * *" }, // täglich 04:00 UTC
  async ({ step, logger }) => {
    const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    const due = await step.run("find-due-accounts", () =>
      db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            isNotNull(users.deletionRequestedAt),
            lt(users.deletionRequestedAt, cutoff)
          )
        )
    );

    if (due.length === 0) {
      logger.info("anonymize-accounts: nothing due");
      return { anonymized: 0 };
    }

    let anonymized = 0;
    for (const u of due) {
      await step.run(`anon-${u.id}`, async () => {
        await db.transaction(async (tx) => {
          // OAuth-Accounts + Sessions löschen (kein Login mehr möglich)
          await tx.delete(accounts).where(eq(accounts.userId, u.id));
          await tx.delete(sessions).where(eq(sessions.userId, u.id));

          // Sponsor-Profile anonymisieren (Pledges bleiben gültig für Audit/Invoices)
          await tx
            .update(sponsors)
            .set({
              displayName: DELETED_SPONSOR_DISPLAY,
              businessName: null,
              businessAddressJson: null,
              businessTaxId: null,
              pledgeProxiesJson: null
            })
            .where(eq(sponsors.userId, u.id));

          // User-Row: notNull+unique email → ersetze durch tomb-stone
          // (kann nicht NULL gesetzt werden wegen Better-Auth-Schema-Constraints)
          await tx
            .update(users)
            .set({
              email: `deleted-${u.id}@${DELETED_EMAIL_DOMAIN}`,
              name: DELETED_NAME,
              image: null,
              emailVerified: false,
              deletionRequestedAt: null, // damit der Cron's-Filter den Row nicht nochmal greift
              updatedAt: new Date()
            })
            .where(eq(users.id, u.id));
        });
      });
      anonymized += 1;
    }

    logger.info("anonymize-accounts done", { anonymized, cutoff: cutoff.toISOString() });
    return { anonymized };
  }
);
