"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { requireUser } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";
import { createRequest, isClubMember } from "@/lib/db/queries/membership-requests";
import { getClubBySlug } from "@/lib/db/queries/club-admin";
import { getTeamNameById } from "@/lib/db/queries/team-lifecycle";
import { listClubAdminEmails } from "@/lib/db/queries/notification-recipients";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestEmail } from "@/lib/mail/templates/access-request";
import { storeDocument, buildVerificationKey } from "@/lib/storage/documents";

const inputSchema = z.object({
  clubSlug: z.string().min(1),
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).nullable(),
  isConflictClaim: z.boolean().optional().default(false)
});

export async function requestClubAccessAction(formData: FormData) {
  const fields = {
    clubSlug: String(formData.get("clubSlug") ?? ""),
    requestedRole: String(formData.get("requestedRole") ?? "trainer") as
      | "admin"
      | "trainer"
      | "viewer",
    requestedTeamId: formData.get("requestedTeamId")
      ? String(formData.get("requestedTeamId"))
      : null,
    message: formData.get("message") ? String(formData.get("message")) : null,
    isConflictClaim: formData.get("isConflictClaim") === "true"
  };
  const parsed = inputSchema.safeParse(fields);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };

  const user = await requireUser();
  const club = await getClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  if (await isClubMember(user.id, club.id)) {
    return { ok: true as const, alreadyMember: true, clubSlug: club.slug };
  }

  // Conflict-claim path: Bescheinigung ist OPTIONAL. Wenn eine Datei mitkommt,
  // wird sie validiert + gespeichert (stärkt die Anfrage); fehlt sie, läuft die
  // Konflikt-Anfrage trotzdem durch — die Admins entscheiden dann ohne Nachweis.
  let conflictDocStorageKey: string | null = null;
  const file = parsed.data.isConflictClaim ? formData.get("conflictDoc") : null;
  if (parsed.data.isConflictClaim && file instanceof File) {
    const ALLOWED = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif"
    ]);
    if (!ALLOWED.has(file.type)) {
      return { ok: false as const, error: "Nur PDF, JPEG, PNG oder HEIC." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false as const, error: "Datei max. 10 MB." };
    }
    const conflictId = createId();
    const key = buildVerificationKey({
      clubId: club.id,
      verificationId: `conflict-${conflictId}`,
      filename: file.name
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    conflictDocStorageKey = await storeDocument(key, buffer, file.type);
  }

  let req;
  try {
    req = await createRequest({
      userId: user.id,
      clubId: club.id,
      requestedRole: parsed.data.requestedRole,
      requestedTeamId: parsed.data.requestedTeamId,
      message: parsed.data.message,
      isConflictClaim: parsed.data.isConflictClaim,
      conflictDocStorageKey
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

  // Push/In-App-Benachrichtigung an Admins (additiv, best-effort).
  try {
    await inngest.send({
      name: "notification/access-request",
      data: {
        clubId: club.id,
        clubSlug: club.slug,
        clubName: club.name,
        requestedTeamId: parsed.data.requestedTeamId,
        requesterEmail: user.email,
        requestedRole: parsed.data.requestedRole
      }
    });
  } catch (err) {
    console.error("[access-request] inngest.send failed", err);
  }

  revalidatePath("/onboarding/zugriff-anfragen");
  return {
    ok: true as const,
    alreadyMember: false,
    requestId: req.id,
    isConflictClaim: parsed.data.isConflictClaim
  };
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
  const adminEmails = await listClubAdminEmails(args.clubId);

  let teamName: string | null = null;
  if (args.requestedTeamId) {
    teamName = await getTeamNameById(args.requestedTeamId);
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
    adminEmails.map((email) =>
      resend.emails.send({
        from: MAIL_FROM,
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      })
    )
  );
}
