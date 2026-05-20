interface PendingItem {
  teamName: string;
  clubName: string;
  eventLabel: string;
  amountEur: string;
  matchDate: string;
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
    .map((i) => `- ${i.matchDate}: ${i.clubName} / ${i.teamName} — ${i.eventLabel} = ${i.amountEur}`)
    .join("\n");

  const listHtml = items
    .slice(0, 5)
    .map(
      (i) =>
        `<li style="margin: 8px 0;"><strong>${i.matchDate}</strong> · ${i.clubName} / ${i.teamName} · ${i.eventLabel} → <strong style="color:#01C457;">${i.amountEur}</strong></li>`
    )
    .join("");

  return {
    subject: `${pendingCount} Event${pendingCount === 1 ? "" : "s"} zur Bestätigung bei KickPact`,
    text: `Hi ${greet},

du hast ${pendingCount} ${pendingCount === 1 ? "Event" : "Events"} in deiner KickPact-Inbox, die der Verein gemeldet hat und auf deine Bestätigung warten:

${listText}

${items.length > 5 ? `... und ${items.length - 5} weitere.\n` : ""}
Bitte kurz reinklicken: ${inboxUrl}

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#F5F8F5;padding:40px 20px;">
  <table style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;">
    <tr><td>
      <h1 style="font-size:24px;margin:0 0 8px;color:#1A1A2E;">KickPact-Inbox</h1>
      <p style="color:#525252;margin:0 0 16px;">Hi ${greet}, ${pendingCount} ${pendingCount === 1 ? "Event wartet" : "Events warten"} auf deine Bestätigung:</p>
      <ul style="padding-left:18px;color:#1A1A2E;font-size:14px;">${listHtml}</ul>
      ${items.length > 5 ? `<p style="font-size:13px;color:#525252;">... und ${items.length - 5} weitere.</p>` : ""}
      <a href="${inboxUrl}" style="display:inline-block;margin-top:16px;background:#01C457;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">Inbox öffnen</a>
      <p style="color:#a3a3a3;font-size:12px;margin-top:28px;">Du bestätigst oder bestreitest die Events einzeln. Bestätigte Beträge landen auf der nächsten Monats-Rechnung.</p>
    </td></tr>
  </table>
</body></html>`
  };
}
