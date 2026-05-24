"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships, teams, users } from "@/lib/db/schema";
import { createRequest } from "@/lib/db/queries/membership-requests";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestEmail } from "@/lib/mail/templates/access-request";

const inputSchema = z.object({
  clubSlug: z.string().min(1),
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).nullable()
});

export type RequestClubAccessInput = z.infer<typeof inputSchema>;

export async function requestClubAccessAction(input: RequestClubAccessInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Ungültige Eingabe" };
  }
  const user = await requireUser();

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, parsed.data.clubSlug))
    .limit(1);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  // If the user already has any club membership, redirect them to the club
  // instead of creating a duplicate request.
  const [existing] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id)))
    .limit(1);
  if (existing) {
    return { ok: true as const, alreadyMember: true, clubSlug: club.slug };
  }

  let req;
  try {
    req = await createRequest({
      userId: user.id,
      clubId: club.id,
      requestedRole: parsed.data.requestedRole,
      requestedTeamId: parsed.data.requestedTeamId,
      message: parsed.data.message
    });
  } catch {
    // Likely a duplicate-pending unique violation — surface a friendly message.
    return {
      ok: false as const,
      error: "Du hast für diesen Verein bereits eine offene Anfrage."
    };
  }

  await notifyAdmins({
    clubId: club.id,
    clubSlug: club.slug,
    clubName: club.name,
    requesterEmail: user.email,
    requestedRole: parsed.data.requestedRole,
    requestedTeamId: parsed.data.requestedTeamId,
    message: parsed.data.message
  });

  revalidatePath("/onboarding/zugriff-anfragen");
  return { ok: true as const, alreadyMember: false, requestId: req.id };
}

async function notifyAdmins(args: {
  clubId: string;
  clubSlug: string;
  clubName: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamId: string | null;
  message: string | null;
}): Promise<void> {
  // Fetch admin emails via clubMemberships → users join
  const adminRows = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(and(eq(clubMemberships.clubId, args.clubId), eq(clubMemberships.role, "admin")));

  let teamName: string | null = null;
  if (args.requestedTeamId) {
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, args.requestedTeamId))
      .limit(1);
    teamName = team?.name ?? null;
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reviewUrl = `${base}/verein/${args.clubSlug}/einstellungen/mitglieder`;

  const mail = accessRequestEmail({
    clubName: args.clubName,
    requesterEmail: args.requesterEmail,
    requestedRole: args.requestedRole,
    requestedTeamName: teamName,
    message: args.message,
    reviewUrl
  });

  await Promise.all(
    adminRows.map((a) =>
      resend.emails.send({
        from: MAIL_FROM,
        to: a.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      })
    )
  );
}
