import { afterAll } from "vitest";
import { closeTestDb } from "./integration-db";

/**
 * Zentrales DB-Teardown für JEDE Test-Datei (via vitest `setupFiles`).
 *
 * WURZELURSACHE der intermittierenden FK-Flake im Volllauf:
 * Alle Test-Dateien teilen sich EINE physische Test-DB, sprechen sie aber über
 * ZWEI Connection-Pools an — den App-Client (`@/lib/db/client`) und den
 * Integration-Pool (`integration-db.ts`). Unter Last starvt ein Pool (eine
 * `db.transaction()` reserviert eine Verbindung, ein paralleles `Promise.all`
 * im selben Pfad braucht weitere); die starvende Query läuft in den 30s-Timeout,
 * ihre Promise bleibt aber PENDING. Vitest geht zur nächsten Datei über — und
 * das zur Zombie-Promise gehörende `TRUNCATE`/`DELETE` landet dann MITTEN im
 * Seed der nächsten Datei. Genau das erzeugt die beobachteten, in Anzahl
 * schwankenden FK-Verletzungen ("Key (club_id)=… is not present in table
 * clubs"): die Klubs waren frisch geseedet und werden zwischen zwei `await`s
 * von einer fremden, verspäteten Query weggeräumt. Einzeln laufen die Dateien
 * grün, weil es keinen Nachbarn gibt, in den geblutet werden kann.
 *
 * FIX: Am Ende JEDER Datei beide Pools schließen. `postgres-js .end()` wartet
 * auf alle noch in-flight Queries (bzw. bricht sie nach `timeout` hart ab),
 * bevor die Datei-Grenze überschritten wird — so kann keine asynchrone
 * DB-Arbeit mehr in die nächste Datei bluten. Vitest isoliert Module pro Datei,
 * jede Datei bekommt also ohnehin einen frischen Pool; das Schließen hier ist
 * deshalb gefahrlos und matcht das bestehende `closeTestDb()`-Muster.
 */
afterAll(async () => {
  // 1) Integration-Pool (idempotent — no-op, falls die Datei ihn nie geöffnet
  //    oder bereits selbst geschlossen hat).
  await closeTestDb().catch(() => {});

  // 2) App-Client-Pool. Lazy importiert, damit Dateien, die `@/lib/db/client`
  //    mocken (mock liefert kein `$client`), hier sauber übersprungen werden.
  try {
    const { db } = await import("@/lib/db/client");
    const client = (
      db as unknown as {
        $client?: { end: (opts?: { timeout?: number }) => Promise<void> };
      }
    ).$client;
    if (client?.end) {
      await client.end({ timeout: 5 });
    }
  } catch {
    // Client nicht ladbar oder gemockt → nichts zu schließen.
  }
});
