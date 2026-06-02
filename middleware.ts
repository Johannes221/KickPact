import { NextResponse, type NextRequest } from "next/server";

/**
 * App-Entry-Gate (WS-8).
 *
 * Die native iOS-App (Capacitor) lädt die Web-App remote und würde sonst auf der
 * Marketing-Landingpage (`/`) starten — im App Store unerwünscht (Apple 4.2 +
 * Anti-Steering). Capacitor hängt `KickPactApp` an den User-Agent
 * ([capacitor.config.ts](./capacitor.config.ts)); hier leiten wir den Root im
 * App-Kontext um:
 *   - ausgeloggt → `/willkommen` (Intro-Wizard → Login)
 *   - eingeloggt → `/dashboard`
 *
 * Browser sind nicht betroffen (kein `KickPactApp` im UA) → Landingpage bleibt.
 * Die Session wird nur per Cookie-Präsenz geprüft (Routing-Hint); die echte
 * Auth-Prüfung machen die Zielseiten selbst.
 */
const APP_UA = "KickPactApp";
const SESSION_COOKIES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token"
];

export function middleware(req: NextRequest): NextResponse {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua.includes(APP_UA)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  const url = req.nextUrl.clone();
  url.pathname = hasSession ? "/dashboard" : "/willkommen";
  return NextResponse.redirect(url);
}

// Nur der Root — alle anderen Routen laufen unverändert.
export const config = {
  matcher: ["/"]
};
