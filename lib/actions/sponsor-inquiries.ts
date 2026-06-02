"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  sponsorInquiries,
  teams,
  clubs,
  clubMemberships,
  teamMemberships,
  users
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";
import { assertClubWriteAccess, resolveTeamAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { createInvitation } from "@/lib/db/queries/invitations";
import { generateUniqueTeamSlug } from "@/lib/db/queries/team-public-slug";
import { rateLimit } from "@/lib/utils/rate-limit";

const inquirySchema = z.object({
  teamId: z.string().min(1),
  message: z.string().max(500).optional()
});

/**
 * Sponsor stellt eine Anfrage an eine discoverable Mannschaft.
 * Sendet zusätzlich eine Mail an alle Club-Admins.
 */
export async function createSponsorInquiry(input: { teamId: string; message?: string }) {
  const user = await requireUser();
  const parsed = inquirySchema.parse(input);

  // SECURITY (M5): Rate-Limit pro Sponsor-User — verhindert Anfrage-Fanout
  // (eine pending pro Team, aber sonst unbegrenzt viele Teams → Mail-Flut an
  // viele Club-Admins). 20 Anfragen / Stunde / User.
  if (!rateLimit(`inquiry:${user.id}`, { limit: 20, windowMs: 60 * 60_000 })) {
    throw new Error("Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen.");
  }

  // Verify team is actually discoverable
  const [teamRow] = await db
    .select({ team: teams, club: clubs })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, parsed.teamId))
    .limit(1);
  if (!teamRow) throw new Error("Mannschaft nicht gefunden");
  if (!teamRow.team.discoverable) {
    throw new Error("Diese Mannschaft akzeptiert aktuell keine direkten Anfragen");
  }

  // Read-Only-Verein darf keine neuen Anfragen annehmen.
  const gate = await getSubscriptionGate(teamRow.club.id);
  if (gate.isReadOnly) {
    throw new Error(
      "Diese Mannschaft ist aktuell pausiert. Sponsoring ist wieder möglich, sobald das Abo reaktiviert wurde."
    );
  }

  // Prevent duplicate pending inquiry
  const [existing] = await db
    .select({ id: sponsorInquiries.id })
    .from(sponsorInquiries)
    .where(
      and(
        eq(sponsorInquiries.teamId, parsed.teamId),
        eq(sponsorInquiries.sponsorUserId, user.id),
        eq(sponsorInquiries.status, "pending")
      )
    )
    .limit(1);
  if (existing) {
    throw new Error("Du hast bereits eine offene Anfrage für diese Mannschaft");
  }

  await db.insert(sponsorInquiries).values({
    sponsorUserId: user.id,
    teamId: parsed.teamId,
    message: parsed.message ?? null
  });

  // Mail an alle, die diese Mannschaft verwalten: Club-Admins (vereinsgeführt)
  // UND direkte Team-Admins (team-only geführte Mannschaften — z.B. eine fremd
  // verwaltete Mannschaft in einem anderen Container-Verein). Sonst landet die
  // Anfrage bei einem Team-Admin, der kein Club-Admin ist, im Nichts.
  const [clubAdminEmails, teamAdminEmails] = await Promise.all([
    db
      .select({ email: users.email })
      .from(clubMemberships)
      .innerJoin(users, eq(clubMemberships.userId, users.id))
      .where(
        and(eq(clubMemberships.clubId, teamRow.club.id), eq(clubMemberships.role, "admin"))
      ),
    db
      .select({ email: users.email })
      .from(teamMemberships)
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(
        and(eq(teamMemberships.teamId, parsed.teamId), eq(teamMemberships.role, "admin"))
      )
  ]);
  const adminEmails = [
    ...new Set([...clubAdminEmails, ...teamAdminEmails].map((a) => a.email))
  ].map((email) => ({ email }));

  if (adminEmails.length > 0) {
    const dashboardUrl = `${process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev"}/verein/${teamRow.club.slug}/mannschaft/${parsed.teamId}/sponsoren`;
    try {
      await resend.emails.send({
        from: MAIL_FROM,
        to: adminEmails.map((a) => a.email),
        subject: `Neue Sponsor-Anfrage für ${teamRow.team.name}`,
        text: `Hallo,

ein Sponsor möchte ${teamRow.team.name} unterstützen:

${parsed.message ? `Nachricht: "${parsed.message}"\n\n` : ""}Im Dashboard ansehen + entscheiden:
${dashboardUrl}

— KickPact`,
        html: `<p>Hallo,</p>
<p>Ein Sponsor möchte <strong>${teamRow.team.name}</strong> unterstützen.</p>
${parsed.message ? `<blockquote style="border-left:3px solid #01C457;padding:8px 12px;color:#525252">${parsed.message}</blockquote>` : ""}
<p><a href="${dashboardUrl}" style="background:#01C457;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Anfrage im Dashboard ansehen →</a></p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
      });
    } catch (err) {
      console.error("[inquiry] mail to admins failed", err);
    }
  }

  // Push/In-App-Benachrichtigung an Club-Admins (additiv, best-effort).
  try {
    await inngest.send({
      name: "notification/sponsor-inquiry",
      data: {
        teamId: parsed.teamId,
        clubId: teamRow.club.id,
        clubSlug: teamRow.club.slug,
        teamName: teamRow.team.name
      }
    });
  } catch (err) {
    console.error("[inquiry] inngest.send failed", err);
  }

  revalidatePath("/sponsor/discover");
  revalidatePath(`/verein/${teamRow.club.slug}/sponsoren`);
  revalidatePath(`/verein/${teamRow.club.slug}/mannschaft/${parsed.teamId}/sponsoren`);
}

const respondSchema = z.object({
  inquiryId: z.string().min(1),
  accept: z.boolean(),
  responseMessage: z.string().max(500).optional()
});

/**
 * Mannschafts-Admin akzeptiert oder lehnt ab. Bei accept: KickPact erzeugt
 * einen Einladungslink und mailt ihn an den Sponsor.
 */
export async function respondToInquiry(input: {
  inquiryId: string;
  accept: boolean;
  responseMessage?: string;
}) {
  const user = await requireUser();
  const parsed = respondSchema.parse(input);

  const [row] = await db
    .select({
      inquiry: sponsorInquiries,
      team: teams,
      club: clubs,
      sponsorEmail: users.email,
      sponsorName: users.name
    })
    .from(sponsorInquiries)
    .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(users, eq(sponsorInquiries.sponsorUserId, users.id))
    .where(eq(sponsorInquiries.id, parsed.inquiryId))
    .limit(1);
  if (!row) throw new Error("Anfrage nicht gefunden");

  // Team-aware Autorisierung: Club-Admin (vereinsgeführt) ODER direkter
  // Team-Admin (team-only geführte Mannschaft) darf antworten. assertClub-
  // WriteAccess hätte einen reinen Team-Admin (kein Club-Mitglied im Container-
  // Verein der Mannschaft) fälschlich abgewiesen.
  const access = await resolveTeamAccess(user.id, row.team.id, "admin");
  if (!access.granted) {
    throw new Error("Du bist nicht berechtigt, diese Anfrage zu beantworten.");
  }

  if (row.inquiry.status !== "pending") {
    throw new Error("Diese Anfrage wurde bereits beantwortet");
  }

  // Annehmen erzeugt eine Einladung (= neues Sponsoring) → im Read-Only-Modus
  // blockieren. Ablehnen ist immer erlaubt (räumt nur die Inbox auf).
  if (parsed.accept) {
    const gate = await getSubscriptionGate(row.club.id);
    if (gate.isReadOnly) {
      throw new Error(
        "Diese Mannschaft ist im Read-Only-Modus. Bitte Abo reaktivieren."
      );
    }
  }

  await db
    .update(sponsorInquiries)
    .set({
      status: parsed.accept ? "accepted" : "rejected",
      responseMessage: parsed.responseMessage ?? null,
      respondedAt: new Date(),
      respondedBy: user.id
    })
    .where(eq(sponsorInquiries.id, parsed.inquiryId));

  if (parsed.accept) {
    // Erzeuge Einladungs-Token + mail an Sponsor.
    // Nutzt createInvitation-Helper (setzt korrekt expiresAt = +30d und
    // einen base64url-Token statt cuid2 — konsistent mit allen anderen
    // Invitations-Pfaden seit Audit 2026-05-24).
    const invitation = await createInvitation({
      teamId: row.team.id,
      createdByUserId: user.id
    });
    const token = invitation.token;

    const inviteUrl = `${process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev"}/einladung/${token}`;
    try {
      await resend.emails.send({
        from: MAIL_FROM,
        to: row.sponsorEmail,
        subject: `Deine Sponsor-Anfrage für ${row.team.name} wurde angenommen`,
        text: `Hi ${row.sponsorName ?? ""},

${row.team.name} (${row.club.name}) hat deine Anfrage angenommen!

${parsed.responseMessage ? `Nachricht der Mannschaft: "${parsed.responseMessage}"\n\n` : ""}Lege jetzt deinen Pledge an:
${inviteUrl}

— KickPact`,
        html: `<p>Hi ${row.sponsorName ?? ""},</p>
<p><strong>${row.team.name}</strong> (${row.club.name}) hat deine Anfrage angenommen!</p>
${parsed.responseMessage ? `<blockquote style="border-left:3px solid #01C457;padding:8px 12px;color:#525252">${parsed.responseMessage}</blockquote>` : ""}
<p><a href="${inviteUrl}" style="background:#01C457;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Jetzt Pledge anlegen →</a></p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
      });
    } catch (err) {
      console.error("[inquiry] accept mail failed", err);
    }
  } else {
    // Reject — kurz Bescheid geben
    try {
      await resend.emails.send({
        from: MAIL_FROM,
        to: row.sponsorEmail,
        subject: `Deine Sponsor-Anfrage für ${row.team.name}`,
        text: `Hi ${row.sponsorName ?? ""},

${row.team.name} hat deine Sponsor-Anfrage leider abgelehnt.${parsed.responseMessage ? ` Nachricht: "${parsed.responseMessage}"` : ""}

Du kannst auf KickPact andere Mannschaften entdecken: ${process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev"}/sponsor/discover

— KickPact`,
        html: `<p>Hi ${row.sponsorName ?? ""},</p>
<p><strong>${row.team.name}</strong> hat deine Sponsor-Anfrage leider abgelehnt.</p>
${parsed.responseMessage ? `<blockquote style="border-left:3px solid #ccc;padding:8px 12px;color:#525252">${parsed.responseMessage}</blockquote>` : ""}
<p>Auf <a href="${process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev"}/sponsor/discover">KickPact Discover</a> findest du weitere Mannschaften.</p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
      });
    } catch (err) {
      console.error("[inquiry] reject mail failed", err);
    }
  }

  revalidatePath(`/verein/${row.club.slug}/sponsoren`);
  revalidatePath(`/verein/${row.club.slug}/mannschaft/${row.team.id}/sponsoren`);
  revalidatePath("/sponsor/discover");
}

/**
 * Discoverable-Flag eines Teams setzen (Admin-only).
 */
export async function setTeamDiscoverable(input: {
  teamId: string;
  discoverable: boolean;
  publicTagline?: string;
}) {
  const user = await requireUser();
  void user; // assertClubAccess validates ownership
  const [teamRow] = await db
    .select({
      clubSlug: clubs.slug,
      clubName: clubs.name,
      teamName: teams.name,
      publicSlug: teams.publicSlug
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, input.teamId))
    .limit(1);
  if (!teamRow) throw new Error("Mannschaft nicht gefunden");
  await assertClubWriteAccess(teamRow.clubSlug, "admin");

  // Beim Öffentlich-Schalten einen stabilen Slug erzeugen, damit die Mannschaft
  // sofort eine teilbare /m/{slug}-URL hat (egal über welchen Toggle).
  let publicSlug = teamRow.publicSlug;
  if (input.discoverable && !publicSlug) {
    publicSlug = await generateUniqueTeamSlug(
      teamRow.clubName,
      teamRow.teamName,
      input.teamId
    );
  }

  await db
    .update(teams)
    .set({
      discoverable: input.discoverable,
      publicTagline: input.publicTagline ?? null,
      publicSlug
    })
    .where(eq(teams.id, input.teamId));

  revalidatePath(`/verein/${teamRow.clubSlug}`);
  revalidatePath("/sponsor/discover");
  if (publicSlug) revalidatePath(`/m/${publicSlug}`);
}
