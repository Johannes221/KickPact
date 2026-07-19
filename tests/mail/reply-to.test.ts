import { describe, expect, it } from "vitest";
import {
  KICKPACT_REPLY_TO,
  deriveReplyTo,
  highestPlanFrom
} from "@/lib/mail/reply-to-pure";

describe("highestPlanFrom", () => {
  it("leeres Array → basic", () => {
    expect(highestPlanFrom([])).toBe("basic");
  });

  it("gewinnt verein über pro über basic", () => {
    expect(highestPlanFrom(["basic", "pro", "verein"])).toBe("verein");
    expect(highestPlanFrom(["basic", "basic", "pro"])).toBe("pro");
    expect(highestPlanFrom(["basic", "basic"])).toBe("basic");
    expect(highestPlanFrom(["verein"])).toBe("verein");
  });
});

describe("deriveReplyTo", () => {
  it("System-Adresse liegt auf kickpact.com", () => {
    expect(KICKPACT_REPLY_TO).toBe("noreply@kickpact.com");
  });

  it("basic → System-Adresse, auch mit Vereins-Mail", () => {
    expect(deriveReplyTo("basic", "vorstand@fc-musterstadt.de")).toBe(
      KICKPACT_REPLY_TO
    );
  });

  it("pro → echte Vereins-Mail", () => {
    expect(deriveReplyTo("pro", "vorstand@fc-musterstadt.de")).toBe(
      "vorstand@fc-musterstadt.de"
    );
  });

  it("verein → echte Vereins-Mail", () => {
    expect(deriveReplyTo("verein", "info@tsv-baden.de")).toBe(
      "info@tsv-baden.de"
    );
  });

  // Der Kern des Fixes: früher wurde hier `<slug>@kickpact.de` erzeugt — eine
  // Adresse, die nie existierte. Sponsor-Antworten verschwanden spurlos. Ohne
  // bekannte Vereins-Mail MUSS auf ein real zustellbares Postfach zurückgefallen
  // werden, nicht auf eine erfundene Adresse.
  it("pro ohne hinterlegte Vereins-Mail → System-Adresse statt Blackhole", () => {
    expect(deriveReplyTo("pro", null)).toBe(KICKPACT_REPLY_TO);
    expect(deriveReplyTo("verein", "")).toBe(KICKPACT_REPLY_TO);
  });

  it("trimmt Whitespace und behandelt Leerraum wie fehlend", () => {
    expect(deriveReplyTo("pro", "  info@tsv-baden.de  ")).toBe(
      "info@tsv-baden.de"
    );
    expect(deriveReplyTo("pro", "   ")).toBe(KICKPACT_REPLY_TO);
  });
});
