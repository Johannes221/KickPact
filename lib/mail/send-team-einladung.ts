import { resend, MAIL_FROM } from "./client";
import { teamEinladungEmail } from "./templates/team-einladung";

/**
 * B4 (Audit 2026-06-11): verschickt die Mitglieder-Einladung. Fehler sind NICHT
 * fatal — der Invite-Link bleibt gültig, die UI bietet den Copy-Fallback an.
 * Liefert `true` bei erfolgreichem Versand, sonst `false`.
 */
export async function sendTeamEinladungMail(args: {
  to: string;
  clubName: string;
  teamName: string | null;
  role: "admin" | "trainer" | "viewer";
  inviteUrl: string;
}): Promise<boolean> {
  try {
    const mail = teamEinladungEmail({
      clubName: args.clubName,
      teamName: args.teamName,
      role: args.role,
      inviteUrl: args.inviteUrl
    });
    const { error } = await resend.emails.send({
      from: MAIL_FROM,
      to: args.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
    if (error) {
      console.error("[team-einladung] resend error", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[team-einladung] send failed", err);
    return false;
  }
}
