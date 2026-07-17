import { NextResponse, type NextRequest } from "next/server";

/**
 * Zwei Gates:
 *
 * 1. App-Entry-Gate (WS-8) auf `/`.
 *    Die native iOS-App (Capacitor) lädt die Web-App remote und würde sonst auf
 *    der Marketing-Landingpage (`/`) starten — im App Store unerwünscht (Apple
 *    4.2 + Anti-Steering). Capacitor hängt `KickPactApp` an den User-Agent
 *    ([capacitor.config.ts](./capacitor.config.ts)); hier leiten wir den Root im
 *    App-Kontext um:
 *      - ausgeloggt → `/willkommen` (Intro-Wizard → Login)
 *      - eingeloggt → `/dashboard`
 *    Browser sind nicht betroffen (kein `KickPactApp` im UA) → Landingpage bleibt.
 *
 * 2. Operator-Panel-Gate auf `/admin/*`.
 *    Der echte AuthZ-Check ist und bleibt `assertPlatformAdmin()` im
 *    Panel-Layout und in JEDER Server-Action — die Middleware kann ihn nicht
 *    ersetzen (Edge-Runtime, kein DB-Zugriff auf `is_platform_admin`). Sie ist
 *    ein zweiter Riegel gegen den einen Fehler, der sonst still durchginge: eine
 *    neue Panel-Seite, die den Layout-Guard umgeht. Ohne Session-Cookie kommt
 *    hier gar nichts erst bis zur Route.
 *
 * Die Session wird in beiden Fällen nur per Cookie-Präsenz geprüft
 * (Routing-Hint, nicht Autorisierung) — die echte Prüfung machen die Zielseiten.
 */
const APP_UA = "KickPactApp";
const SESSION_COOKIES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token"
];

/** Öffentlich erreichbare Admin-Routen (Login-Flow selbst). */
const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password"
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => req.cookies.has(name));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.next();
    }
    if (!hasSessionCookie(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua.includes(APP_UA)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = hasSessionCookie(req) ? "/dashboard" : "/willkommen";
  return NextResponse.redirect(url);
}

// Root (App-Entry-Gate) + Panel-Gate. Alle anderen Routen laufen unverändert.
export const config = {
  matcher: ["/", "/admin/:path*"]
};
