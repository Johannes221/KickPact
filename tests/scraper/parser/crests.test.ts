/**
 * Wappen-Extraktion aus den Spielplan-Zeilen (fussball.de).
 *
 * Gegen ECHTE Fixtures, nicht gegen selbstgebautes HTML: die Struktur
 * (`td.column-club a.club-wrapper` → team-id im href, Wappen-URL im
 * `data-responsive-image`) ist fussball.de's, nicht unsere. Ein selbst
 * geschriebener Schnipsel würde nur beweisen, dass der Parser meine eigene
 * Annahme parst.
 *
 * Warum das überhaupt zählt: das Wappen hängt an der team-id, und die ist die
 * Kennung, über die die Pipeline Heim/Gast auseinanderhält. Ein Wappen an der
 * falschen team-id säße als fremder Verein auf einer Story, die ein echter
 * Verein unter seinem Namen teilt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import {
  extractCrestsFromRow as extractCrestsForTest,
  normalizeCrestUrl
} from "../../../lib/crawler/fussballde";

const HTML_DIR = join(process.cwd(), "tests/fixtures/scraper/html");

/** Alle echten Spielplan-Fixtures (die mit `-spiele-` im Namen). */
function spielplanFixtures(): string[] {
  const out: string[] = [];
  for (const club of readdirSync(HTML_DIR)) {
    if (club === "negative" || club === "synthetic" || club === "squad") continue;
    const dir = join(HTML_DIR, club);
    for (const f of readdirSync(dir)) {
      if (f.includes("-spiele-") && f.endsWith(".html")) out.push(join(dir, f));
    }
  }
  return out;
}

describe("Wappen aus der Spielplan-Zeile", () => {
  it("liest team-id und Wappen-URL beider Seiten", () => {
    const html = readFileSync(
      join(HTML_DIR, "heidelberg-kirchheim/herren1-spiele-saison2425-next-p1.html"),
      "utf8"
    );
    const rows = parse(html)
      .querySelectorAll("tr")
      .filter((tr) => tr.querySelector('a[href*="/spiel/"]'));
    expect(rows.length).toBeGreaterThan(0);

    const crests = extractCrestsForTest(rows[0]);
    expect(crests).toHaveLength(2);
    expect(crests[0]).toEqual({
      teamId: "011MIEN69S000000VTVG0001VTR8C1K7",
      url: "https://www.fussball.de/export.media/-/action/getLogo/format/2/id/00ES8GNA0G000018VV0AG08LVUPGND5I",
      name: "Tvgg. Lorsch"
    });
    expect(crests[1].teamId).toBe("011MIB1CUC000000VTVG0001VTR8C1K7");
    expect(crests[1].name).toBe("SG HD-Kirchheim");
  });

  it("hebt das Wappen auf format/2 — die größte Auflösung, die fussball.de hergibt", () => {
    // Im HTML steht format/0 (80px). 99px ist das Maximum; im Motiv landet das
    // Wappen auf 240px, da zählt jedes Pixel.
    const html = readFileSync(
      join(HTML_DIR, "heidelberg-kirchheim/herren1-spiele-saison2425-next-p1.html"),
      "utf8"
    );
    const tr = parse(html)
      .querySelectorAll("tr")
      .find((t) => t.querySelector('a[href*="/spiel/"]'))!;
    for (const c of extractCrestsForTest(tr)) {
      expect(c.url).toContain("/format/2/");
      expect(c.url.startsWith("https://")).toBe(true);
    }
  });

  it("liefert für JEDE echte Spielplan-Fixture nur plausible Wappen", () => {
    const files = spielplanFixtures();
    expect(files.length).toBeGreaterThan(0);

    let gesamt = 0;
    for (const f of files) {
      for (const tr of parse(readFileSync(f, "utf8")).querySelectorAll("tr")) {
        if (!tr.querySelector('a[href*="/spiel/"]')) continue;
        const crests = extractCrestsForTest(tr);
        // Nie mehr als die zwei Seiten einer Begegnung.
        expect(crests.length).toBeLessThanOrEqual(2);
        for (const c of crests) {
          expect(c.teamId).toMatch(/^[A-Z0-9]{10,}$/);
          expect(c.url).toMatch(
            /^https:\/\/www\.fussball\.de\/export\.media\/-\/action\/getLogo\/format\/2\/id\/[A-Z0-9]+$/
          );
          gesamt++;
        }
      }
    }
    // Wenn das auf 0 fällt, hat fussball.de das Markup geändert und der Parser
    // ist still tot — der Test wäre sonst grün und die Motive wappenlos.
    expect(gesamt).toBeGreaterThan(10);
  });

  it("überspringt Zeilen ohne Wappen, statt zu raten", () => {
    const tr = parse(
      `<tr><td class="column-club"><a href="/mannschaft/x/-/team-id/011ABCDEF0000000VTVG0001VTR8C1K7" class="club-wrapper">
         <div class="club-logo"><span data-alt="Ohne Bild"></span></div></a></td>
       <td class="column-club"><a class="club-wrapper"><div class="club-logo">
         <span data-responsive-image="//www.fussball.de/export.media/-/action/getLogo/format/0/id/00ES8GNA0G000018VV0AG08LVUPGND5I"></span>
       </div></a></td></tr>`
    ).querySelector("tr")!;
    // Erste Seite: team-id da, Bild fehlt. Zweite: Bild da, team-id fehlt.
    // Beides einzeln wertlos — ein Wappen ohne team-id könnte sonst der
    // falschen Seite zugeordnet werden.
    expect(extractCrestsForTest(tr)).toEqual([]);
  });

  it("ignoriert fremde Bild-URLs, die keine getLogo-Wappen sind", () => {
    const tr = parse(
      `<tr><td class="column-club"><a href="/mannschaft/x/-/team-id/011ABCDEF0000000VTVG0001VTR8C1K7" class="club-wrapper">
         <div class="club-logo"><span data-alt="Tracking-Pixel"
           data-responsive-image="//www.fussball.de/export.media/-/action/getBanner/format/2/id/XYZ"></span></div></a></td></tr>`
    ).querySelector("tr")!;
    expect(extractCrestsForTest(tr)).toEqual([]);
  });
});

