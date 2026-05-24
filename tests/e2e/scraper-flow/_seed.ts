/**
 * E2E DB-Seed Helper für scraper-flow Tests.
 *
 * Diese Tests laufen gegen einen separaten Next.js-Test-Server, der gegen
 * eine isolierte Test-DB (E2E_DATABASE_URL) verbunden ist. Helper unten
 * seeden fixture-basierte Daten via direkten DB-Writes (schneller als UI-Flows)
 * und erzeugen Better-Auth-Session-Cookies, die die Tests in Browser-Context
 * injecten können.
 *
 * Falls keine E2E-Infrastruktur konfiguriert ist (E2E_DATABASE_URL nicht gesetzt),
 * werden alle abhängigen Tests via `test.skip` übersprungen — siehe `isE2EReady()`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createId } from "@paralleldrive/cuid2";
import * as schema from "../../../lib/db/schema";

/**
 * Erkennt ob Test-Infra (Test-DB + Test-Server) verfügbar ist.
 * Wird in jeder Spec für `test.skip` Gating verwendet.
 */
export function isE2EReady(): boolean {
  return Boolean(process.env.E2E_DATABASE_URL);
}

const URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://test:test@localhost:54329/kickpact_e2e";

// Lazy: nur connecten wenn ein Test es wirklich aufruft.
let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    _sql = postgres(URL, { max: 5 });
    _db = drizzle(_sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const real = getDb();
    // @ts-expect-error proxy passthrough
    return real[prop];
  }
});

/**
 * Räumt alle relevanten Tabellen ab. Wird in `test.beforeEach` aufgerufen.
 * TRUNCATE … CASCADE setzt auch FK-abhängige Rows zurück.
 */
export async function resetE2EDb(): Promise<void> {
  if (!isE2EReady()) return;
  const real = getDb();
  // postgres-js raw template via the underlying client
  // (drizzle re-exports sql but we use the raw postgres client here)
  if (!_sql) throw new Error("expected sql client to be initialized");
  await _sql`TRUNCATE
    invoice_items, invoices, charges, event_approvals, match_events, matches,
    pledge_rules, pledges, sponsors, players, teams,
    club_memberships, clubs, sessions, accounts, verifications, users
    RESTART IDENTITY CASCADE`;
  void real;
}

export type SeedResult = {
  userId: string;
  clubId: string;
  teamId: string;
  sponsorId: string;
  sessionToken: string;
  sessionCookie: string;
};

/**
 * Seedet einen Test-User + Verein (Dossenheim Herren 1 aus Fixture) +
 * Sponsor-Profil + Better-Auth-Session. Returnt Session-Cookie-Wert
 * den die Tests in den Browser-Context injecten können.
 *
 * Die Cookie-Struktur ist Better-Auth-spezifisch: ein Plaintext-Token
 * der in der `sessions` Tabelle als `token` Column liegt. Better-Auth
 * liest aus `__Secure-better-auth.session_token` (prod) oder
 * `better-auth.session_token` (dev/local).
 */
export async function seedTestUserAndClub(opts?: {
  email?: string;
  clubSlug?: string;
  clubName?: string;
  teamName?: string;
}): Promise<SeedResult> {
  if (!isE2EReady()) {
    throw new Error(
      "seedTestUserAndClub() called but E2E_DATABASE_URL not set. Guard with isE2EReady()."
    );
  }
  const real = getDb();
  const userId = createId();
  const clubId = createId();
  const teamId = createId();
  const sponsorId = createId();
  const sessionId = createId();
  // Better-Auth nutzt einen opaquen Plaintext-Token in der Cookie.
  const sessionToken = `e2e_${createId()}`;

  const now = new Date();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await real.insert(schema.users).values({
    id: userId,
    email: opts?.email ?? `e2e-${userId}@kickpact.test`,
    emailVerified: true,
    name: "E2E Test User",
    createdAt: now,
    updatedAt: now
  });

  await real.insert(schema.clubs).values({
    id: clubId,
    slug: opts?.clubSlug ?? "dossenheim",
    name: opts?.clubName ?? "FC Sportfreunde 1910 Dossenheim",
    ort: "Dossenheim",
    createdAt: now,
    updatedAt: now
  });

  await real.insert(schema.clubMemberships).values({
    userId,
    clubId,
    role: "admin",
    createdAt: now
  });

  await real.insert(schema.teams).values({
    id: teamId,
    clubId,
    name: opts?.teamName ?? "Herren 1",
    saison: "2025/26",
    isActive: true,
    discoverable: true,
    createdAt: now
  });

  await real.insert(schema.sponsors).values({
    id: sponsorId,
    userId,
    displayName: "E2E Sponsor",
    type: "familie",
    createdAt: now
  });

  await real.insert(schema.sessions).values({
    id: sessionId,
    userId,
    token: sessionToken,
    expiresAt: expires,
    createdAt: now,
    updatedAt: now
  });

  return {
    userId,
    clubId,
    teamId,
    sponsorId,
    sessionToken,
    // Wert, wie ihn ein E2E-Test in `context.addCookies()` reicht:
    sessionCookie: sessionToken
  };
}

/**
 * Wie seedTestUserAndClub, aber mit zweitem User+Sponsor+Club, um
 * Multi-Tenant-Isolation zu testen.
 */
export async function seedTwoTenants(): Promise<{
  a: SeedResult;
  b: SeedResult & { pledgeId: string; invoiceId: string };
}> {
  if (!isE2EReady()) {
    throw new Error(
      "seedTwoTenants() called but E2E_DATABASE_URL not set. Guard with isE2EReady()."
    );
  }
  const a = await seedTestUserAndClub({
    email: "trainer-a@kickpact.test",
    clubSlug: "verein-a",
    clubName: "Verein A"
  });
  const b = await seedTestUserAndClub({
    email: "trainer-b@kickpact.test",
    clubSlug: "verein-b",
    clubName: "Verein B"
  });

  const real = getDb();
  const now = new Date();
  const ends = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  const pledgeId = createId();
  await real.insert(schema.pledges).values({
    id: pledgeId,
    sponsorId: b.sponsorId,
    teamId: b.teamId,
    status: "active",
    startsAt: now,
    endsAt: ends,
    createdAt: now
  });

  const invoiceId = createId();
  await real.insert(schema.invoices).values({
    id: invoiceId,
    sponsorId: b.sponsorId,
    clubId: b.clubId,
    period: "2026-04",
    totalCents: 5000,
    status: "sent",
    createdAt: now
  });

  return {
    a,
    b: { ...b, pledgeId, invoiceId }
  };
}

/**
 * Liefert das Cookie-Objekt, das in `context.addCookies()` für eine
 * Better-Auth Session injectet werden muss.
 */
export function authCookie(token: string, baseUrl = "http://localhost:3000") {
  return {
    name: "better-auth.session_token",
    value: token,
    url: baseUrl
  };
}
