import { describe, it, expect } from "vitest";
import { buildTeamPublicSlug, makeSlugSuffix } from "@/lib/utils/team-slug";

describe("buildTeamPublicSlug", () => {
  it("kombiniert Verein + Mannschaft, hängt Suffix an", () => {
    expect(buildTeamPublicSlug("FC Beispiel", "1. Herren", "a3f9")).toBe(
      "fc-beispiel-1-herren-a3f9"
    );
  });

  it("entfernt Umlaute/Sonderzeichen (strict)", () => {
    const slug = buildTeamPublicSlug("SV Grün-Weiß", "Erste Mädels", "00xx");
    expect(slug).toMatch(/^[a-z0-9-]+-00xx$/);
    expect(slug).not.toMatch(/[äöüß]/);
  });

  it("fällt bei leerem Namen auf 'team' zurück", () => {
    expect(buildTeamPublicSlug("", "", "zzzz")).toBe("team-zzzz");
  });

  it("makeSlugSuffix liefert 4 base36-Zeichen", () => {
    const s = makeSlugSuffix();
    expect(s).toMatch(/^[a-z0-9]{1,4}$/);
  });
});
