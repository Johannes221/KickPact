import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailUnsubscribeToken } from "@/lib/auth/email-unsubscribe-token";
import { setEmailRecurring } from "@/lib/db/queries/notifications";

/**
 * List-Unsubscribe-Endpoint (RFC 8058).
 *
 *  - POST: One-Click aus dem Mail-Client (Header `List-Unsubscribe-Post`).
 *          Kein Login — der signierte Token IS die Autorisierung. 200 = ok.
 *  - GET:  Mensch klickt den sichtbaren „Abmelden"-Link → gleiche Aktion,
 *          gibt eine kleine Bestätigungs-Seite zurück.
 *
 * Wirkung: `notification_settings.email_recurring = false` → keine
 * wiederkehrenden Mails (Reminder/Renewal) mehr. Transaktionale Mails
 * (Rechnung, Verifikation) laufen weiter. Idempotent.
 */

export const dynamic = "force-dynamic";

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · KickPact</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#F5F8F5;margin:0;padding:48px 20px;">
  <table style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;">
    <tr><td>
      <h1 style="font-size:22px;margin:0 0 12px;color:#1A1A2E;">${title}</h1>
      <p style="color:#525252;margin:0 0 20px;line-height:1.5;">${message}</p>
      <a href="/konto/benachrichtigungen" style="display:inline-block;background:#01C457;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Einstellungen öffnen</a>
    </td></tr>
  </table>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function applyUnsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { userId } = verifyEmailUnsubscribeToken(token);
    await setEmailRecurring(userId, false);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ok = await applyUnsubscribe(req.nextUrl.searchParams.get("token"));
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "invalid_token" }, { status: 400 });
}

export async function GET(req: NextRequest): Promise<Response> {
  const ok = await applyUnsubscribe(req.nextUrl.searchParams.get("token"));
  return ok
    ? page(
        "Abgemeldet",
        "Du bekommst keine wiederkehrenden E-Mail-Erinnerungen mehr. Wichtige Mails wie Rechnungen erhältst du weiterhin. Du kannst das jederzeit wieder aktivieren.",
        200
      )
    : page(
        "Link ungültig",
        "Dieser Abmelde-Link ist ungültig oder abgelaufen. In deinen Einstellungen kannst du E-Mail-Erinnerungen direkt steuern.",
        400
      );
}
