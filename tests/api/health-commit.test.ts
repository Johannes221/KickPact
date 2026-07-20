/**
 * `/api/health` weist den laufenden Commit aus.
 *
 * Hintergrund (2026-07-19): Ob ein Push tatsächlich in einem Container gelandet
 * ist, ließ sich von außen nicht feststellen — die App lieferte keinen
 * Versions-Marker, und unveränderte Asset-Hashes beweisen nichts. Ein Push, der
 * nie deployt wurde, sah exakt aus wie ein erfolgreicher Deploy.
 *
 * Der Endpoint muss dabei zwei Dinge können: den Commit melden, wenn die
 * Umgebung ihn durchreicht — und ehrlich "unknown" sagen, wenn nicht. Ein
 * stillschweigend fehlendes Feld wäre schlimmer als gar keins, weil ein Skript
 * `commit === undefined` leicht als "passt schon" liest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { execute: vi.fn() }
}));
vi.mock("@/lib/db/client", () => ({ db: dbMock }));

import { GET } from "@/app/api/health/route";

const ENV_KEYS = ["SOURCE_COMMIT", "GIT_COMMIT_SHA", "COOLIFY_GIT_COMMIT_SHA"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dbMock.execute.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("/api/health commit-Marker", () => {
  it("meldet den Commit aus SOURCE_COMMIT bei gesunder DB", async () => {
    process.env.SOURCE_COMMIT = "abc1234";
    dbMock.execute.mockResolvedValue(undefined);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.commit).toBe("abc1234");
  });

  it("meldet \"unknown\" statt undefined, wenn die Env nichts durchreicht", async () => {
    dbMock.execute.mockResolvedValue(undefined);

    const body = await (await GET()).json();
    // Explizit "unknown": ein fehlendes Feld läse sich als "passt schon".
    expect(body.commit).toBe("unknown");
  });

  it("weist den Commit AUCH bei toter DB aus (503)", async () => {
    // Genau im Störungsfall braucht man die Version zuerst — sonst debuggt man
    // gegen einen Commit, der gar nicht läuft.
    process.env.SOURCE_COMMIT = "deadbee";
    dbMock.execute.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.commit).toBe("deadbee");
  });

  it("fällt auf die Coolify-Variante zurück", async () => {
    process.env.COOLIFY_GIT_COMMIT_SHA = "c00l1fy";
    dbMock.execute.mockResolvedValue(undefined);

    const body = await (await GET()).json();
    expect(body.commit).toBe("c00l1fy");
  });
});
