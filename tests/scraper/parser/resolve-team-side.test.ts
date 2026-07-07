/**
 * resolveTeamSide bestimmt die eigene Spielseite DETERMINISTISCH über die
 * fussball.de-team-id (eindeutig), und fällt nur dann auf das kollisionsanfällige
 * Namens-Matching (detectTeamSide) zurück, wenn keine team-ids gespeichert sind
 * (Alt-Matches vor der Migration).
 *
 * Kernbug (HIGH, stilles Falschgeld): detectTeamSide kippt bei geteiltem
 * Stadt-/Vereins-Token auf die falsche Seite. Diese Fälle MÜSSEN über die
 * team-id korrekt aufgelöst werden.
 */
import { describe, it, expect } from "vitest";
import { resolveTeamSide } from "../../../lib/crawler/team-side";

const OWN = "011OWN0000000000000000000000000";
const OPP = "011OPP0000000000000000000000000";

describe("resolveTeamSide", () => {
  describe("deterministisch via fussball.de-team-id", () => {
    it("Reserve-Derby: eigenes Team ist GAST, obwohl Name im heimName steckt", () => {
      // "SV Sandhausen III" (heim) vs "SV Sandhausen II" (gast=wir).
      // Namens-Matching würde "sandhausen" im heimName finden → fälschlich "heim".
      // team-id löst korrekt auf.
      const side = resolveTeamSide(
        {
          heimTeamId: OPP,
          gastTeamId: OWN,
          heimName: "SV Sandhausen III",
          gastName: "SV Sandhausen II",
        },
        OWN,
        ["SV Sandhausen II", "SV Sandhausen"],
      );
      expect(side).toBe("gast");
    });

    it("Gleiche Stadt: wir sind GAST (TSG Weinheim), Gegner FC Weinheim ist heim", () => {
      const side = resolveTeamSide(
        {
          heimTeamId: OPP,
          gastTeamId: OWN,
          heimName: "FC Weinheim",
          gastName: "TSG Weinheim",
        },
        OWN,
        ["TSG Weinheim", "TSG Weinheim"],
      );
      expect(side).toBe("gast");
    });

    it("eigenes Team ist HEIM", () => {
      const side = resolveTeamSide(
        {
          heimTeamId: OWN,
          gastTeamId: OPP,
          heimName: "SV Sandhausen II",
          gastName: "SV Sandhausen III",
        },
        OWN,
        ["SV Sandhausen II", "SV Sandhausen"],
      );
      expect(side).toBe("heim");
    });
  });

  describe("Fallback auf Namens-Matching (Alt-Matches ohne team-id)", () => {
    it("nutzt detectTeamSide, wenn team-ids NULL sind", () => {
      const side = resolveTeamSide(
        { heimTeamId: null, gastTeamId: null, heimName: "SV Schriesheim" },
        OWN,
        ["1. Herren", "SV Schriesheim"],
      );
      expect(side).toBe("heim");
    });

    it("nutzt Fallback auch, wenn eigene fussballdeTeamId fehlt", () => {
      const side = resolveTeamSide(
        { heimTeamId: OPP, gastTeamId: OWN, heimName: "SG Hohensachsen" },
        null,
        ["1. Herren", "SV Schriesheim"],
      );
      expect(side).toBe("gast");
    });

    it("Fallback, wenn die eigene team-id auf keiner Seite auftaucht", () => {
      // Datendrift: gespeicherte ids passen nicht → nicht raten via id, sondern
      // sauber über den Namen fallbacken.
      const side = resolveTeamSide(
        {
          heimTeamId: "011XXX0000000000000000000000000",
          gastTeamId: "011YYY0000000000000000000000000",
          heimName: "SV Schriesheim",
        },
        OWN,
        ["1. Herren", "SV Schriesheim"],
      );
      expect(side).toBe("heim");
    });
  });
});
