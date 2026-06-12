/**
 * Lizenz-Transfer-Entscheidung (Spec 2026-05-26 §1.5, Phase 5 Paket B):
 * Mail an den anfragenden Vorstand, sobald der Lizenz-Inhaber der Mannschaft
 * entschieden hat (Annehmen / Co-Verwaltung / Ablehnen).
 */
import type { LicenseTransferDecision } from "@/lib/db/schema/license-transfers";

export function licenseTransferEntscheidungEmail(args: {
  vorstandName?: string | null;
  teamName: string;
  vereinName: string;
  decision: LicenseTransferDecision;
  /** Nur bei accept_license: wann die Lizenz technisch wechselt. */
  effectiveAt?: Date | null;
  decisionNote?: string | null;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const { vorstandName, teamName, vereinName, decision, effectiveAt, decisionNote, dashboardUrl } =
    args;
  const hi = vorstandName ? `Hi ${vorstandName},` : "Hi,";

  const effectiveLabel = effectiveAt
    ? new Date(effectiveAt).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
    : null;

  let outcomeShort: string;
  let outcomeText: string;
  if (decision === "accept_license") {
    outcomeShort = "angenommen";
    outcomeText = `„${teamName}" wechselt unter die Vereinslizenz von ${vereinName}. Das Rechnungs-Branding ist ab sofort umgestellt; das bisherige Mannschafts-Abo läuft bis zum Periodenende${effectiveLabel ? ` (${effectiveLabel})` : ""} und endet dann automatisch — ab dann deckt eure Vereinslizenz die Mannschaft ab.`;
  } else if (decision === "accept_co_owned") {
    outcomeShort = "Co-Verwaltung angeboten";
    outcomeText = `„${teamName}" bleibt bei der bisherigen Mannschaftslizenz, aber du hast jetzt Mitverwalter-Zugriff auf die Mannschaft.`;
  } else {
    outcomeShort = "abgelehnt";
    outcomeText = `Die Anfrage für „${teamName}" wurde abgelehnt. Die Mannschaft bleibt eigenständig.`;
  }

  const noteBlock = decisionNote ? `\n\nNachricht: „${decisionNote}"` : "";

  return {
    subject: `Lizenz-Anfrage für ${teamName}: ${outcomeShort}`,
    text: `${hi}

es gibt eine Entscheidung zu eurer Lizenz-Anfrage: ${outcomeText}${noteBlock}

Zum Dashboard: ${dashboardUrl}

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 22px; margin: 0 0 8px;">Lizenz-Anfrage ${escapeHtml(outcomeShort)}</h1>
      <p style="color: #525252; margin: 0 0 16px;">${escapeHtml(hi)}</p>
      <p style="color: #525252; margin: 0 0 16px;">${escapeHtml(outcomeText)}</p>
      ${decisionNote ? `<p style="color: #525252; margin: 0 0 16px;">Nachricht: <em>„${escapeHtml(decisionNote)}"</em></p>` : ""}
      <a href="${dashboardUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Zum Dashboard</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, öffne diese URL: <a href="${dashboardUrl}" style="color:#a3a3a3;">${dashboardUrl}</a></p>
    </td></tr>
  </table>
</body></html>`
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
