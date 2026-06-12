/**
 * Lizenz-Flip-Cron (Spec 2026-05-26 §1.5, Phase 5 Paket B).
 *
 * Bei accept_license wechselt das BRANDING sofort (teams.licensedUnderClubId,
 * gesetzt in respondLicenseTransfer), die LIZENZ aber erst zum Periodenende
 * von T's Stripe-Abo (effectiveAt). Dieser Cron zieht den technischen Flip
 * nach: team_licenses der Mannschaft wird an die Vereins-Subscription /
 * Master-License des Ziel-Vereins umgehängt (parentClubLicenseId-Mechanik,
 * vgl. getTeamLicensePlan in lib/db/queries/pledges.ts).
 *
 * Idempotenz-Anker: die bereits umgehängte team_licenses-Row — hängt sie
 * schon an der Vereins-Subscription (subscriptionClubId = toClubId), ist der
 * Request abgearbeitet und der Lauf ein No-Op. Der Request behält Status
 * 'accepted' (kein eigener applied-Status im Schema; Migration tabu).
 *
 * Täglich 03:30 UTC + Test-/Sofort-Event `license-transfers/apply`
 * (respondLicenseTransfer feuert es bei effectiveAt<=now direkt).
 */
import { inngest } from "@/lib/inngest/client";
import {
  attachTeamLicenseToVereinLicense,
  getTeamLicenseRow,
  getVereinMasterLicense,
  listDueAcceptedLicenseTransfers
} from "@/lib/db/queries/license-transfers";

export const applyLicenseTransfers = inngest.createFunction(
  { id: "apply-license-transfers", concurrency: { limit: 1 } },
  [{ cron: "30 3 * * *" }, { event: "license-transfers/apply" }],
  async ({ step, logger }) => {
    const due = await step.run("find-due-transfers", () =>
      listDueAcceptedLicenseTransfers(new Date())
    );

    if (due.length === 0) {
      logger.info("apply-license-transfers: nothing due");
      return { due: 0, flipped: 0, skipped: 0 };
    }

    let flipped = 0;
    let skipped = 0;

    for (const req of due) {
      const result = await step.run(`flip-${req.id}`, async () => {
        // Idempotenz: Lizenz hängt bereits an der Vereins-Subscription →
        // (zweiter Lauf / bereits per Event geflippt) nichts zu tun.
        const existing = await getTeamLicenseRow(req.teamId);
        if (existing && existing.subscriptionClubId === req.toClubId) {
          return { flipped: false as const, reason: "already-applied" };
        }

        const master = await getVereinMasterLicense(req.toClubId);
        await attachTeamLicenseToVereinLicense({
          teamId: req.teamId,
          toClubId: req.toClubId,
          masterLicenseId: master?.id ?? null
        });
        return { flipped: true as const, masterLicenseId: master?.id ?? null };
      });

      if (result.flipped) {
        flipped += 1;
        logger.info("license transfer applied", {
          requestId: req.id,
          teamId: req.teamId,
          toClubId: req.toClubId
        });
      } else {
        skipped += 1;
      }
    }

    return { due: due.length, flipped, skipped };
  }
);
