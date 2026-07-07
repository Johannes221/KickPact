import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??=
    "test-secret-test-secret-test-secret-test-secret";
});

import {
  signEmailUnsubscribeToken,
  verifyEmailUnsubscribeToken
} from "@/lib/auth/email-unsubscribe-token";

const nowSec = () => Math.floor(Date.now() / 1000);

describe("email-unsubscribe-token", () => {
  it("roundtrips userId", () => {
    const iat = nowSec();
    const token = signEmailUnsubscribeToken({
      userId: "user_123",
      iat,
      exp: iat + 3600
    });
    const payload = verifyEmailUnsubscribeToken(token);
    expect(payload.userId).toBe("user_123");
  });

  it("rejects a tampered signature", () => {
    const iat = nowSec();
    const token = signEmailUnsubscribeToken({
      userId: "user_123",
      iat,
      exp: iat + 3600
    });
    const [payload] = token.split(".");
    const forged = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(() => verifyEmailUnsubscribeToken(forged)).toThrow();
  });

  it("rejects a swapped payload (userId change without re-signing)", () => {
    const iat = nowSec();
    const a = signEmailUnsubscribeToken({ userId: "a", iat, exp: iat + 3600 });
    const b = signEmailUnsubscribeToken({ userId: "b", iat, exp: iat + 3600 });
    // Payload von b + Signatur von a → muss fehlschlagen.
    const forged = `${b.split(".")[0]}.${a.split(".")[1]}`;
    expect(() => verifyEmailUnsubscribeToken(forged)).toThrow();
  });

  it("rejects an expired token", () => {
    const iat = nowSec() - 7200;
    const token = signEmailUnsubscribeToken({
      userId: "user_123",
      iat,
      exp: iat + 3600 // vor 1h abgelaufen
    });
    expect(() => verifyEmailUnsubscribeToken(token)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => verifyEmailUnsubscribeToken("garbage")).toThrow();
    expect(() => verifyEmailUnsubscribeToken("")).toThrow();
  });
});
