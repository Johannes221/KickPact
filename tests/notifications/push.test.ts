import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import {
  sendPushToUser,
  type PushDeps
} from "@/lib/notifications/push";
import { isDeadTokenResult, buildProviderToken, type ApnsResult } from "@/lib/notifications/apns";
import { prefCategoryForType } from "@/lib/notifications/deliver";

const payload = { title: "Titel", body: "Body" };

function ok(token: string): ApnsResult {
  return { token, ok: true, status: 200 };
}

function makeDeps(overrides: Partial<PushDeps> = {}): PushDeps {
  return {
    getTokens: vi.fn(async () => ["t1", "t2", "t3"]),
    send: vi.fn(async (tokens: string[]) => tokens.map(ok)),
    removeTokens: vi.fn(async () => {}),
    isConfigured: () => true,
    ...overrides
  };
}

describe("sendPushToUser — token selection", () => {
  it("lädt genau die Tokens des Users und sendet sie", async () => {
    const deps = makeDeps();
    const res = await sendPushToUser("user-1", payload, deps);

    expect(deps.getTokens).toHaveBeenCalledWith("user-1");
    expect(deps.send).toHaveBeenCalledWith(["t1", "t2", "t3"], payload);
    expect(res).toEqual({ sent: 3, removed: 0 });
    expect(deps.removeTokens).not.toHaveBeenCalled();
  });

  it("ist No-Op ohne Tokens", async () => {
    const deps = makeDeps({ getTokens: vi.fn(async () => []) });
    const res = await sendPushToUser("user-1", payload, deps);
    expect(res).toEqual({ sent: 0, removed: 0, skipped: "no-tokens" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("ist No-Op, wenn APNs nicht konfiguriert ist", async () => {
    const deps = makeDeps({ isConfigured: () => false });
    const res = await sendPushToUser("user-1", payload, deps);
    expect(res).toEqual({ sent: 0, removed: 0, skipped: "not-configured" });
    expect(deps.getTokens).not.toHaveBeenCalled();
  });
});

describe("sendPushToUser — 410/Unregistered-Cleanup", () => {
  it("löscht tote Tokens (410 + BadDeviceToken), behält gute", async () => {
    const deps = makeDeps({
      getTokens: vi.fn(async () => ["t1", "t2", "t3"]),
      send: vi.fn(async () => [
        { token: "t1", ok: true, status: 200 },
        { token: "t2", ok: false, status: 410 },
        { token: "t3", ok: false, status: 400, reason: "BadDeviceToken" }
      ])
    });
    const res = await sendPushToUser("user-1", payload, deps);

    expect(res).toEqual({ sent: 1, removed: 2 });
    expect(deps.removeTokens).toHaveBeenCalledWith(["t2", "t3"]);
  });

  it("räumt transiente Fehler (429/500) NICHT auf", async () => {
    const deps = makeDeps({
      send: vi.fn(async () => [
        { token: "t1", ok: false, status: 429, reason: "TooManyRequests" },
        { token: "t2", ok: false, status: 500 }
      ])
    });
    const res = await sendPushToUser("user-1", payload, deps);

    expect(res).toEqual({ sent: 0, removed: 0 });
    expect(deps.removeTokens).not.toHaveBeenCalled();
  });
});

describe("sendPushToUser — best-effort", () => {
  it("wirft nie, auch wenn der Sender wirft", async () => {
    const deps = makeDeps({
      send: vi.fn(async () => {
        throw new Error("boom");
      })
    });
    const res = await sendPushToUser("user-1", payload, deps);
    expect(res).toEqual({ sent: 0, removed: 0, skipped: "error" });
  });

  it("wirft nie, auch wenn das Token-Laden wirft", async () => {
    const deps = makeDeps({
      getTokens: vi.fn(async () => {
        throw new Error("db down");
      })
    });
    const res = await sendPushToUser("user-1", payload, deps);
    expect(res).toEqual({ sent: 0, removed: 0, skipped: "error" });
  });
});

describe("isDeadTokenResult", () => {
  it("klassifiziert tote vs. lebende Tokens", () => {
    expect(isDeadTokenResult({ token: "x", ok: false, status: 410 })).toBe(true);
    expect(isDeadTokenResult({ token: "x", ok: false, status: 400, reason: "BadDeviceToken" })).toBe(
      true
    );
    expect(isDeadTokenResult({ token: "x", ok: false, status: 400, reason: "Unregistered" })).toBe(
      true
    );
    expect(
      isDeadTokenResult({ token: "x", ok: false, status: 400, reason: "DeviceTokenNotForTopic" })
    ).toBe(true);
    expect(isDeadTokenResult({ token: "x", ok: true, status: 200 })).toBe(false);
    expect(isDeadTokenResult({ token: "x", ok: false, status: 429, reason: "TooManyRequests" })).toBe(
      false
    );
  });
});

describe("buildProviderToken (ES256)", () => {
  it("erzeugt ein gegen den Public Key verifizierbares JWT mit korrektem Header/Claims", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256"
    });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

    const token = buildProviderToken(
      { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem },
      1_700_000_000
    );

    const [h, c, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG"
    });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_700_000_000
    });

    const valid = crypto.verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url")
    );
    expect(valid).toBe(true);
  });
});

describe("prefCategoryForType", () => {
  it("mappt jeden Notification-Typ auf die richtige Präferenz-Kategorie", () => {
    expect(prefCategoryForType("match_result")).toBe("matchResults");
    expect(prefCategoryForType("access_request")).toBe("accessRequests");
    expect(prefCategoryForType("sponsor_inquiry")).toBe("sponsorRequests");
    expect(prefCategoryForType("sponsor_lead")).toBe("sponsorRequests");
    expect(prefCategoryForType("invoice_created")).toBe("billing");
    expect(prefCategoryForType("trial_ending")).toBe("billing");
  });
});
