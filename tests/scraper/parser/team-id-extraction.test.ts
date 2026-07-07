/**
 * getSpielDetails muss die fussball.de-team-id BEIDER Seiten (heim/gast) aus der
 * Detailseite ziehen. Das ist die EINDEUTIGE Team-Kennung, mit der evaluate-match
 * die eigene Seite deterministisch bestimmt — statt über kollisionsanfälliges
 * Namens-Token-Matching (Reserve-Derby / gleiche Stadt → falsche Seite → falsche
 * Charges). Siehe lib/crawler/team-side.ts + resolveTeamSide.
 *
 * Die team-id steht in `.team-home .team-name a[href*="team-id"]` bzw.
 * `.team-away .team-name a[href*="team-id"]` (verifiziert am Fixture unten:
 * heim = Tvgg. Lorsch, gast = SG HD-Kirchheim).
 */
import { describe, it, expect, vi } from "vitest";
import { withMockedFetch } from "../../setup/fetch-mocks";
import { getSpielDetails } from "../../../lib/crawler/fussballde";

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

const SPIEL_ID = "0312K8J110000000VS5489BUVSBBVPEU";
const HTML_REL = `heidelberg-kirchheim/herren1-spiel-${SPIEL_ID}.html`;

describe("getSpielDetails: team-id-Extraktion", () => {
  it("zieht heim/gast fussball.de-team-id aus der Detailseite", async () => {
    const details = await withMockedFetch(
      [{ matchUrl: new RegExp(`spiel/${SPIEL_ID}$`), htmlPath: HTML_REL }],
      () => getSpielDetails(SPIEL_ID, "herren1"),
    );

    expect(details.heimTeamId).toBe("011MIEN69S000000VTVG0001VTR8C1K7"); // Tvgg. Lorsch
    expect(details.gastTeamId).toBe("011MIB1CUC000000VTVG0001VTR8C1K7"); // SG HD-Kirchheim
  });
});
