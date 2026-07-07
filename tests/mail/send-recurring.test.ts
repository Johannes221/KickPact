import { beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ id: "stub-id", error: null })
}));

vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: resendSendMock } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));

const { isEnabledMock } = vi.hoisted(() => ({
  isEnabledMock: vi.fn().mockResolvedValue(true)
}));

vi.mock("@/lib/db/queries/notifications", () => ({
  isEmailRecurringEnabled: isEnabledMock
}));

process.env.BETTER_AUTH_SECRET ??=
  "test-secret-test-secret-test-secret-test-secret";
process.env.NEXT_PUBLIC_BASE_URL = "https://kickpact.example";

import { sendRecurringEmail } from "@/lib/mail/send-recurring";

const BASE = {
  userId: "user_123",
  to: "sponsor@test.local",
  subject: "Betreff",
  html: "<!doctype html><html><body><p>Hallo</p></body></html>",
  text: "Hallo"
};

describe("sendRecurringEmail", () => {
  beforeEach(() => {
    resendSendMock.mockClear();
    resendSendMock.mockResolvedValue({ id: "stub-id", error: null });
    isEnabledMock.mockClear();
    isEnabledMock.mockResolvedValue(true);
  });

  it("skips the send when the user opted out of recurring mail", async () => {
    isEnabledMock.mockResolvedValue(false);
    const res = await sendRecurringEmail(BASE);
    expect(res.skipped).toBe(true);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("sends with One-Click List-Unsubscribe headers + a visible opt-out link", async () => {
    const res = await sendRecurringEmail(BASE);
    expect(res.skipped).toBe(false);
    expect(resendSendMock).toHaveBeenCalledTimes(1);

    const arg = resendSendMock.mock.calls[0][0];
    expect(arg.to).toBe("sponsor@test.local");
    expect(arg.subject).toBe("Betreff");

    // RFC 8058: One-Click POST + List-Unsubscribe mit https-URL.
    expect(arg.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    const lu: string = arg.headers["List-Unsubscribe"];
    expect(lu).toMatch(
      /^<https:\/\/kickpact\.example\/api\/email\/unsubscribe\?token=.+>$/
    );

    // Sichtbarer Abmelden-Link im Body (HTML + Text), gleiche URL.
    const tokenUrl = lu.slice(1, -1);
    expect(arg.html).toContain(tokenUrl);
    expect(arg.html.toLowerCase()).toContain("abmelden");
    expect(arg.text).toContain(tokenUrl);
    // Der Footer wird VOR </body> eingefügt, HTML bleibt valide.
    expect(arg.html.trim().endsWith("</body></html>")).toBe(true);
  });

  it("passes replyTo through when provided", async () => {
    await sendRecurringEmail({ ...BASE, replyTo: "verein@test.local" });
    expect(resendSendMock.mock.calls[0][0].replyTo).toBe("verein@test.local");
  });
});
