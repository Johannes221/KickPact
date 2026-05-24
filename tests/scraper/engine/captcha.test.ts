import { describe, it, expect, vi } from "vitest";
import { assertNotCaptcha } from "@/lib/crawler/fussballde";

/**
 * Minimal Playwright-Page stub. assertNotCaptcha only touches `title()`,
 * `url()`, and `locator(...).count()`, so we don't need a real browser.
 */
type Stub = {
  title: () => Promise<string>;
  url: () => string;
  locator: (sel: string) => { count: () => Promise<number> };
};

function makePage(opts: {
  title?: string;
  url?: string;
  recaptchaIframes?: number;
}): Stub {
  return {
    title: vi.fn(async () => opts.title ?? "Fußball.de"),
    url: vi.fn(() => opts.url ?? "https://www.fussball.de/"),
    locator: vi.fn((_sel: string) => ({
      count: vi.fn(async () => opts.recaptchaIframes ?? 0),
    })),
  };
}

describe("assertNotCaptcha", () => {
  it("passes silently on a normal page", async () => {
    const page = makePage({ title: "FC Beispiel - fussball.de" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(assertNotCaptcha(page as any)).resolves.toBeUndefined();
  });

  it("throws when title looks like a Sicherheitsabfrage", async () => {
    const page = makePage({
      title: "Sicherheitsabfrage",
      url: "https://www.fussball.de/captcha",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(assertNotCaptcha(page as any)).rejects.toThrow(/Captcha/i);
  });

  it("throws when title contains the word Captcha", async () => {
    const page = makePage({ title: "Captcha verification" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(assertNotCaptcha(page as any)).rejects.toThrow(/Captcha/i);
  });

  it("throws when a reCAPTCHA iframe is present", async () => {
    const page = makePage({ title: "Anything", recaptchaIframes: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(assertNotCaptcha(page as any)).rejects.toThrow(/reCAPTCHA/i);
  });
});
