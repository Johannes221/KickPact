import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import {
  recordOperatorAction,
  listOperatorAuditLog
} from "@/lib/db/queries/operator-audit";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeOperator(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `op-${id}@kickpact.local`,
    emailVerified: true,
    name: "Operator",
    isPlatformAdmin: true
  });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("operator audit log", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("records an action and lists it with the operator email", async () => {
    const opId = await makeOperator();
    await recordOperatorAction({
      operatorUserId: opId,
      action: "club.block",
      targetType: "club",
      targetId: "club_123",
      summary: "Verein gesperrt: Testverein",
      diff: { reason: "spam" }
    });

    const { entries, total } = await listOperatorAuditLog();
    expect(total).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("club.block");
    expect(entries[0].targetType).toBe("club");
    expect(entries[0].targetId).toBe("club_123");
    expect(entries[0].operatorEmail).toMatch(/@kickpact\.local$/);
    expect(entries[0].diffJson).toEqual({ reason: "spam" });
  });

  it("orders newest first", async () => {
    const opId = await makeOperator();
    await recordOperatorAction({ operatorUserId: opId, action: "a.first", summary: "erste" });
    await recordOperatorAction({ operatorUserId: opId, action: "b.second", summary: "zweite" });

    const { entries } = await listOperatorAuditLog();
    expect(entries[0].action).toBe("b.second");
    expect(entries[1].action).toBe("a.first");
  });

  it("is best-effort: a bad operator id does not throw and does not insert", async () => {
    await expect(
      recordOperatorAction({
        operatorUserId: "does-not-exist",
        action: "x.y",
        summary: "should fail silently"
      })
    ).resolves.toBeUndefined();

    const { total } = await listOperatorAuditLog();
    expect(total).toBe(0);
  });
});
