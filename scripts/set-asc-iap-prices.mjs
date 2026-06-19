/**
 * Setzt die Preise (Territory DEU als Basis) für die 6 KickPact-IAP-Produkte.
 *
 * ⚠️ STATUS (2026-06-16): Der ASC-`POST /v1/subscriptionPrices`-Endpoint ist
 * für die ERST-Preis-Anlage eines brandneuen Produkts unzuverlässig — er
 * antwortet konstant mit 409 „An error occurred while processing the pricing
 * information." (bekannter Apple-Bug, alle Attribut-Varianten getestet:
 * mit/ohne startDate, preserveCurrentPrice true/false/weg, leere attrs).
 *
 * → Die 6 Start-Preise daher EINMALIG im ASC-UI setzen (Apps → KickPact →
 *   Abonnements → je Produkt → „Preis hinzufügen", Basis Deutschland):
 *     basic.monthly 4,99 € · basic.season 34,99 € · pro.monthly 10,99 €
 *     pro.season 74,99 € · verein.monthly 28,99 € · verein.season 199,99 €
 *   Apple equalisiert die übrigen Länder automatisch.
 *
 * Sobald ein Start-Preis existiert, lassen sich KÜNFTIGE Preisänderungen
 * wieder per API (mit Zukunfts-startDate) fahren — dafür bleibt dieses
 * Script als Vorlage. Die Price-Point-Auswahl-Logik unten ist korrekt.
 *
 * Ausführen: node scripts/set-asc-iap-prices.mjs
 */

import { readFileSync } from "fs";
import { createSign } from "crypto";
import { request } from "https";
import { homedir } from "os";

const KEY_ID      = "VP65CLK9FZ";
const ISSUER_ID   = "c3a68526-ca02-41cf-a5c7-e438c1ed939f";
const PRIVATE_KEY = readFileSync(`${homedir()}/Downloads/AuthKey_VP65CLK9FZ.p8`, "utf8");

// Apple verlangt ein Zukunfts-startDate (>= morgen). App ist noch nicht live.
const START_DATE = "2026-06-17";

// Zielpreise in EUR (Apple rundet auf den nächsten verfügbaren .99-Tier).
const TARGETS = [
  { productId: "kickpact.basic.monthly",  eur: 4.99 },
  { productId: "kickpact.basic.season",   eur: 34.99 },
  { productId: "kickpact.pro.monthly",    eur: 10.99 },
  { productId: "kickpact.pro.season",     eur: 74.99 },
  { productId: "kickpact.verein.monthly", eur: 28.99 },
  { productId: "kickpact.verein.season",  eur: 199.99 },
];

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function makeJWT() {
  const header  = b64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" })));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url(Buffer.from(JSON.stringify({
    iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1"
  })));
  const data = `${header}.${payload}`;
  const sign = createSign("SHA256");
  sign.update(data);
  return `${data}.${b64url(sign.sign({ key: PRIVATE_KEY, dsaEncoding: "ieee-p1363" }))}`;
}
function asc(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = request({
      hostname: "api.appstoreconnect.apple.com",
      path, method,
      headers: {
        Authorization: `Bearer ${makeJWT()}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`ASC ${res.statusCode} ${method} ${path}: ${raw}`));
        else resolve(raw ? JSON.parse(raw) : null);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  // App + Gruppe + Produkte auflösen
  const apps = await asc("GET", `/v1/apps?filter[bundleId]=com.kickpact.app`);
  const appId = apps.data[0].id;
  const groups = await asc("GET", `/v1/apps/${appId}/subscriptionGroups?limit=50`);
  const groupId = groups.data.find((g) => g.attributes.referenceName === "KickPact Pläne").id;
  const subs = await asc(
    "GET",
    `/v1/subscriptionGroups/${groupId}/subscriptions?fields[subscriptions]=productId&limit=200`
  );
  const byProduct = Object.fromEntries(subs.data.map((s) => [s.attributes.productId, s.id]));

  for (const t of TARGETS) {
    const subId = byProduct[t.productId];
    if (!subId) { console.log(`  ⚠ ${t.productId} nicht gefunden — skip`); continue; }

    // Schon ein Preis gesetzt?
    const current = await asc(
      "GET",
      `/v1/subscriptions/${subId}/prices?include=subscriptionPricePoint&limit=10`
    );
    if (current.data?.length) {
      console.log(`  ⏭  ${t.productId}: Preis bereits gesetzt — übersprungen.`);
      continue;
    }

    // Price-Points für DEU holen (equalizations aus, Basis-Territory).
    // Wir paginieren, bis wir den nächstgelegenen Customer-Preis finden.
    let best = null;
    let url =
      `/v1/subscriptions/${subId}/pricePoints` +
      `?filter[territory]=DEU&limit=8000`;
    while (url) {
      const pts = await asc("GET", url);
      for (const pp of pts.data) {
        const price = parseFloat(pp.attributes.customerPrice);
        const diff = Math.abs(price - t.eur);
        if (!best || diff < best.diff) best = { id: pp.id, price, diff };
      }
      url = pts.links?.next ? pts.links.next.replace("https://api.appstoreconnect.apple.com", "") : null;
    }
    if (!best) { console.log(`  ⚠ ${t.productId}: keine Price-Points`); continue; }

    // Apple verlangt ein Zukunfts-startDate (>= morgen). Da die App noch nicht
    // live ist, ist das unkritisch — der Preis gilt ab morgen.
    await asc("POST", "/v1/subscriptionPrices", {
      data: {
        type: "subscriptionPrices",
        attributes: { preserveCurrentPrice: false, startDate: START_DATE },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subId } },
          subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: best.id } },
        },
      },
    });
    console.log(`  ✓ ${t.productId}: ${best.price.toFixed(2)} € (Ziel ${t.eur} €)`);
  }

  console.log("\n✅ Preise gesetzt (Basis-Territory DEU; Apple equalisiert die übrigen Länder automatisch).");
})().catch((err) => { console.error("✗", err.message); process.exit(1); });
