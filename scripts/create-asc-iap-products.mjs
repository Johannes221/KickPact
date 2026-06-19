/**
 * Legt alle 6 KickPact IAP-Produkte in App Store Connect an.
 *
 * Voraussetzungen:
 *   - Node 18+
 *   - AuthKey_TZXU4GJK4L.p8 liegt in ~/Downloads/
 *
 * Ausführen: node scripts/create-asc-iap-products.mjs
 */

import { readFileSync } from "fs";
import { createSign } from "crypto";
import { request } from "https";
import { homedir } from "os";

// ─── Credentials ────────────────────────────────────────────────────────────
const KEY_ID     = "VP65CLK9FZ";
const ISSUER_ID  = "c3a68526-ca02-41cf-a5c7-e438c1ed939f";
const BUNDLE_ID  = "com.kickpact.app";
const PRIVATE_KEY = readFileSync(`${homedir()}/Downloads/AuthKey_VP65CLK9FZ.p8`, "utf8");

// ─── Produkte ────────────────────────────────────────────────────────────────
// season_end → ONE_YEAR (nächste Apple-Standard-Periode, 10-Monats-Logik im Server)
const PRODUCTS = [
  { productId: "kickpact.basic.monthly",  name: "Basic Monatlich",   period: "ONE_MONTH", level: 1 },
  { productId: "kickpact.basic.season",   name: "Basic Saison-Pass", period: "ONE_YEAR",  level: 2 },
  { productId: "kickpact.pro.monthly",    name: "Pro Monatlich",     period: "ONE_MONTH", level: 3 },
  { productId: "kickpact.pro.season",     name: "Pro Saison-Pass",   period: "ONE_YEAR",  level: 4 },
  { productId: "kickpact.verein.monthly", name: "Vereinslizenz Monatlich", period: "ONE_MONTH", level: 5 },
  { productId: "kickpact.verein.season",  name: "Vereinslizenz Saison-Pass", period: "ONE_YEAR", level: 6 },
];

// ─── JWT ─────────────────────────────────────────────────────────────────────
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
  // ieee-p1363 = raw R||S (64 bytes) → correct for ES256 JWT
  const sig = sign.sign({ key: PRIVATE_KEY, dsaEncoding: "ieee-p1363" });
  return `${data}.${b64url(sig)}`;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function asc(method, path, body) {
  return new Promise((resolve, reject) => {
    const jwt = makeJWT();
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: "api.appstoreconnect.apple.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`ASC ${res.statusCode} on ${method} ${path}: ${raw}`));
        } else {
          resolve(raw ? JSON.parse(raw) : null);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  // 1) App-ID ermitteln
  console.log("→ App-ID für", BUNDLE_ID, "holen …");
  const apps = await asc("GET", `/v1/apps?filter[bundleId]=${BUNDLE_ID}&fields[apps]=bundleId`);
  if (!apps.data?.length) throw new Error("App nicht gefunden — Bundle ID korrekt?");
  const appId = apps.data[0].id;
  console.log("  App-ID:", appId);

  // 2) Subscription-Gruppe find-or-create (idempotent bei Re-Run)
  const existingGroups = await asc(
    "GET",
    `/v1/apps/${appId}/subscriptionGroups?fields[subscriptionGroups]=referenceName&limit=50`
  );
  let groupId = existingGroups.data?.find(
    (g) => g.attributes.referenceName === "KickPact Pläne"
  )?.id;
  if (groupId) {
    console.log("→ Subscription-Gruppe existiert bereits:", groupId);
  } else {
    console.log("→ Subscription-Gruppe anlegen …");
    const groupRes = await asc("POST", "/v1/subscriptionGroups", {
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: "KickPact Pläne" },
        relationships: { app: { data: { type: "apps", id: appId } } },
      },
    });
    groupId = groupRes.data.id;
    console.log("  Gruppe-ID:", groupId);
  }

  // 3) Subscription-Gruppen-Lokalisierung (DE) — idempotent
  const existingGroupLocs = await asc(
    "GET",
    `/v1/subscriptionGroups/${groupId}/subscriptionGroupLocalizations?limit=50`
  );
  if (existingGroupLocs.data?.some((l) => l.attributes.locale === "de-DE")) {
    console.log("  Gruppen-Lokalisierung (de-DE) existiert bereits.");
  } else {
    await asc("POST", "/v1/subscriptionGroupLocalizations", {
      data: {
        type: "subscriptionGroupLocalizations",
        attributes: { locale: "de-DE", name: "KickPact" },
        relationships: { subscriptionGroup: { data: { type: "subscriptionGroups", id: groupId } } },
      },
    });
    console.log("  Gruppen-Lokalisierung (de-DE) angelegt.");
  }

  // Bestehende Produkte einlesen, um Doppel-Anlage zu vermeiden.
  const existingSubs = await asc(
    "GET",
    `/v1/subscriptionGroups/${groupId}/subscriptions?fields[subscriptions]=productId&limit=200`
  );
  const existingProductIds = new Set(
    (existingSubs.data ?? []).map((s) => s.attributes.productId)
  );

  // 4) Produkte anlegen
  for (const p of PRODUCTS) {
    if (existingProductIds.has(p.productId)) {
      console.log(`  ⏭  ${p.productId} existiert bereits — übersprungen.`);
      continue;
    }
    console.log(`→ ${p.productId} …`);
    const subRes = await asc("POST", "/v1/subscriptions", {
      data: {
        type: "subscriptions",
        attributes: {
          productId: p.productId,
          name: p.name,
          subscriptionPeriod: p.period,
          groupLevel: p.level,
          reviewNote: "Performance-Sponsoring-Plattform für Amateurfußball",
        },
        relationships: {
          group: { data: { type: "subscriptionGroups", id: groupId } },
        },
      },
    });
    const subId = subRes.data.id;

    // Lokalisierung pro Produkt
    await asc("POST", "/v1/subscriptionLocalizations", {
      data: {
        type: "subscriptionLocalizations",
        attributes: {
          locale: "de-DE",
          name: p.name,
          description:
            p.productId.includes("basic")   ? "Bis zu 5 Sponsoren, alle Auto-Trigger." :
            p.productId.includes("verein")  ? "Alle Mannschaften unter einer Lizenz." :
                                              "Unbegrenzte Sponsoren und Regeln.",
        },
        relationships: { subscription: { data: { type: "subscriptions", id: subId } } },
      },
    });

    console.log(`  ✓ ${p.productId} (ID: ${subId})`);
  }

  console.log("\n✅ Alle 6 Produkte angelegt.");
  console.log("⚠️  Preise noch im ASC-UI setzen:");
  console.log("   basic.monthly=4,99 € | basic.season=34,99 € | pro.monthly=10,99 €");
  console.log("   pro.season=74,99 €   | verein.monthly=28,99 € | verein.season=199,99 €");
  console.log("   (Apple rundet auf .99 — am nächsten zu unseren 5/35/11/75/29/199 €)");
})().catch((err) => {
  console.error("✗ Fehler:", err.message);
  process.exit(1);
});
