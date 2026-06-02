import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/lib/db/schema";
import {
  upsertDeviceToken,
  getDeviceTokensForUser,
  deleteDeviceTokens
} from "@/lib/db/queries/device-tokens";
import { sendPushToUser } from "@/lib/notifications/push";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";

/**
 * Integration: Token-Auswahl + 410-Cleanup gegen die echte Test-DB. Gated wie
 * alle DB-Suites (läuft in CI mit DATABASE_URL_TEST, skippt lokal ohne Docker).
 */
describe.skipIf(isIntegrationDbDisabled)("device-tokens (DB)", () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  async function seedUser(id: string) {
    const db = await getTestDb();
    await db.insert(users).values({ id, email: `${id}@test.de` });
  }

  it("liefert nur die Tokens des jeweiligen Users", async () => {
    await seedUser("u1");
    await seedUser("u2");
    await upsertDeviceToken({ token: "tok-a", userId: "u1" });
    await upsertDeviceToken({ token: "tok-b", userId: "u1" });
    await upsertDeviceToken({ token: "tok-c", userId: "u2" });

    expect((await getDeviceTokensForUser("u1")).sort()).toEqual(["tok-a", "tok-b"]);
    expect(await getDeviceTokensForUser("u2")).toEqual(["tok-c"]);
  });

  it("upsert wechselt den Besitzer statt zu duplizieren", async () => {
    await seedUser("u1");
    await seedUser("u2");
    await upsertDeviceToken({ token: "tok-x", userId: "u1" });
    await upsertDeviceToken({ token: "tok-x", userId: "u2" }); // Gerät neu eingeloggt

    expect(await getDeviceTokensForUser("u1")).toEqual([]);
    expect(await getDeviceTokensForUser("u2")).toEqual(["tok-x"]);
  });

  it("deleteDeviceTokens entfernt gezielt", async () => {
    await seedUser("u1");
    await upsertDeviceToken({ token: "dead", userId: "u1" });
    await upsertDeviceToken({ token: "alive", userId: "u1" });

    await deleteDeviceTokens(["dead"]);
    expect(await getDeviceTokensForUser("u1")).toEqual(["alive"]);
  });

  it("sendPushToUser räumt 410-Tokens aus der echten DB (Auswahl + Cleanup e2e)", async () => {
    await seedUser("u1");
    await upsertDeviceToken({ token: "good", userId: "u1" });
    await upsertDeviceToken({ token: "gone", userId: "u1" });

    const res = await sendPushToUser(
      "u1",
      { title: "T", body: "B" },
      {
        getTokens: getDeviceTokensForUser,
        removeTokens: deleteDeviceTokens,
        isConfigured: () => true,
        send: async (tokens) =>
          tokens.map((t) =>
            t === "gone"
              ? { token: t, ok: false, status: 410 }
              : { token: t, ok: true, status: 200 }
          )
      }
    );

    expect(res.sent).toBe(1);
    expect(res.removed).toBe(1);
    expect(await getDeviceTokensForUser("u1")).toEqual(["good"]);
  });
});
