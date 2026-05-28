interface PendingItem {
  teamName: string;
  clubName: string;
  eventLabel: string;
  amountEur: string;
  matchDate: string;
  /** Token-Link für direktes Bestätigen aus der Mail (optional) */
  confirmUrl?: string;
  /** Token-Link für direktes Bestreiten aus der Mail (optional) */
  disputeUrl?: string;
}

export function approvalReminderEmail(args: {
  sponsorName: string;
  pendingCount: number;
  items: PendingItem[];
  inboxUrl: string;
}): { subject: string; html: string; text: string } {
  const { sponsorName, pendingCount, items, inboxUrl } = args;
  const greet = sponsorName || "Hi";

  const listText = items
    .slice(0, 5)
    .map((i) => {
      const line = `- ${i.matchDate}: ${i.clubName} / ${i.teamName} — ${i.eventLabel} = ${i.amountEur}`;
      const actions =
        i.confirmUrl && i.disputeUrl
          ? `\n  Bestätigen: ${i.confirmUrl}\n  Bestreiten: ${i.disputeUrl}`
          : "";
      return line + actions;
    })
    .join("\n");

  const listHtml = items
    .slice(0, 5)
    .map((i) => {
      const actions =
        i.confirmUrl && i.disputeUrl
          ? `<div style="margin-top:8px;display:flex;gap:8px;">
              <a href="${i.confirmUrl}" style="display:inline-block;background:#01C457;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;font-size:13px;font-weight:600;">✅ Bestätigen</a>
              <a href="${i.disputeUrl}" style="display:inline-block;background:#fff;color:#dc2626;border:1px solid #dc2626;text-decoration:none;padding:7px 14px;border-radius:6px;font-size:13px;font-weight:600;">❌ Anfechten</a>
            </div>`
          : "";
      return `<li style="margin:12px 0;list-style:none;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:13px;color:#1A1A2E;">
          <strong>${i.matchDate}</strong> · ${i.clubName} / ${i.teamName} · ${i.eventLabel}
          → <strong style="color:#01C457;">${i.amountEur}</strong>
        </div>
        ${actions}
      </li>`;
    })
    .join("");

  return {
    subject: `${pendingCount} Event${pendingCount === 1 ? "" : "s"} zur Bestätigung bei KickPact`,
    text: `Hi ${greet},

du hast ${pendingCount} ${pendingCount === 1 ? "Event" : "Events"} in deiner KickPact-Inbox, die der Verein gemeldet hat und auf deine Bestätigung warten:

${listText}

${items.length > 5 ? `... und ${items.length - 5} weitere.\n` : ""}
Du kannst Events direkt über die Links oben bestätigen oder anfechten — kein Login nötig.
Oder öffne deine Inbox: ${inboxUrl}

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#F5F8F5;padding:40px 20px;">
  <table style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;">
    <tr><td>
      <h1 style="font-size:24px;margin:0 0 8px;color:#1A1A2E;">KickPact-Inbox</h1>
      <p style="color:#525252;margin:0 0 16px;">Hi ${greet}, ${pendingCount} ${pendingCount === 1 ? "Event wartet" : "Events warten"} auf deine Bestätigung — du kannst direkt aus dieser Mail antworten:</p>
      <ul style="padding:0;margin:0;">${listHtml}</ul>
      ${items.length > 5 ? `<p style="font-size:13px;color:#525252;margin-top:8px;">... und ${items.length - 5} weitere in deiner Inbox.</p>` : ""}
      <p style="margin-top:20px;font-size:13px;color:#525252;">Alle Events auf einmal ansehen:</p>
      <a href="${inboxUrl}" style="display:inline-block;background:#01C457;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">Inbox öffnen</a>
      <p style="color:#a3a3a3;font-size:12px;margin-top:28px;">Bestätigte Beträge landen auf der nächsten Monats-Rechnung. Bestrittene Charges werden storniert.</p>
    </td></tr>
  </table>
</body></html>`
  };
}
