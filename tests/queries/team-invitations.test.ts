/**
 * Unit-tests für die team-member-Invite-Helper in lib/db/queries/invitations.ts.
 *
 * Wir mocken den Drizzle-`db`-Client (kein echtes Postgres). Das reicht für die
 * Logik-Verzweigung in:
 *   - createTeamMemberInvitation (XOR-Check teamId/clubId)
 *   - acceptTeamMemberInvitation (Token-Lookup → Membership-Insert → markUsed)
 *   - findTeamMemberInvitationByToken (Kind-Filter)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------- Mock chain helper ----------
// Drizzle's fluent API: db.select().from(t).where(...).limit(N).
// Wir bauen ein Proxy-Objekt, das alle Method-Calls protokolliert und am Ende
// ein konfigurierbares Result liefert.
//
// vi.hoisted erlaubt, dass das Mock-Objekt VOR den vi.mock-Hoists existiert.
const dbMock = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = [];
  const insertReturningQueue: unknown[][] = [];
  const selectResultQueue: unknown[][] = [];

  const chain: Record<string, unknown> = {};
  chain.insert = (_table: unknown) => {
    calls.push({ method: "insert", args: [_table] });
    return chain;
  };
  chain.values = (v: unknown) => {
    calls.push({ method: "values", args: [v] });
    return chain;
  };
  chain.onConflictDoNothing = () => {
    calls.push({ method: "onConflictDoNothing", args: [] });
    return chain;
  };
  chain.returning = () => {
    return Promise.resolve(insertReturningQueue.shift() ?? []);
  };
  chain.update = (_table: unknown) => {
    calls.push({ method: "update", args: [_table] });
    return chain;
  };
  chain.set = (v: unknown) => {
    calls.push({ method: "set", args: [v] });
    return chain;
  };
  chain.select = (_cols?: unknown) => {
    calls.push({ method: "select", args: [_cols] });
    return chain;
  };
  chain.from = (_table: unknown) => {
    calls.push({ method: "from", args: [_table] });
    return chain;
  };
  chain.where = (_cond: unknown) => {
    calls.push({ method: "where", args: [_cond] });
    // .where ohne .limit muss auch awaitable sein (update-Pfad)
    return Object.assign(Promise.resolve(undefined), chain);
  };
  chain.limit = (_n: number) => {
    return Promise.resolve(selectResultQueue.shift() ?? []);
  };

  return { calls, chain, insertReturningQueue, selectResultQueue };
});

vi.mock("@/lib/db/client", () => ({
  db: dbMock.chain
}));

// Schema-Module mocken wir nicht, da nur Identitäten verglichen werden — die
// echten Imports liefern echte Drizzle-Table-Objekte zurück, das ist ok.

beforeEach(() => {
  dbMock.insertReturningQueue.length = 0;
  dbMock.selectResultQueue.length = 0;
  dbMock.calls.length = 0;
});

// Lazy import nach mock-setup
import {
  createTeamMemberInvitation,
  findTeamMemberInvitationByToken,
  acceptTeamMemberInvitation
} from "@/lib/db/queries/invitations";

describe("createTeamMemberInvitation", () => {
  it("wirft, wenn weder teamId noch clubId gesetzt sind", async () => {
    await expect(
      createTeamMemberInvitation({
        createdByUserId: "u1",
        role: "trainer"
      })
    ).rejects.toThrow(/teamId oder clubId/);
  });

  it("wirft, wenn beide teamId UND clubId gesetzt sind", async () => {
    await expect(
      createTeamMemberInvitation({
        createdByUserId: "u1",
        role: "trainer",
        teamId: "t1",
        clubId: "c1"
      })
    ).rejects.toThrow(/nicht beides/);
  });

  it("erzeugt eine Invitation mit kind=team-member + teamId", async () => {
    dbMock.insertReturningQueue.push([
      {
        id: "inv1",
        token: "tok123",
        kind: "team-member",
        teamId: "t1",
        clubId: null,
        role: "trainer",
        createdByUserId: "u1",
        status: "pending"
      }
    ]);

    const row = await createTeamMemberInvitation({
      createdByUserId: "u1",
      role: "trainer",
      teamId: "t1"
    });

    expect(row.kind).toBe("team-member");
    expect(row.teamId).toBe("t1");
    expect(row.clubId).toBeNull();
    expect(row.role).toBe("trainer");

    // Die `values()`-call sollte kind/role korrekt setzen
    const valuesCall = dbMock.calls.find((c) => c.method === "values");
    expect(valuesCall).toBeDefined();
    const vals = valuesCall!.args[0] as Record<string, unknown>;
    expect(vals.kind).toBe("team-member");
    expect(vals.role).toBe("trainer");
    expect(vals.teamId).toBe("t1");
    expect(vals.clubId).toBeNull();
  });

  it("erzeugt eine Club-weite Invitation mit clubId", async () => {
    dbMock.insertReturningQueue.push([
      {
        id: "inv2",
        token: "tok456",
        kind: "team-member",
        teamId: null,
        clubId: "c1",
        role: "viewer",
        createdByUserId: "u1",
        status: "pending"
      }
    ]);

    const row = await createTeamMemberInvitation({
      createdByUserId: "u1",
      role: "viewer",
      clubId: "c1",
      recipientEmail: "viewer@x.de"
    });

    expect(row.clubId).toBe("c1");
    expect(row.teamId).toBeNull();
    expect(row.role).toBe("viewer");

    const vals = dbMock.calls.find((c) => c.method === "values")!.args[0] as Record<string, unknown>;
    expect(vals.recipientEmail).toBe("viewer@x.de");
  });
});

describe("findTeamMemberInvitationByToken", () => {
  it("liefert null wenn kein Treffer", async () => {
    dbMock.selectResultQueue.push([]);
    const result = await findTeamMemberInvitationByToken("nope");
    expect(result).toBeNull();
  });

  it("liefert die Invitation bei Treffer", async () => {
    dbMock.selectResultQueue.push([
      {
        id: "inv1",
        token: "tok",
        kind: "team-member",
        status: "pending",
        role: "trainer",
        teamId: "t1"
      }
    ]);
    const result = await findTeamMemberInvitationByToken("tok");
    expect(result?.id).toBe("inv1");
    expect(result?.role).toBe("trainer");
  });
});

describe("acceptTeamMemberInvitation", () => {
  it("wirft bei ungültigem Token", async () => {
    dbMock.selectResultQueue.push([]); // Token-Lookup leer
    await expect(
      acceptTeamMemberInvitation({ token: "bad", userId: "u1" })
    ).rejects.toThrow(/ungültig|abgelaufen/i);
  });

  it("legt Team-Membership an + markiert Token used (scope=team)", async () => {
    dbMock.selectResultQueue.push([
      {
        id: "inv1",
        token: "tok",
        kind: "team-member",
        status: "pending",
        role: "trainer",
        teamId: "t1",
        clubId: null,
        createdByUserId: "admin1"
      }
    ]);
    // Insert membership returns nothing meaningful; update auch nicht
    const result = await acceptTeamMemberInvitation({ token: "tok", userId: "u1" });
    expect(result.scope).toBe("team");
    expect(result.teamId).toBe("t1");
    expect(result.role).toBe("trainer");

    // Verifiziere, dass insert UND update aufgerufen wurden
    const insertCalls = dbMock.calls.filter((c) => c.method === "insert");
    const updateCalls = dbMock.calls.filter((c) => c.method === "update");
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("legt Club-Membership an + markiert Token used (scope=club)", async () => {
    dbMock.selectResultQueue.push([
      {
        id: "inv2",
        token: "tok2",
        kind: "team-member",
        status: "pending",
        role: "viewer",
        teamId: null,
        clubId: "c1",
        createdByUserId: "admin1"
      }
    ]);
    const result = await acceptTeamMemberInvitation({ token: "tok2", userId: "u1" });
    expect(result.scope).toBe("club");
    expect(result.clubId).toBe("c1");
    expect(result.role).toBe("viewer");
  });
});
