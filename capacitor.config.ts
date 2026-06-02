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
  server: {
    url: SERVER_URL,
    cleartext: false
  }
};

export default config;
