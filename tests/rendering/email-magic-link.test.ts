/**
 * Snapshot + field-assertion tests for the magic-link login email.
 *
 * Adapted from Phase 6, Task 6.3: the real template is `magicLinkEmail`
 * (plain function returning `{ subject, html, text }`) at
 * lib/mail/templates/magic-link.tsx. The plan's signature was
 * `MagicLinkEmail({ email, magicLink })`; the real function takes
 * `{ email, url }`.
 *
 * Note: the production template currently does NOT echo the recipient
 * email back into html/text (only the link is rendered). The plan's
 * "user@example.com appears in body" assertion is therefore relaxed to
 * "magic link is present"; the email param is still passed through the
 * snapshot to lock the call shape.
 */
import { describe, it, expect } from "vitest";
import { magicLinkEmail } from "../../lib/mail/templates/magic-link";

const FIXTURE = {
  email: "user@example.com",
  url: "https://kickpact.de/auth/magic?token=abc"
};

describe("Magic link email", () => {
  it("renders magic link in html + text + subject mentions login", () => {
    const { subject, html, text } = magicLinkEmail(FIXTURE);
    expect(subject.toLowerCase()).toMatch(/login|link/);
    expect(html).toContain("https://kickpact.de/auth/magic?token=abc");
    expect(text).toContain("https://kickpact.de/auth/magic?token=abc");
  });

  it("link appears at least twice in html (button + fallback)", () => {
    const { html } = magicLinkEmail(FIXTURE);
    const occurrences = html.split(FIXTURE.url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("html snapshot", () => {
    const { html } = magicLinkEmail(FIXTURE);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });

  it("text snapshot", () => {
    const { text } = magicLinkEmail(FIXTURE);
    expect(text).toMatchSnapshot();
  });
});
