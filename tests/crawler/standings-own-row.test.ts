import { describe, it, expect } from "vitest";
import {
  selectOwnRow,
  saisonFromTeamPageUrl,
  type LeagueStandingRow
} from "@/lib/crawler/fussballde";

/**
 * Echte Zeilen aus der Landesliga Baden 25/26 (fussball.de, live abgelesen
 * 2026-07-17, Staffel 02TGQ5NCSC00000BVS5489BTVTLPPK10-G).
 */
const LANDESLIGA_2526: LeagueStandingRow[] = [
  row(6, "ASC Neuenheim", "011MIB6294000000VTVG0001VTR8C1K7", 34, 14, 6, 14, 69, 66, 48),
  row(10, "FC Sportfreunde 1910 Dossenheim", "011MIAE8VG000000VTVG0001VTR8C1K7", 34, 14, 4, 16, 62, 80, 46)
];

function row(
  position: number,
  teamName: string,
  teamId: string | null,
  spiele: number,
  siege: number,
  unentschieden: number,
  niederlagen: number,
  toreFor: number,
  toreAgainst: number,
  punkte: number
): LeagueStandingRow {
  return {
    position,
    teamName,
    teamId,
    spiele,
    siege,
    unentschieden,
    niederlagen,
    toreFor,
    toreAgainst,
    punkte
  };
}

describe("selectOwnRow", () => {
  it("matcht über die fussball.de-team-id, nicht über den Namen", () => {
    const own = selectOwnRow(
      LANDESLIGA_2526,
      "011MIAE8VG000000VTVG0001VTR8C1K7",
      "FC Sportfr. Dossenheim"
    );
    expect(own?.teamName).toBe("FC Sportfreunde 1910 Dossenheim");
    expect(own?.spiele).toBe(34);
  });

  /**
   * Regression: `clubs.name` ist "FC Sportfr. Dossenheim", die Tabellenzeile
   * heißt "FC Sportfreunde 1910 Dossenheim". Das Token "sportfr." (mit Punkt)
   * kommt dort nie vor → das alte Namens-Matching lieferte null, das Wrapped
   * fiel still auf die ~10 gescrapten Spiele zurück und zeigte 10 statt 34
   * Spiele als "Eure Bilanz" (verifiziert 2026-07-17 auf Staging).
   */
  it("findet die Zeile trotz abgekürztem Vereinsnamen mit Punkt", () => {
    const own = selectOwnRow(
      LANDESLIGA_2526,
      "011MIAE8VG000000VTVG0001VTR8C1K7",
      "FC Sportfr. Dossenheim"
    );
    expect(own).not.toBeNull();
  });

  /**
   * Regression: die B-Junioren spielen als "JSG Dossenheim/Handschuhsheim/
   * Wieblingen", der Verein heißt "FC Sportfr. Dossenheim". Über den
   * Vereinsnamen ist diese Zeile prinzipiell nicht findbar.
   */
  it("findet die Spielgemeinschaft, deren Name nichts mit dem Verein zu tun hat", () => {
    const rows = [
      row(4, "JSG Dossenheim/Handschuhsheim/ Wieblingen", "02M5ATUO1C000000VS5489B1VT732LUQ", 8, 4, 1, 3, 25, 16, 13)
    ];
    const own = selectOwnRow(rows, "02M5ATUO1C000000VS5489B1VT732LUQ", "FC Sportfr. Dossenheim");
    expect(own?.position).toBe(4);
  });

  /**
   * Die team-id trennt Erste und Zweite zuverlässig — Namens-Tokens nicht:
   * "ASC Neuenheim" ist ein Präfix von "ASC Neuenheim 2".
   */
  it("verwechselt Erste und Zweite nicht", () => {
    const rows = [
      row(6, "ASC Neuenheim", "011MIB6294000000VTVG0001VTR8C1K7", 34, 14, 6, 14, 69, 66, 48),
      row(15, "ASC Neuenheim 2", "01L04TESMO000000VV0AG80NVVQMG8U7", 30, 5, 0, 25, 51, 123, 15)
    ];
    expect(selectOwnRow(rows, "01L04TESMO000000VV0AG80NVVQMG8U7", "ASC Neuenheim")?.position).toBe(15);
    expect(selectOwnRow(rows, "011MIB6294000000VTVG0001VTR8C1K7", "ASC Neuenheim")?.position).toBe(6);
  });

  it("fällt auf das Namens-Matching zurück, wenn die Zeile keine team-id trägt", () => {
    const rows = [row(6, "FG Union Heidelberg", null, 24, 12, 6, 6, 76, 45, 42)];
    expect(selectOwnRow(rows, "011MIEDJ70000000VTVG0001VTR8C1K7", "FG Union Heidelberg")?.position).toBe(6);
  });

  /**
   * Der Namens-Fallback darf NUR greifen, wenn er eindeutig ist. Ohne team-ids
   * (z.B. wenn fussball.de die Zeilen nicht mehr verlinkt) matchen die Tokens
   * von "ASC Neuenheim" auch "ASC Neuenheim 2" — `find()` nähme einfach die
   * erste Zeile und schriebe der Ersten die Bilanz der Zweiten zu, ausgewiesen
   * als verifizierte Tabellen-Quelle. Lieber null als die falsche Zeile.
   */
  it("liefert null statt zu raten, wenn der Namens-Fallback mehrdeutig ist", () => {
    const rows = [
      row(6, "ASC Neuenheim 2", null, 30, 5, 0, 25, 51, 123, 15),
      row(9, "ASC Neuenheim", null, 34, 14, 6, 14, 69, 66, 48)
    ];
    expect(selectOwnRow(rows, "ID-DER-ERSTEN", "ASC Neuenheim")).toBeNull();
  });

  it("liefert null statt einer geratenen Zeile, wenn nichts passt", () => {
    expect(selectOwnRow(LANDESLIGA_2526, "UNBEKANNT", "SV Nirgendwo")).toBeNull();
  });
});

