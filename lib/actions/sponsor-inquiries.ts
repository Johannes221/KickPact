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
  users
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { createInvitation } from "@/lib/db/queries/invitations";

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

  // Mail an alle Admins
  const adminEmails = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(
      and(eq(clubMemberships.clubId, teamRow.club.id), eq(clubMemberships.role, "admin"))
    );

  if (adminEmails.length > 0) {
    const dashboardUrl = `${process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev"}/verein/${teamRow.club.slug}/sponsoren`;
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

  revalidatePath("/sponsor/discover");
  revalidatePath(`/verein/${teamRow.club.slug}/sponsoren`);
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
  await assertClubWriteAccess(row.club.slug, "admin");

  if (row.inquiry.status !== "pending") {
    throw new Error("Diese Anfrage wurde bereits beantwortet");
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
    .select({ clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, input.teamId))
    .limit(1);
  if (!teamRow) throw new Error("Mannschaft nicht gefunden");
  await assertClubWriteAccess(teamRow.clubSlug, "admin");

  await db
    .update(teams)
    .set({
      discoverable: input.discoverable,
      publicTagline: input.publicTagline ?? null
    })
    .where(eq(teams.id, input.teamId));

  revalidatePath(`/verein/${teamRow.clubSlug}`);
  revalidatePath("/sponsor/discover");
}
