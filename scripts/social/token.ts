/**
 * Prüft und erneuert das Instagram-Zugriffstoken.
 *
 *   npm run social:token             wie lange läuft es noch?
 *   npm run social:token -- --renew  um weitere ~60 Tage verlängern
 *
 * WARUM DAS EIN EIGENER BEFEHL IST:
 * Ein langlebiges Token hält etwa 60 Tage. Läuft es ab, hilft kein Erneuern mehr
 * — dann ist der komplette OAuth-Ablauf von Hand fällig. Das ist die mit Abstand
 * häufigste Art, wie so eine Automatik stirbt: sie läuft monatelang, jemand ist
 * zwei Wochen im Urlaub, und danach postet sie kommentarlos nichts mehr.
 *
 * Erneuern geht nur, solange das Token noch gültig UND mindestens 24 Stunden alt
 * ist. Einmal im Monat laufen lassen reicht und ist gutmütig gegenüber beidem.
 *
 * Meta schreibt selbst dazu, man solle sich auf diese Laufzeiten nicht
 * verlassen — deshalb prüft dieser Befehl das echte Ablaufdatum am Server,
 * statt 60 Tage anzunehmen.
 */

const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

function requireToken(): string {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "IG_ACCESS_TOKEN fehlt in .env.local. Einrichtung: docs/marketing/instagram-api.md"
    );
  }
  return token;
}

interface DebugInfo {
  is_valid: boolean;
  expires_at: number;
  scopes?: string[];
  type?: string;
}

/**
 * Das Token gegen sich selbst prüfen.
 *
 * `input_token` und `access_token` sind bewusst dasselbe: für den eigenen
 * Account darf ein Token sich selbst inspizieren, ein separates App-Token ist
 * dafür nicht nötig.
 */
async function inspect(token: string): Promise<DebugInfo> {
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: DebugInfo;
    error?: { message?: string };
  };
  if (json.error) throw new Error(`debug_token: ${json.error.message}`);
  if (!json.data) throw new Error(`debug_token: unerwartete Antwort ${JSON.stringify(json)}`);
  return json.data;
}

async function renew(token: string): Promise<string> {
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "Zum Erneuern braucht es IG_APP_ID und IG_APP_SECRET in der .env.local.\n" +
        "Beides steht in der Meta-App unter Einstellungen → Allgemein."
    );
  }
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", token);

  const res = await fetch(url);
  const json = (await res.json()) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (json.error) throw new Error(`Erneuern fehlgeschlagen: ${json.error.message}`);
  if (!json.access_token) throw new Error(`Kein Token in der Antwort: ${JSON.stringify(json)}`);
  return json.access_token;
}

function describe(info: DebugInfo): void {
  if (!info.is_valid) {
    console.log("\n  ✗ Token ist UNGÜLTIG.");
    console.log("    Erneuern hilft jetzt nicht mehr — der OAuth-Ablauf muss neu durch.");
    console.log("    Anleitung: docs/marketing/instagram-api.md\n");
    return;
  }

  // expires_at = 0 heißt: läuft nicht ab (System-User-Token).
  if (!info.expires_at) {
    console.log("\n  ✓ Token gültig und OHNE Ablaufdatum.");
    console.log("    Nichts zu tun — das ist der angenehme Fall.\n");
    return;
  }

  const tage = Math.floor((info.expires_at * 1000 - Date.now()) / 86_400_000);
  const datum = new Date(info.expires_at * 1000).toLocaleDateString("de-DE");
  const warnung = tage <= 14 ? "  ⚠ JETZT erneuern!" : tage <= 30 ? "  (bald erneuern)" : "";

  console.log(`\n  ✓ Token gültig, läuft am ${datum} ab — noch ${tage} Tage.${warnung}`);
  if (info.scopes?.length) console.log(`    Berechtigungen: ${info.scopes.join(", ")}`);

  const noetig = ["instagram_business_basic", "instagram_business_content_publish"];
  const fehlend = noetig.filter((s) => !info.scopes?.includes(s));
  if (fehlend.length) {
    console.log(`    ⚠ Fehlende Berechtigung(en) fürs Posten: ${fehlend.join(", ")}`);
  }
  console.log("");
}

async function main() {
  const token = requireToken();

  if (!process.argv.includes("--renew")) {
    describe(await inspect(token));
    return;
  }

  const info = await inspect(token);
  if (!info.is_valid) {
    describe(info);
    process.exit(1);
  }

  const neu = await renew(token);
  const neuInfo = await inspect(neu);
  const datum = neuInfo.expires_at
    ? new Date(neuInfo.expires_at * 1000).toLocaleDateString("de-DE")
    : "kein Ablauf";

  console.log(`\n  ✓ Erneuert. Neues Token läuft bis: ${datum}`);
  console.log("\n  In die .env.local eintragen (ersetzt die alte Zeile):\n");
  console.log(`IG_ACCESS_TOKEN=${neu}\n`);
  console.log("  Das Skript schreibt die Datei bewusst NICHT selbst —");
  console.log("  ein Automatismus, der Zugangsdaten überschreibt, ist mir zu heikel.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.message ?? err}\n`);
  process.exit(1);
});
