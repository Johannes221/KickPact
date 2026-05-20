#!/usr/bin/env node
/**
 * Generates an ES256 JWT for Apple "Sign in with Apple".
 *
 * Apple requires the OAuth client_secret to be a signed JWT (not a static
 * string), valid for max 6 months. Better Auth expects clientSecret as a
 * string, so we pre-generate the JWT and store it as APPLE_CLIENT_SECRET.
 *
 * Usage:
 *   node scripts/generate-apple-jwt.mjs
 *
 * Reads from .env.local:
 *   APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
 *
 * Outputs the JWT on stdout — copy it into Coolify ENV as APPLE_CLIENT_SECRET.
 *
 * Rotate every ~5 months (Apple max is 6 months).
 */
import { SignJWT, importPKCS8 } from "jose";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

let env;
try {
  env = readFileSync(envPath, "utf8");
} catch {
  console.error(`✗ ${envPath} not found`);
  process.exit(1);
}

function readVar(name) {
  // Match KEY="value" possibly multiline
  const re = new RegExp(`^${name}="((?:[^"\\\\]|\\\\.|\\n)*)"`, "m");
  const m = env.match(re);
  if (!m) return null;
  return m[1].replace(/\\n/g, "\n");
}

const teamId = readVar("APPLE_TEAM_ID");
const keyId = readVar("APPLE_KEY_ID");
const clientId = readVar("APPLE_CLIENT_ID");
const rawKey = readVar("APPLE_PRIVATE_KEY");

if (!teamId || !keyId || !clientId || !rawKey) {
  console.error("✗ Missing one of: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY");
  console.error("  teamId:", teamId ? "✓" : "✗");
  console.error("  keyId:", keyId ? "✓" : "✗");
  console.error("  clientId:", clientId ? "✓" : "✗");
  console.error("  privateKey:", rawKey ? `✓ (${rawKey.length} chars)` : "✗");
  process.exit(1);
}

const privateKey = await importPKCS8(rawKey, "ES256");
const nowSec = Math.floor(Date.now() / 1000);
const fiveMonthsSec = 60 * 60 * 24 * 30 * 5;

const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId })
  .setIssuer(teamId)
  .setIssuedAt(nowSec)
  .setExpirationTime(nowSec + fiveMonthsSec)
  .setAudience("https://appleid.apple.com")
  .setSubject(clientId)
  .sign(privateKey);

console.error(`✓ JWT signed (valid for ~5 months, until ${new Date((nowSec + fiveMonthsSec) * 1000).toISOString()})`);
console.error("");
console.error("Copy this into your env as APPLE_CLIENT_SECRET:");
console.error("");
console.log(jwt);
