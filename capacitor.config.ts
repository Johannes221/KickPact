import type { CapacitorConfig } from "@capacitor/cli";

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
 *   - Prod-Build: `CAP_SERVER_URL=https://kickpact.de npx cap sync ios`
 *
 * Cookie-Auth (better-auth Session) trägt im WKWebView und persistiert über
 * App-Neustarts (im Spike 2026-06-02 verifiziert) — kein Bearer-Token-Fallback nötig.
 */
const SERVER_URL = process.env.CAP_SERVER_URL ?? "https://kickpact.schartl.dev";

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
