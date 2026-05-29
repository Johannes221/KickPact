import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { isPlatformAdminEmail } from "@/lib/auth/admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeUser(email: string, isPlatformAdmin: boolean): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: email.toLowerCase(),
    emailVerified: true,
    name: "Test",
    isPlatformAdmin
  });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("isPlatformAdminEmail", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns true for a user flagged as platform admin", async () => {
    await makeUser("op@kickpact.de", true);
    expect(await isPlatformAdminEmail("op@kickpact.de")).toBe(true);
  });

  it("returns false for a normal user", async () => {
    await makeUser("normal@kickpact.de", false);
    expect(await isPlatformAdminEmail("normal@kickpact.de")).toBe(false);
  });

  it("is case-insensitive on the email", async () => {
    await makeUser("op@kickpact.de", true);
    expect(await isPlatformAdminEmail("OP@KickPact.de")).toBe(true);
  });

  it("returns false for an unknown email", async () => {
    expect(await isPlatformAdminEmail("ghost@kickpact.de")).toBe(false);
  });
});
