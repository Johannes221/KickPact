"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { requireUser } from "@/lib/auth/session";
import { createTeamVerificationSubmission } from "@/lib/db/queries/verifications";
import { getTeamBasicById } from "@/lib/db/queries/team-lifecycle";
import { storeDocument, buildTeamVerificationKey } from "@/lib/storage/documents";
import { assertTeamAccess } from "@/lib/auth/scope";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationSubmittedEmail } from "@/lib/mail/templates/verification-submitted";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif"
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const docTypeSchema = z.enum([
  "trainer_license",
  "club_letter",
  "team_photo",
  "fussballde_entry",
  "sonstiges"
]);

const fieldsSchema = z.object({
  clubSlug: z.string().min(1),
  teamId: z.string().min(1),
  submitterRole: z.string().min(2).max(120),
  submitterFullName: z.string().min(2).max(200),
  docType: docTypeSchema,
  submitterNotes: z.string().max(500).optional()
});

export type SubmitTeamVerificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitTeamVerificationAction(
  formData: FormData
): Promise<SubmitTeamVerificationResult> {
  const user = await requireUser();

  const fieldsRaw = {
    clubSlug: String(formData.get("clubSlug") ?? ""),
    teamId: String(formData.get("teamId") ?? ""),
    submitterRole: String(formData.get("submitterRole") ?? ""),
    submitterFullName: String(formData.get("submitterFullName") ?? ""),
    docType: String(formData.get("docType") ?? ""),
    submitterNotes: formData.get("submitterNotes")
      ? String(formData.get("submitterNotes"))
      : undefined
  };
  const parsed = fieldsSchema.safeParse(fieldsRaw);
  if (!parsed.success) {
    return { ok: false, error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const file = formData.get("docFile");
  if (!(file instanceof File)) {
    return { ok: false, error: "Bitte eine Datei hochladen." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "Nur PDF, JPEG, PNG oder HEIC sind zugelassen." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "Datei darf max. 10 MB groß sein." };
  }

  // Access-Check über Team-Scope: Mannschaftsadmin ohne Club-Membership soll
  // auch einreichen können.
  await assertTeamAccess(parsed.data.teamId, "admin");

  const team = await getTeamBasicById(parsed.data.teamId);
  if (!team) return { ok: false, error: "Mannschaft nicht gefunden." };

  const verificationId = createId();
  const storageKey = buildTeamVerificationKey({
    teamId: team.id,
    verificationId,
    filename: file.name
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedUrl = await storeDocument(storageKey, buffer, file.type);

  await createTeamVerificationSubmission({
    teamId: team.id,
    submittedByUserId: user.id,
    docType: parsed.data.docType,
    docFilename: file.name,
    docStorageKey: storedUrl,
    docMimeType: file.type,
    docSizeBytes: file.size,
    submitterRole: parsed.data.submitterRole,
    submitterFullName: parsed.data.submitterFullName,
    submitterNotes: parsed.data.submitterNotes ?? null
  });

  // Mail-Bestätigung (Reuse Verein-Template — clubName-Slot mit
  // Mannschafts-Name).
  const mail = verificationSubmittedEmail({ clubName: team.name });
  resend.emails
    .send({
      from: MAIL_FROM,
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) =>
      console.error("[team-verification-submitted] mail failed", err)
    );

  redirect(
    `/verein/${encodeURIComponent(parsed.data.clubSlug)}/mannschaft/${team.id}`
  );
}
