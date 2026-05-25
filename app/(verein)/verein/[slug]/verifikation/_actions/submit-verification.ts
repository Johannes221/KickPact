"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { createVerificationSubmission } from "@/lib/db/queries/verifications";
import { storeDocument, buildVerificationKey } from "@/lib/storage/documents";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationSubmittedEmail } from "@/lib/mail/templates/verification-submitted";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif"
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const docTypeSchema = z.enum([
  "vereinsregister_auszug",
  "vorstands_beschluss",
  "vereinssatzung",
  "mitgliederversammlung_protokoll",
  "sonstiges"
]);

const fieldsSchema = z.object({
  clubSlug: z.string().min(1),
  submitterRole: z.string().min(2).max(120),
  submitterFullName: z.string().min(2).max(200),
  docType: docTypeSchema,
  submitterNotes: z.string().max(500).optional()
});

export type SubmitVerificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitVerificationAction(
  formData: FormData
): Promise<SubmitVerificationResult> {
  const user = await requireUser();

  const fieldsRaw = {
    clubSlug: String(formData.get("clubSlug") ?? ""),
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
    return {
      ok: false,
      error: "Nur PDF, JPEG, PNG oder HEIC sind zugelassen."
    };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "Datei darf max. 10 MB groß sein." };
  }

  // Resolve clubId from slug (assertClubAccess overkill here — onboarding
  // user just created the club, they own it by virtue of clubMemberships).
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.slug, parsed.data.clubSlug))
    .limit(1);
  if (!club) {
    return { ok: false, error: "Verein nicht gefunden." };
  }

  const verificationId = createId();
  const storageKey = buildVerificationKey({
    clubId: club.id,
    verificationId,
    filename: file.name
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedUrl = await storeDocument(storageKey, buffer, file.type);

  await createVerificationSubmission({
    clubId: club.id,
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

  const mail = verificationSubmittedEmail({ clubName: club.name });
  // Fire-and-forget — don't block the redirect on mail-send.
  resend.emails
    .send({
      from: MAIL_FROM,
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) => console.error("[verification-submitted] mail failed", err));

  // Verifikation ist seit dem 2026-05 Onboarding-Rewrite eine asynchrone
  // Aktion außerhalb des Wizards. Nach Submit landet der User zurück im
  // Vereins-Dashboard, wo der VerificationBanner jetzt den "pending" Status zeigt.
  redirect(`/verein/${encodeURIComponent(parsed.data.clubSlug)}`);
}
