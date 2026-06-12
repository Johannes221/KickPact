"use server";

/**
 * Lizenz-Transfer Server-Actions (Spec 2026-05-26 §1.5, Phase 5 Paket B).
 *
 * requestLicenseTransfer: Vorstand (Club-Admin eines Vereins mit aktiver
 * Vereinslizenz) fragt eine autarke Mannschaft desselben realen Vereins an.
 *
 * respondLicenseTransfer: NUR der Lizenz-Inhaber (fromUserId) entscheidet:
 *   - accept_license: Branding SOFORT (teams.licensedUnderClubId), T's
 *     Stripe-Abo cancel_at_period_end, Lizenz-Flip zum effectiveAt per Cron.
 *   - accept_co_owned: Anfragender wird Mitverwalter, Lizenz bleibt bei T.
 *   - reject: alles bleibt wie es ist.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  clubHasActiveVereinLicense,
  createLicenseTransferRequest,
  getFirstClubAdmin,
  getLicenseTransferRequestById,
  grantCoOwnerMembership,
  listLicenseTransferCandidatesForClub,
  markLicenseTransferDecision,
  setTeamLicensedUnder
} from "@/lib/db/queries/license-transfers";
import { getSubscriptionForClub } from "@/lib/db/queries/subscriptions";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { licenseTransferAnfrageEmail } from "@/lib/mail/templates/license-transfer-anfrage";
import { licenseTransferEntscheidungEmail } from "@/lib/mail/templates/license-transfer-entscheidung";
import { inngest } from "@/lib/inngest/client";
import { getBaseUrl } from "@/lib/utils/base-url";

export type LicenseTransferActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const requestSchema = z.object({
  clubSlug: z.string().min(1),
  teamId: z.string().min(1)
});

export async function requestLicenseTransfer(input: {
  clubSlug: string;
  teamId: string;
}): Promise<LicenseTransferActionResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

  const { user, club } = await assertClubWriteAccess(parsed.data.clubSlug, "admin");

  if (!(await clubHasActiveVereinLicense(club.id))) {
    return {
      ok: false,
      message:
        "Dafür braucht euer Verein eine aktive Vereinslizenz. Schließe zuerst das Vereins-Abo ab."
    };
  }

  // Kandidaten-Check deckt alle Guards ab: gleiche fussballdeVereinId,
  // fremder Container, eigene autarke basic/pro-Lizenz, kein licensedUnder.
  const candidates = await listLicenseTransferCandidatesForClub(club.id);
  const candidate = candidates.find((c) => c.teamId === parsed.data.teamId);
  if (!candidate) {
    return {
      ok: false,
      message: "Diese Mannschaft kann nicht angefragt werden."
    };
  }

  // fromUserId = aktueller Lizenz-Inhaber. VEREINFACHUNG (dokumentiert in
  // getFirstClubAdmin): die team_license hängt an der Container-Subscription,
  // nicht an einem User — als Inhaber gilt der (älteste) Admin des
  // Container-Clubs der Mannschaft.
  const owner = await getFirstClubAdmin(candidate.containerClubId);
  if (!owner) {
    return {
      ok: false,
      message: "Für diese Mannschaft wurde kein verantwortlicher Inhaber gefunden."
    };
  }

  let requestId: string;
  try {
    const row = await createLicenseTransferRequest({
      teamId: candidate.teamId,
      toClubId: club.id,
      fromUserId: owner.userId,
      requestedByUserId: user.id
    });
    requestId = row.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        message: "Für diese Mannschaft läuft bereits eine offene Anfrage."
      };
    }
    throw err;
  }

  // Mail an den Inhaber — best effort, die Anfrage steht bereits.
  // (Kein In-App-Push: notification_type-Enum hat keinen license_transfer-Wert
  // und Migrationen sind in diesem Paket tabu — siehe Plan-Hinweis.)
  try {
    const mail = licenseTransferAnfrageEmail({
      trainerName: owner.name,
      teamName: candidate.teamName,
      vereinName: club.name,
      requestedByName: user.name ?? null,
      kontoUrl: `${getBaseUrl()}/konto`
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: owner.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { "Idempotency-Key": `license-transfer-request-${requestId}` }
    });
  } catch (err) {
    console.error("[license-transfer] request notification failed", err);
  }

  revalidatePath(`/verein/${parsed.data.clubSlug}/mannschaften`);
  return { ok: true, message: "Anfrage verschickt." };
}

const respondSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["accept_license", "accept_co_owned", "reject"]),
  note: z.string().max(500).optional()
});

export async function respondLicenseTransfer(input: {
  requestId: string;
  decision: "accept_license" | "accept_co_owned" | "reject";
  note?: string;
}): Promise<LicenseTransferActionResult> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

  const user = await requireUser();
  const row = await getLicenseTransferRequestById(parsed.data.requestId);
  if (!row) return { ok: false, message: "Anfrage nicht gefunden." };
  if (row.request.fromUserId !== user.id) {
    return { ok: false, message: "Nur der Lizenz-Inhaber kann entscheiden." };
  }
  if (row.request.status !== "pending") {
    return { ok: false, message: "Diese Anfrage wurde bereits entschieden." };
  }

  const { decision } = parsed.data;
  let effectiveAt: Date | null = null;
  let resultMessage = "";

  if (decision === "accept_license") {
    // (a) Branding wechselt SOFORT (Spec §1.5: Rechnung trägt ab Annahme-Tag
    //     den Vereins-Absender). Idempotent bei Retry.
    await setTeamLicensedUnder(row.request.teamId, row.request.toClubId);

    // (b) effectiveAt = current_period_end von T's Stripe-Abo. Ohne Stripe-Abo
    //     (z.B. Trial) wechselt die Lizenz sofort (effectiveAt = now).
    // (c) T's Abo läuft bis Periodenende und endet dann automatisch.
    effectiveAt = new Date();
    const sub = await getSubscriptionForClub(row.teamClubId);
    if (sub?.stripeSubscriptionId && isStripeConfigured()) {
      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      effectiveAt = extractCurrentPeriodEnd(stripeSub) ?? new Date();
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
    }
    resultMessage =
      "Angenommen. Dein Abo läuft bis zum Periodenende weiter und endet dann automatisch; das Rechnungs-Branding wechselt sofort.";
  } else if (decision === "accept_co_owned") {
    await grantCoOwnerMembership({
      userId: row.request.requestedByUserId,
      teamId: row.request.teamId,
      invitedByUserId: user.id
    });
    resultMessage = "Co-Verwaltung eingerichtet — deine Lizenz bleibt bei dir.";
  } else {
    resultMessage = "Anfrage abgelehnt.";
  }

  // (d) Status-Flip mit pending-Race-Guard (Doppelklick / paralleler Decide).
  const statusByDecision = {
    accept_license: "accepted",
    accept_co_owned: "co_owned",
    reject: "rejected"
  } as const;
  const updated = await markLicenseTransferDecision({
    requestId: row.request.id,
    status: statusByDecision[decision],
    decision,
    decidedByUserId: user.id,
    decisionNote: parsed.data.note ?? null,
    effectiveAt
  });
  if (!updated) {
    return { ok: false, message: "Diese Anfrage wurde bereits entschieden." };
  }

  // Bei sofortiger Fälligkeit (kein Stripe-Abo): Flip-Cron direkt anstoßen,
  // statt bis zum nächsten 03:30-Lauf zu warten. Best effort.
  if (decision === "accept_license" && effectiveAt && effectiveAt <= new Date()) {
    inngest
      .send({ name: "license-transfers/apply", data: { requestId: row.request.id } })
      .catch((err) => console.error("[license-transfer] inngest.send failed", err));
  }

  // Entscheidung an den Vorstand — best effort.
  try {
    const mail = licenseTransferEntscheidungEmail({
      vorstandName: row.requestedByName,
      teamName: row.teamName,
      vereinName: row.toClubName,
      decision,
      effectiveAt,
      decisionNote: parsed.data.note ?? null,
      dashboardUrl: `${getBaseUrl()}/verein/${row.toClubSlug}/mannschaften`
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: row.requestedByEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { "Idempotency-Key": `license-transfer-decision-${row.request.id}` }
    });
  } catch (err) {
    console.error("[license-transfer] decision notification failed", err);
  }

  revalidatePath("/konto");
  return { ok: true, message: resultMessage };
}

/**
 * current_period_end liegt seit neueren Stripe-API-Versionen auf den
 * Subscription-Items, nicht mehr top-level (gleiche Logik wie der
 * Stripe-Webhook in app/api/stripe/webhook/route.ts).
 */
function extractCurrentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as
    | { current_period_end?: unknown }
    | undefined;
  if (typeof item?.current_period_end === "number") {
    return new Date(item.current_period_end * 1000);
  }
  const legacy = (sub as unknown as { current_period_end?: unknown })
    .current_period_end;
  if (typeof legacy === "number") {
    return new Date(legacy * 1000);
  }
  return null;
}
