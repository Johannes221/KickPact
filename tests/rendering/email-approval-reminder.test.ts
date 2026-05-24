/**
 * Snapshot + field-assertion tests for the approval-reminder email template.
 *
 * Adapted from Phase 6, Task 6.2: the real template is `approvalReminderEmail`
 * (a plain function) at `lib/mail/templates/approval-reminder.tsx`, not a
 * React component requiring `@react-email/render`. The function already
 * returns `{ subject, html, text }`, so we assert directly against html/text.
 *
 * The plan's `reminderCount` / "letzte Erinnerung" notice does not exist in
 * the current template — that sub-case is skipped with a TODO until the
 * template grows a reminder-count branch.
 */
import { describe, it, expect } from "vitest";
import { approvalReminderEmail } from "../../lib/mail/templates/approval-reminder";

const FIXTURE = {
  sponsorName: "Familie Müller",
  pendingCount: 1,
  items: [
    {
      teamName: "Herren 1",
      clubName: "FC Sportfreunde 1910 Dossenheim",
      eventLabel: "Hackentor von Lukas Wagner (Min. 67)",
      amountEur: "5,00 €",
      matchDate: "01.05.2026"
    }
  ],
  inboxUrl: "https://kickpact.de/sponsor/inbox"
};

describe("Approval reminder email", () => {
  it("renders all key fields in html + text", () => {
    const { html, text, subject } = approvalReminderEmail(FIXTURE);
    expect(subject).toContain("1 Event");
    expect(html).toContain("Familie Müller");
    expect(html).toContain("Hackentor");
    expect(html).toContain("5,00");
    expect(html).toContain("https://kickpact.de/sponsor/inbox");
    expect(text).toContain("Familie Müller");
    expect(text).toContain("Hackentor");
  });

  it("plural subject for pendingCount > 1", () => {
    const { subject } = approvalReminderEmail({ ...FIXTURE, pendingCount: 3 });
    expect(subject).toContain("3 Events");
  });

  it("html snapshot", () => {
    const { html } = approvalReminderEmail(FIXTURE);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });

  it("text snapshot", () => {
    const { text } = approvalReminderEmail(FIXTURE);
    expect(text).toMatchSnapshot();
  });

  // TODO: Re-enable once the template supports a reminderCount / dunning level.
  // The plan asks for a "letzte Erinnerung" notice on reminderCount=3, but
  // the current template does not branch on a count parameter.
  it.skip("reminderCount=3 includes 'letzte Erinnerung' notice (requires template extension)", () => {
    // const { html } = approvalReminderEmail({ ...FIXTURE, reminderCount: 3 });
    // expect(html).toMatch(/letzte erinnerung/i);
  });
});