describe("normalizeCrestUrl", () => {
  it("macht protokoll-relative getLogo-URLs absolut und hebt sie auf format/2", () => {
    expect(
      normalizeCrestUrl(
        "//www.fussball.de/export.media/-/action/getLogo/format/0/id/00ES8GNA0G000018VV0AG08LVUPGND5I"
      )
    ).toBe(
      "https://www.fussball.de/export.media/-/action/getLogo/format/2/id/00ES8GNA0G000018VV0AG08LVUPGND5I"
    );
  });

  it("lässt eine bereits absolute URL absolut und bumpt nur das Format", () => {
    expect(
      normalizeCrestUrl(
        "https://www.fussball.de/export.media/-/action/getLogo/format/5/id/ABC123"
      )
    ).toBe("https://www.fussball.de/export.media/-/action/getLogo/format/2/id/ABC123");
  });

  it("verwirft nicht-getLogo-Bilder (Banner/Tracking) und Leerwerte", () => {
    expect(
      normalizeCrestUrl("//www.fussball.de/export.media/-/action/getBanner/format/2/id/XYZ")
    ).toBeNull();
    expect(normalizeCrestUrl(undefined)).toBeNull();
    expect(normalizeCrestUrl(null)).toBeNull();
    expect(normalizeCrestUrl("")).toBeNull();
  });
});

/**
 * Der Tabellen-Scrape (`getLeagueStandings`) läuft im echten Browser
 * (`page.evaluate`), lässt sich also nicht wie der fetch-Pfad gegen eine
 * gespeicherte Fixture fahren. Dieser Test prüft dieselbe Extraktions-Logik, die
 * die evaluate nutzt — `span[data-responsive-image]` mit „getLogo" → an
 * `normalizeCrestUrl` — gegen eine repräsentative Tabellenzeile, damit eine
 * Struktur-Änderung an fussball.de nicht still ins Leere läuft.
 *
 * ACHTUNG: Die exakte Tabellen-Markup-Struktur ist mangels Fixture NICHT
 * live verifiziert (Selektor bewusst breit gehalten + getLogo-Guard).
 */
describe("Wappen aus der Liga-Tabellenzeile", () => {
  function crestFromStandingsRow(tr: ReturnType<typeof parse>): string | null {
    const span = tr
      .querySelectorAll("span[data-responsive-image]")
      .find((sp) => (sp.getAttribute("data-responsive-image") || "").includes("getLogo"));
    return normalizeCrestUrl(span?.getAttribute("data-responsive-image"));
  }

  it("liest das getLogo-Wappen einer Tabellenzeile auf format/2", () => {
    const tr = parse(
      `<tr>
        <td class="column-rank">6.</td>
        <td class="column-club"><a href="/mannschaft/x/-/team-id/011MIB6294000000VTVG0001VTR8C1K7" class="club-wrapper">
          <div class="club-logo"><span data-alt="ASC Neuenheim"
            data-responsive-image="//www.fussball.de/export.media/-/action/getLogo/format/0/id/00ES8GNA0G000018VV0AG08LVUPGND5I"></span></div>
          <span class="club-name">ASC Neuenheim</span></a></td>
        <td>34</td><td>14</td><td>6</td><td>14</td><td>69:66</td><td>48</td>
      </tr>`
    ).querySelector("tr")!;
    expect(crestFromStandingsRow(tr)).toBe(
      "https://www.fussball.de/export.media/-/action/getLogo/format/2/id/00ES8GNA0G000018VV0AG08LVUPGND5I"
    );
  });

  it("liefert null für eine Zeile ohne Wappen (Story fällt aufs Kürzel zurück)", () => {
    const tr = parse(
      `<tr><td class="column-rank">7.</td><td class="column-club">SV Ohne Wappen</td><td>34</td></tr>`
    ).querySelector("tr")!;
    expect(crestFromStandingsRow(tr)).toBeNull();
  });
});
