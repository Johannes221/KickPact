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

import { and, isNotNull, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { anonymizeUserAccount } from "@/lib/db/queries/user-admin";

const COOLDOWN_DAYS = 14;

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
      // Anonymisierungs-Logik ist mit der Operator-Sofort-Aktion geteilt
      // (lib/db/queries/user-admin.ts), damit beide Pfade identisch bleiben.
      await step.run(`anon-${u.id}`, () => anonymizeUserAccount(u.id));
      anonymized += 1;
    }

    logger.info("anonymize-accounts done", { anonymized, cutoff: cutoff.toISOString() });
    return { anonymized };
  }
);
