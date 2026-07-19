import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Capacitor-Konfiguration für die KickPact-iOS-App (WebView-Wrapper).
 *
 * `server.url` lädt die deployte Web-App **remote** — KickPact ist server-zentriert
 * (Server Components / Server Actions brauchen den laufenden Next-Server), es gibt
 * keinen statisch exportierbaren Client. Der WebView ist die native Hülle + Bridge
 * zu nativen Plugins (Push, später IAP).
 *
 * URL ist env-gesteuert:
 *   - Default (Dev/Testing): Staging `https://kickpact.schartl.dev`
 *   - Prod-Build: `npm run ios:sync:prod` (setzt CAP_SERVER_URL fest)
 *
 * WICHTIG (Review 2026-07-10): `server.url` MUSS exakt dieselbe Origin sein wie
 * `NEXT_PUBLIC_BASE_URL` / `BETTER_AUTH_URL` des angesteuerten Deploys — die
 * Prod-Web-Domain ist `https://kickpact.com` (nicht `.de`; better-auth
 * `trustedOrigins` + das host-only `__Secure-`-Session-Cookie hängen daran).
 * Weicht die WebView-Origin ab, verwirft better-auth den Origin und die App
 * bleibt dauerhaft ausgeloggt. Staging läuft mit ALLOW_TEST_AUTH + geteilter
 * DB — ein versehentlich ausgelieferter Staging-Build ist ein Sicherheits-/
 * Datenschutzproblem; darum unten die laute Warnung bei fehlendem Override.
 *
 * Cookie-Auth (better-auth Session) trägt im WKWebView und persistiert über
 * App-Neustarts (im Spike 2026-06-02 verifiziert) — kein Bearer-Token-Fallback nötig.
 */
const SERVER_URL = process.env.CAP_SERVER_URL ?? "https://kickpact.schartl.dev";

if (!process.env.CAP_SERVER_URL) {
  // Sichtbar im `cap sync`-Output: ein Store-/TestFlight-Build darf NIE auf
  // Staging zeigen. Für Prod `npm run ios:sync:prod` nutzen.
  console.warn(
    "\n[capacitor] ⚠️  CAP_SERVER_URL nicht gesetzt → Fallback auf STAGING " +
      "(kickpact.schartl.dev). Für einen Produktions-Build `npm run ios:sync:prod`" +
      " verwenden, sonst zeigt die App auf Staging (Test-Auth + geteilte DB).\n"
  );
}

const config: CapacitorConfig = {
  appId: "com.kickpact.app",
  appName: "KickPact",
  webDir: "capacitor-www",
  // Markiert Requests aus der nativen App im User-Agent. Die Next-Middleware
  // erkennt das und leitet den Root `/` auf den App-Einstieg (`/willkommen`)
  // statt der Marketing-Landingpage — server-seitig, ohne Flash. (WS-8)
  appendUserAgent: "KickPactApp",
  server: {
    url: SERVER_URL,
    cleartext: false
  },
  plugins: {
    // Ohne dieses Plugin schiebt iOS die Tastatur über den Inhalt, statt den
    // WebView zu verkleinern: in bottom-fixed Sheets mit Texteingabe (z.B.
    // Sponsor-Discover) verdeckt sie genau das Feld, in das getippt wird.
    // `native` lässt iOS den WebView-Frame animiert mitschrumpfen.
    Keyboard: {
      resize: KeyboardResize.Native
    },
    // Foreground-Banner: ohne `presentationOptions` unterdrückt iOS jede Push,
    // die eintrifft WÄHREND die App offen ist (Default) — der Nutzer mit offener
    // App erfährt vom Tor/der Rechnung nichts. Banner + Sound + Badge zeigen.
    PushNotifications: {
      presentationOptions: ["alert", "sound", "badge"]
    },
    // Nativer Google-Login (@codetrix-studio/capacitor-google-auth).
    // serverClientId = Web-OAuth-Client (Audience des idTokens fürs Backend),
    // iosClientId = iOS-OAuth-Client (für com.kickpact.app). Beides öffentliche
    // OAuth-Client-IDs, kein Secret. Das zugehörige URL-Scheme (reversed iOS-ID)
    // steht in ios/App/App/Info.plist.
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId:
        "61970500774-gvsogfm2m7tn1sdsnk06qvl1e3ffhn4g.apps.googleusercontent.com",
      iosClientId:
        "61970500774-vndgkcbi8073g8hk91jsb9rml1747nn9.apps.googleusercontent.com",
      forceCodeForRefreshToken: true
    }
  }
};

export default config;
