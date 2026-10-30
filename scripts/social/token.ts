/**
 * Prüft und erneuert das Instagram-Zugriffstoken (Instagram-Login-Weg).
 *
 *   npm run social:token             läuft es noch, welches Konto?
 *   npm run social:token -- --renew  um weitere ~60 Tage verlängern
 *
 * WARUM EIGENER BEFEHL:
 * Ein langlebiges Token hält etwa 60 Tage. Läuft es ab, hilft kein Erneuern mehr
 * — dann muss in Meta ein neues generiert werden. Das ist die häufigste Art, wie
 * so eine Automatik stirbt: sie läuft monatelang, jemand ist zwei Wochen weg,
 * danach postet sie kommentarlos nichts mehr. Einmal im Monat `--renew` reicht.
 *
 * Instagram-Login-Token (beginnen mit „IGAA…") werden über graph.instagram.com
 * verwaltet, NICHT über graph.facebook.com. Das Erneuern (`ig_refresh_token`)
 * braucht kein App-Secret — nur das noch gültige, mindestens 24 Stunden alte
 * Token selbst.
 */

const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const GRAPH = `https://graph.instagram.com/${API_VERSION}`;

function requireToken(): string {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "IG_ACCESS_TOKEN fehlt in .env.local. Einrichtung: docs/marketing/instagram-api.md"
    );
  }
  return token;
}

interface Me {
  user_id?: string;
  username?: string;
  account_type?: string;
}

/** Gültigkeit + Konto. Ein Ablaufdatum liefert dieser Weg nicht — s.u. */
async function whoami(token: string): Promise<Me | null> {
  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set("fields", "user_id,username,account_type");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = (await res.json()) as { error?: { message?: string } } & Me;
  if (json.error) return null;
  return json;
}

async function renew(token: string): Promise<{ token: string; expiresInDays: number }> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (json.error) throw new Error(`Erneuern fehlgeschlagen: ${json.error.message}`);
  if (!json.access_token) throw new Error(`Kein Token in der Antwort: ${JSON.stringify(json)}`);
  return { token: json.access_token, expiresInDays: Math.floor((json.expires_in ?? 0) / 86_400) };
}

async function main() {
  const token = requireToken();

  if (!process.argv.includes("--renew")) {
    const me = await whoami(token);
    if (!me) {
      console.log("\n  ✗ Token UNGÜLTIG oder abgelaufen.");
      console.log("    Erneuern hilft nicht mehr — in Meta neu generieren.");
      console.log("    Anleitung: docs/marketing/instagram-api.md\n");
      process.exit(1);
    }
    console.log(`\n  ✓ Token gültig. Konto: @${me.username} (${me.account_type}), ID ${me.user_id}`);
    // graph.instagram.com gibt kein Ablaufdatum zurück. Deshalb kein „läuft am …" —
    // stattdessen die einzige verlässliche Regel: regelmäßig erneuern.
    console.log("    Ablaufdatum ist über diese API nicht abfragbar — einmal im Monat `--renew` laufen lassen.\n");
    return;
  }

  const me = await whoami(token);
  if (!me) {
    console.log("\n  ✗ Token ist schon ungültig — Erneuern nicht möglich. In Meta neu generieren.\n");
    process.exit(1);
  }

  const neu = await renew(token);
  console.log(`\n  ✓ Erneuert. Neues Token läuft ~${neu.expiresInDays} Tage.`);
  console.log("\n  In die .env.local eintragen (ersetzt die alte IG_ACCESS_TOKEN-Zeile):\n");
  console.log(`IG_ACCESS_TOKEN=${neu.token}\n`);
  console.log("  Das Skript schreibt die Datei bewusst NICHT selbst —");
  console.log("  ein Automatismus, der Zugangsdaten überschreibt, ist zu heikel.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.message ?? err}\n`);
  process.exit(1);
});
