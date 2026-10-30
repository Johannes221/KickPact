import { describe, expect, it } from "vitest";
import { morningBriefingEmail } from "@/lib/mail/templates/morning-briefing";
import type { MorningBriefingData } from "@/lib/db/queries/morning-briefing";

const data: MorningBriefingData = {
  windowStart: new Date("2026-07-20T06:00:00Z"),
  windowEnd: new Date("2026-07-21T06:00:00Z"),
  neu: {
    users: 3,
    clubs: 1,
    teams: 2,
    subscriptions: 1,
    activatedLicenses: 2,
    chargesCount: 4,
    chargesCents: 4550
  },
  bestand: {
    users: 120,
    clubs: 18,
    activeTeams: 22,
    activeSubscriptions: 9,
    trialingSubscriptions: 5,
    mrrCents: 809100,
    trialToPaidPercent: 40,
    churnPercent: 3
  }
};

describe("morningBriefingEmail", () => {
  it("renders subject with the day's headline deltas", () => {
    const mail = morningBriefingEmail({ data, dateLabel: "Dienstag, 21. Juli", dashboardUrl: "https://x/admin/dashboard" });
    expect(mail.subject).toContain("+3 Nutzer");
    expect(mail.subject).toContain("+2 Teams");
    expect(mail.subject).toContain("+2 Verkäufe");
  });

  it("formats cents as euro and includes both blocks in text + html", () => {
    const mail = morningBriefingEmail({ data, dateLabel: "Dienstag, 21. Juli", dashboardUrl: "https://x/admin/dashboard" });
    // 4550 cents → 45,50 €
    expect(mail.text).toContain("45,50");
    // MRR 809100 cents → 8.091 € (keine Nachkommastellen, weil glatt)
    expect(mail.text).toContain("8.091");
    expect(mail.text).toContain("Neu (letzte 24 h)");
    expect(mail.text).toContain("Bestand");
    expect(mail.html).toContain("Morgen-Briefing");
    expect(mail.html).toContain("https://x/admin/dashboard");
  });
});
