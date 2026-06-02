"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  teams,
  clubs,
  clubMemberships,
  users,
  sponsorLeads
} from "@/lib/db/schema";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { generateUniqueTeamSlug } from "@/lib/db/queries/team-public-slug";
import { rateLimit, getClientIp } from "@/lib/utils/rate-limit";

const BASE_URL =
  process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

const saveProfileSchema = z.object({
  teamId: z.string().min(1),
  isPublic: z.boolean(),
  publicName: z.string().trim().max(80).optional(),
  publicTagline: z.string().trim().max(280).optional(),
  publicGoals: z.string().trim().max(600).optional()
});

/**
 * Speichert das öffentliche Profil einer Mannschaft (admin-only). Generiert
 * beim ersten Veröffentlichen einen stabilen `publicSlug`. Gibt den Slug
 * zurück, damit das UI die `/m/{slug}`-URL direkt anzeigen kann.
 */
export async function saveTeamPublicProfile(input: {
  teamId: string;
  isPublic: boolean;
  publicName?: string;
  publicTagline?: string;
  publicGoals?: string;
}): Promise<{ slug: string | null }> {
  const parsed = saveProfileSchema.parse(input);

  const [row] = await db
    .select({
      teamName: teams.name,
      publicSlug: teams.publicSlug,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, parsed.teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  // Slug nur einmal generieren — danach stabil (geteilte Links bleiben gültig).
  let slug = row.publicSlug;
  if (!slug) {
    slug = await generateUniqueTeamSlug(
      row.clubName,
      row.teamName,
      parsed.teamId
    );
  }

  await db
    .update(teams)
    .set({
      discoverable: parsed.isPublic,
      publicName: parsed.publicName || null,
      publicTagline: parsed.publicTagline || null,
      publicGoals: parsed.publicGoals || null,
      publicSlug: slug
    })
    .where(eq(teams.id, parsed.teamId));

  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${parsed.teamId}/profil`);
  revalidatePath("/sponsor/discover");
  if (slug) revalidatePath(`/m/${slug}`);

  return { slug };
}

const leadSchema = z.object({
  teamSlug: z.string().min(1),
  name: z.string().trim().min(2, "Bitte Namen angeben.").max(100),
  email: z.string().trim().email("Bitte gültige E-Mail angeben.").max(200),
  message: z.string().trim().max(1000).optional()
});

/**
 * Öffentliche „Sponsoring anfragen"-Anfrage von der `/m/{slug}`-Profilseite.
 * KEIN Auth nötig — Besucher hinterlässt Name + E-Mail (+ Nachricht). Speichert
 * einen Lead und benachrichtigt die Club-Admins per Mail (best-effort).
 */
export async function createPublicSponsorLead(input: {
  teamSlug: string;
  name: string;
  email: string;
  message?: string;
}): Promise<{ ok: true }> {
  const parsed = leadSchema.parse(input);

  // SECURITY (M5): IP-Rate-Limit für die unauthentifizierte öffentliche Action
  // (sonst Lead-/Mail-Flut an Club-Admins). 8 Leads / 10 Min / IP.
  const ip = await getClientIp();
  if (!rateLimit(`lead:${ip}`, { limit: 8, windowMs: 10 * 60_000 })) {
    throw new Error("Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen.");
  }

  const [row] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      publicName: teams.publicName,
      discoverable: teams.discoverable,
      isActive: teams.isActive,
      clubId: clubs.id,
      clubSlug: clubs.slug
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.publicSlug, parsed.teamSlug))
    .limit(1);

  if (!row || !row.discoverable || !row.isActive) {
    throw new Error("Diese Mannschaft nimmt aktuell keine Anfragen entgegen.");
  }

  const gate = await getSubscriptionGate(row.clubId);
  if (gate.isReadOnly) {
    throw new Error(
      "Diese Mannschaft ist aktuell pausiert. Sponsoring ist bald wieder möglich."
    );
  }

  await db.insert(sponsorLeads).values({
    teamId: row.teamId,
    name: parsed.name,
    email: parsed.email,
    message: parsed.message || null
  });

  // Mail an alle Club-Admins (best-effort — Lead ist bereits gespeichert).
  const admins = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(
      and(
        eq(clubMemberships.clubId, row.clubId),
        eq(clubMemberships.role, "admin")
      )
    );

  if (admins.length > 0) {
    const teamLabel = row.publicName?.trim() || row.teamName;
    const dashboardUrl = `${BASE_URL}/verein/${row.clubSlug}/sponsoren`;
    try {
      await resend.emails.send({
        from: MAIL_FROM,
        to: admins.map((a) => a.email),
        replyTo: parsed.email,
        subject: `Neue Sponsoring-Anfrage für ${teamLabel}`,
        text: `Hallo,

über euer öffentliches Profil hat jemand Interesse an einem Sponsoring für ${teamLabel}:

Name: ${parsed.name}
E-Mail: ${parsed.email}
${parsed.message ? `Nachricht: "${parsed.message}"\n` : ""}
Antworte einfach direkt auf diese Mail, um Kontakt aufzunehmen.

Euer Dashboard: ${dashboardUrl}

— KickPact`,
        html: `<p>Hallo,</p>
<p>Über euer öffentliches Profil hat jemand Interesse an einem Sponsoring für <strong>${escapeHtml(teamLabel)}</strong>.</p>
<p><strong>Name:</strong> ${escapeHtml(parsed.name)}<br>
<strong>E-Mail:</strong> <a href="mailto:${escapeHtml(parsed.email)}">${escapeHtml(parsed.email)}</a></p>
${parsed.message ? `<blockquote style="border-left:3px solid #01C457;padding:8px 12px;color:#525252">${escapeHtml(parsed.message)}</blockquote>` : ""}
<p>Antworte einfach direkt auf diese Mail, um Kontakt aufzunehmen.</p>
<p><a href="${dashboardUrl}" style="color:#01C457">Zum Dashboard →</a></p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
      });
    } catch (err) {
      console.error("[public-lead] mail to admins failed", err);
    }
  }

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
