/**
 * Security-Tests für die Test-Auth-Endpoints (Audit 2026-06-10).
 *
 * Kernaussage: In Production-Builds sind /api/test-auth/* hart deaktiviert
 * (404), außer ALLOW_TEST_AUTH=true ist explizit gesetzt — selbst mit
 * korrektem E2E_TEST_BYPASS_KEY. Vorher hing der Schutz allein an der
 * Geheimhaltung des Keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn()
  };
  return { dbMock };
});

vi.mock("@/lib/db/client", () => ({ db: dbMock }));

import { guardTestAuth } from "@/app/api/test-auth/_lib/guard";
import { POST as magicLinkStubPOST } from "@/app/api/test-auth/magic-link-stub/route";
import { POST as cleanupPOST } from "@/app/api/test-auth/cleanup/route";

const KEY = "test-bypass-key-1234";

function makeReq(opts: { key?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest("http://localhost/api/test-auth/magic-link-stub", {
    method: "POST",
    headers: {
      ...(opts.key ? { "x-test-bypass": opts.key } : {}),
      "content-type": "application/json"
    },
    body: JSON.stringify(opts.body ?? {})
  });
}

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  dbMock.delete.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guardTestAuth", () => {
  it("blockt in production ohne ALLOW_TEST_AUTH — auch mit korrektem Key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    const res = guardTestAuth(makeReq({ key: KEY }));
    expect(res?.status).toBe(404);
  });

  it("blockt in production wenn ALLOW_TEST_AUTH nicht exakt 'true' ist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);
    vi.stubEnv("ALLOW_TEST_AUTH", "1");

    const res = guardTestAuth(makeReq({ key: KEY }));
    expect(res?.status).toBe(404);
  });

  it("erlaubt in production mit ALLOW_TEST_AUTH=true und korrektem Key (Staging-Fall)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_TEST_AUTH", "true");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    expect(guardTestAuth(makeReq({ key: KEY }))).toBeNull();
  });

  it("blockt trotz ALLOW_TEST_AUTH=true bei falschem Key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_TEST_AUTH", "true");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    const res = guardTestAuth(makeReq({ key: "wrong-key" }));
    expect(res?.status).toBe(404);
  });

  it("blockt wenn E2E_TEST_BYPASS_KEY nicht gesetzt ist", () => {
    const res = guardTestAuth(makeReq({ key: KEY }));
    expect(res?.status).toBe(404);
  });

  it("blockt ohne x-test-bypass-Header", () => {
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    const res = guardTestAuth(makeReq());
    expect(res?.status).toBe(404);
  });

  it("erlaubt außerhalb von production mit korrektem Key ohne ALLOW_TEST_AUTH", () => {
    // NODE_ENV ist unter Vitest "test" — der Production-Gate greift nicht.
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    expect(guardTestAuth(makeReq({ key: KEY }))).toBeNull();
  });
});

describe("POST /api/test-auth/magic-link-stub — Production-Gate", () => {
  it("liefert 404 und fasst die DB nicht an", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    const res = await magicLinkStubPOST(
      makeReq({ key: KEY, body: { email: "attacker@example.com" } })
    );

    expect(res.status).toBe(404);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("stellt mit ALLOW_TEST_AUTH=true weiterhin Sessions aus (E2E-Pfad)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_TEST_AUTH", "true");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);
    vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret");

    // User existiert bereits → kein insert(users), nur insert(sessions).
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "u1", email: "e2e@e2e-test.kickpact.de" }]
        })
      })
    });
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values: valuesMock });

    const res = await magicLinkStubPOST(
      makeReq({ key: KEY, body: { email: "e2e@e2e-test.kickpact.de" } })
    );

    expect(res.status).toBe(200);
    expect(valuesMock).toHaveBeenCalledTimes(1); // Session-Insert
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token=");
  });
});

describe("POST /api/test-auth/cleanup — Production-Gate", () => {
  it("liefert 404 und löscht nichts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_BYPASS_KEY", KEY);

    const res = await cleanupPOST(makeReq({ key: KEY }));

    expect(res.status).toBe(404);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