describe("saisonFromTeamPageUrl", () => {
  /**
   * Regression/Zeitzünder: fussball.de leitet die Mannschaftsseite still auf die
   * LAUFENDE Saison um, sobald die team-id dort eine Mannschaft hat. Am
   * 2026-07-17 verifiziert: .../saison/2526/team-id/011MIAE8VG... landet auf
   * .../saison/2627/... und liefert die LEERE neue Tabelle (alle Teams 0 Spiele,
   * Platz 1). Ohne Guard würden diese Nullen unter dem Key 2526 gespeichert und
   * das Wrapped zeigte "0 Spiele, Platz 1" für die abgeschlossene Saison.
   */
  it("liest die Saison aus der (ggf. umgeleiteten) URL", () => {
    expect(
      saisonFromTeamPageUrl(
        "https://www.fussball.de/mannschaft/fc-sportfreunde-1910-dossenheim-fc-sportfr-dossenheim-baden/-/saison/2627/team-id/011MIAE8VG000000VTVG0001VTR8C1K7#!/"
      )
    ).toBe("2627");
  });

  it("erkennt die nicht umgeleitete Saison", () => {
    expect(
      saisonFromTeamPageUrl(
        "https://www.fussball.de/mannschaft/jsg-dossenheim-handschuhsheim-wieblingen-fc-sportfr-dossenheim-baden/-/saison/2526/team-id/02M5ATUO1C000000VS5489B1VT732LUQ#!/"
      )
    ).toBe("2526");
  });

  /**
   * Die Staffel-Seite trägt die Saison im SLUG, nicht als Pfad-Segment. Ohne
   * diesen Fall wäre der Guard auf dem Staffel-Pfad blind — und eine staffelId
   * aus einer falschen Saison (z.B. von einer vor dem Redirect-Fix
   * geschriebenen Zeile) würde ihre eigene Falschheit endlos fortschreiben.
   */
  it("liest die Saison auch aus dem Staffel-Slug", () => {
    expect(
      saisonFromTeamPageUrl(
        "https://www.fussball.de/spieltag/bfv-landesliga-rhein-neckar-baden-landesliga-herren-saison2526-baden/-/staffel/02TGQ5NCSC00000BVS5489BTVTLPPK10-G#!/section/table"
      )
    ).toBe("2526");
  });

  it("erkennt die falsche Saison im Staffel-Slug", () => {
    expect(
      saisonFromTeamPageUrl(
        "https://www.fussball.de/spieltag/bfv-kreisliga-heidelberg-herren-saison2627-baden/-/staffel/X-G#!/section/table"
      )
    ).toBe("2627");
  });

  it("liefert null, wenn die URL keine Saison trägt", () => {
    expect(saisonFromTeamPageUrl("https://www.fussball.de/")).toBeNull();
  });
});
