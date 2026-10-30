import { getUserEmailById } from "@/lib/db/queries/account";
import { resend, MAIL_FROM } from "@/lib/mail/client";

type MailContent = { subject: string; html: string; text: string };

/**
 * Schickt dem Antragsteller die Entscheidungs-Mail und wirft bei einem
 * Provider-Fehler (`resend` liefert `{ error }` statt zu werfen — sonst still
 * verschluckt). Als `beforeCommit` an `approveRequest`/`rejectRequest`
 * (`lib/db/queries/membership-requests.ts`) übergeben, damit der Status erst
 * nach erfolgreichem Versand kippt. Kein Empfänger → No-op.
 *
 * Gemeinsam genutzt vom Club-seitigen Flow
 * (`app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`)
 * und dem Operator-Flow
 * (`app/admin/(panel)/vereine/_actions/membership-requests.ts`).
 */
export async function sendRequesterMail(
  requesterUserId: string,
  buildMail: () => MailContent
): Promise<void> {
  const requesterEmail = await getUserEmailById(requesterUserId);
  if (!requesterEmail) return;
  const mail = buildMail();
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: requesterEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (error) {
    throw new Error(`access-request mail failed: ${error.message ?? "unknown"}`);
  }
}
