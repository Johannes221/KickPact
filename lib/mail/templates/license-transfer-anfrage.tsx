/**
 * Lizenz-Transfer-Anfrage (Spec 2026-05-26 §1.5, Phase 5 Paket B):
 * Mail an den Lizenz-Inhaber der Mannschaft (T), wenn ein Vereins-Vorstand
 * anfragt, die Mannschaft unter die Vereinslizenz zu nehmen. Entscheidung
 * (Annehmen / Co-Verwaltung / Ablehnen) läuft über „Mein Konto".
 */
export function licenseTransferAnfrageEmail(args: {
  trainerName?: string | null;
  teamName: string;
  vereinName: string;
  requestedByName?: string | null;
  kontoUrl: string;
}): { subject: string; html: string; text: string } {
  const { trainerName, teamName, vereinName, requestedByName, kontoUrl } = args;
  const hi = trainerName ? `Hi ${trainerName},` : "Hi,";
  const wer = requestedByName ? `${requestedByName} (${vereinName})` : vereinName;

  return {
    subject: `${vereinName} möchte ${teamName} unter die Vereinslizenz nehmen`,
    text: `${hi}

${wer} möchte deine Mannschaft „${teamName}" unter die Vereinslizenz des Vereins aufnehmen.

Du hast drei Möglichkeiten:
  1. Annehmen — der Verein übernimmt die Lizenz. Dein Abo läuft bis zum Periodenende weiter und endet dann automatisch; das Rechnungs-Branding wechselt sofort auf den Verein.
  2. Co-Verwaltung — du behältst Lizenz und Abo, der Vorstand bekommt Mitverwalter-Zugriff auf die Mannschaft.
  3. Ablehnen — alles bleibt wie es ist.

Jetzt entscheiden: ${kontoUrl}

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 22px; margin: 0 0 8px;">Anfrage zur Vereinslizenz</h1>
      <p style="color: #525252; margin: 0 0 16px;">${escapeHtml(hi)}</p>
      <p style="color: #525252; margin: 0 0 16px;"><strong>${escapeHtml(wer)}</strong> möchte deine Mannschaft <strong>„${escapeHtml(teamName)}"</strong> unter die Vereinslizenz des Vereins aufnehmen.</p>
      <p style="color: #525252; margin: 0 0 8px;">Du hast drei Möglichkeiten:</p>
      <ol style="color: #525252; margin: 0 0 24px; padding-left: 20px;">
        <li style="margin-bottom:6px;"><strong>Annehmen</strong> — der Verein übernimmt die Lizenz. Dein Abo läuft bis zum Periodenende weiter und endet dann automatisch; das Rechnungs-Branding wechselt sofort auf den Verein.</li>
        <li style="margin-bottom:6px;"><strong>Co-Verwaltung</strong> — du behältst Lizenz und Abo, der Vorstand bekommt Mitverwalter-Zugriff.</li>
        <li><strong>Ablehnen</strong> — alles bleibt wie es ist.</li>
      </ol>
      <a href="${kontoUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Jetzt entscheiden</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, öffne diese URL: <a href="${kontoUrl}" style="color:#a3a3a3;">${kontoUrl}</a></p>
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
