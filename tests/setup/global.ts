import { config } from "dotenv";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Global setup: load .env.local before any test modules are imported.
 * This ensures DATABASE_URL is available when lib/db/client.ts is collected.
 *
 * Danach: eine EIGENE Test-DB pro LAUF beschaffen.
 *
 * WURZELURSACHE der bis 2026-07-17 verbliebenen FK-Flakes ("Key (team_id)=…
 * is not present in table teams" mitten im Seed): `.env.local` — und damit
 * jeder Worktree unter `.claude/worktrees/*`, der sie kopiert — zeigt auf
 * DIESELBE physische DB `kickpact_test`. `singleFork` serialisiert nur
 * INNERHALB eines Laufs; ein zweiter Prozess (parallele Claude-Session,
 * zweites Terminal, ein `dotenv -e .env.local -- tsx scripts/…`) truncatet
 * und seedet dieselben Tabellen gleichzeitig. Deshalb laufen die betroffenen
 * Dateien isoliert grün und nur im Volllauf mit Nachbarprozess rot.
 *
 * FIX: Der Lauf reserviert per Postgres-Advisory-Lock einen von SLOT_COUNT
 * Slot-DBs (kickpact_test_s1 … _s8) im selben Container und schreibt deren URL
 * nach `process.env.DATABASE_URL_TEST`. Die Forks werden aus diesem Prozess
 * gespawnt und erben die Variable, `lib/db/client.ts` und
 * `tests/setup/integration-db.ts` lesen sie unverändert weiter. Der Lock hängt
 * an der Session-Verbindung: Bricht der Lauf ab (Ctrl-C, Crash), gibt Postgres
 * ihn mit der Verbindung frei — kein verwaister Lock-State auf Platte.
 *
 * Slots statt "DB pro Worktree-Pfad": Slots werden wiederverwendet, zahlen die
 * 68 Migrationen also nur beim ersten Lauf, und schützen auch zwei Läufe im
 * SELBEN Verzeichnis. Sind alle Slots belegt, wartet der Lauf, statt sich mit
 * einem Nachbarn die Tabellen wegzuräumen.
 */
const SLOT_COUNT = 8;
const LOCK_NAMESPACE = 0x6b696b70; // "kikp" — Klasse für pg_try_advisory_lock

let lockConnection: ReturnType<typeof postgres> | null = null;

export async function setup() {
  config({ path: path.resolve(process.cwd(), ".env.local") });
  config({ path: path.resolve(process.cwd(), ".env") });

  const baseUrl = process.env.DATABASE_URL_TEST;
  // Ohne isolierte Test-DB gibt es nichts zu isolieren: die DB-Suites skippen
  // sich dann ohnehin selbst (siehe isIntegrationDbDisabled).
  if (!baseUrl) return;
  if (/neon\.tech/i.test(baseUrl)) {
    throw new Error(
      "DATABASE_URL_TEST zeigt auf Neon — Tests würden die geteilte DB löschen."
    );
  }

  const slotUrl = new URL(baseUrl);
  const baseName = slotUrl.pathname.replace(/^\//, "");

  // Wartungsverbindung auf `postgres`: CREATE DATABASE geht nicht aus der DB
  // heraus, die man anlegt. Diese Verbindung hält den Slot-Lock für die
  // gesamte Laufzeit → idle_timeout aus, max 1 (ein Reconnect verlöre den Lock).
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";
  lockConnection = postgres(adminUrl.toString(), {
    max: 1,
    idle_timeout: 0,
    onnotice: () => {}
  });

  const slot = await acquireSlot(lockConnection);
  const dbName = `${baseName}_s${slot}`;
  const exists =
    await lockConnection`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) {
    await lockConnection.unsafe(`CREATE DATABASE "${dbName}"`);
  }

  slotUrl.pathname = `/${dbName}`;
  process.env.DATABASE_URL_TEST = slotUrl.toString();

  // Migrationen hier statt lazy in getTestDb(): Dateien, die nur über
  // `@/lib/db/client` + tests/setup/db.ts gehen, rufen getTestDb() nie auf und
  // liefen auf einer frisch angelegten Slot-DB sonst gegen fehlende Tabellen.
  const migrationConnection = postgres(slotUrl.toString(), {
    max: 1,
    onnotice: () => {}
  });
  try {
    await migrate(drizzle(migrationConnection), {
      migrationsFolder: "./drizzle/migrations"
    });
  } finally {
    await migrationConnection.end({ timeout: 5 });
  }

  console.log(`[test-db] Slot ${slot}: ${dbName}`);
}

export async function teardown() {
  // Verbindung schließen gibt den Advisory-Lock frei.
  await lockConnection?.end({ timeout: 5 });
  lockConnection = null;
}

async function acquireSlot(sql: ReturnType<typeof postgres>): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      const [row] = await sql<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}, ${slot}) AS locked
      `;
      if (row.locked) return slot;
    }
    if (attempt === 0) {
      console.log(
        `[test-db] alle ${SLOT_COUNT} Slots belegt — warte auf einen freien …`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
