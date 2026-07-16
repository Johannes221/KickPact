import { describe, it, expect } from "vitest";
import { ImageResponse } from "next/og";
import { mkdirSync, writeFileSync } from "node:fs";
import { StoryCard, STORY_SIZE } from "@/lib/story/story-card";
import type { StoryModel } from "@/lib/story/story-data";

/**
 * Render-Smoke der Story-Vorlagen (Aufgabe #44).
 *
 * Warum als Test und nicht als Skript: Satori (next/og) WIRFT bei Layout-
 * Fehlern, die man im Code nicht sieht — allen voran der Klassiker „Expected
 * <div> to have explicit display: flex". Ein Motiv, das erst beim Teilen kaputt
 * geht, ist genau das, was hier nicht passieren darf.
 *
 * Abgedeckt sind vor allem die DEGRADATIONS-Fälle, die bei Amateurvereinen der
 * Normalfall sind (kein Logo, keine Tabelle, keine Torschützen, keine Liga) und
 * die sich auf Staging kaum gezielt herstellen lassen.
 *
 * Die Motive zum Anschauen rausschreiben:
 *   STORY_SAMPLE_DIR=/tmp/story npx vitest run tests/lib/story-card.test.tsx
 */

// 1×1-PNG als Stellvertreter für ein hochgeladenes Logo.
const FAKE_LOGO =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SAMPLES: Record<string, StoryModel> = {
  // Bestfall Vorschau: beide Logos, Liga, beide Tabellenplätze.
  "vorschau-voll": {
    kind: "vorschau",
    matchId: "m1",
    teamName: "SV Sandhausen",
    league: "Kreisliga A Heidelberg",
    ownSide: "heim",
    teamsInLeague: 14,
    kickoff: "Samstag",
    dateLine: "Sa., 18.07.2026",
    heim: { name: "SV Sandhausen", crest: { kind: "logo", src: FAKE_LOGO }, position: 3 },
    gast: { name: "FC Bayern München", crest: { kind: "logo", src: FAKE_LOGO }, position: 7 }
  },
  // Normalfall Amateur: kein Logo, keine Tabelle, keine Liga.
  "vorschau-nackt": {
    kind: "vorschau",
    matchId: "m2",
    teamName: "Sportfreunde Dossenheim",
    league: null,
    ownSide: "gast",
    teamsInLeague: null,
    kickoff: "Heute",
    dateLine: "Do., 16.07.2026",
    heim: { name: "TSG 1899 Hoffenheim II", crest: { kind: "abbrev", text: "TSGH" }, position: null },
    gast: { name: "Sportfreunde Dossenheim", crest: { kind: "abbrev", text: "SD" }, position: null }
  },
  // Häufigster realer Fall: eigenes Logo da, Gegner nicht.
  "rueckblick-heimsieg": {
    kind: "rueckblick",
    matchId: "m3",
    teamName: "SV Sandhausen",
    league: "Kreisliga A Heidelberg",
    ownSide: "heim",
    teamsInLeague: 14,
    dateLine: "Sa., 11.07.2026",
    ergebnisHeim: 3,
    ergebnisGast: 1,
    headline: { outcome: "sieg", headline: "Heimsieg", kicker: "Drei Punkte bleiben daheim" },
    scorers: [
      { name: "Maximilian Mustermann", tore: 2 },
      { name: "Ali Veli", tore: 1 }
    ],
    heim: { name: "SV Sandhausen", crest: { kind: "logo", src: FAKE_LOGO }, position: 3 },
    gast: { name: "FC Bayern München", crest: { kind: "abbrev", text: "FCB" }, position: 7 }
  },
  // Auswärtssieg ohne jeden Torschützen (fussball.de-Coverage fehlt).
  "rueckblick-auswaertssieg-ohne-schuetzen": {
    kind: "rueckblick",
    matchId: "m4",
    teamName: "Sportfreunde Dossenheim",
    league: "C-Junioren Kreisstaffel",
    ownSide: "gast",
    teamsInLeague: null,
    dateLine: "So., 12.07.2026",
    ergebnisHeim: 1,
    ergebnisGast: 4,
    headline: { outcome: "sieg", headline: "Auswärtssieg", kicker: "Punkte im Gepäck" },
    scorers: [],
    heim: { name: "TSG 1899 Hoffenheim II", crest: { kind: "abbrev", text: "TSGH" }, position: null },
    gast: { name: "Sportfreunde Dossenheim", crest: { kind: "abbrev", text: "SD" }, position: null }
  },
  "rueckblick-niederlage": {
    kind: "rueckblick",
    matchId: "m5",
    teamName: "SV Sandhausen",
    league: "Kreisliga A Heidelberg",
    ownSide: "heim",
    teamsInLeague: 14,
    dateLine: "Sa., 04.07.2026",
    ergebnisHeim: 0,
    ergebnisGast: 2,
    headline: {
      outcome: "niederlage",
      headline: "Niederlage",
      kicker: "Nächste Woche zurückschlagen"
    },
    scorers: [],
    heim: { name: "SV Sandhausen", crest: { kind: "logo", src: FAKE_LOGO }, position: 3 },
    gast: { name: "SpVgg Neckarelz", crest: { kind: "abbrev", text: "SPVG" }, position: 1 }
  },
  "rueckblick-unentschieden": {
    kind: "rueckblick",
    matchId: "m6",
    teamName: "SV Sandhausen",
    league: "Kreisliga A Heidelberg",
    ownSide: "gast",
    teamsInLeague: 14,
    dateLine: "Sa., 27.06.2026",
    ergebnisHeim: 2,
    ergebnisGast: 2,
    headline: {
      outcome: "unentschieden",
      headline: "Unentschieden",
      kicker: "Einen Punkt mitgenommen"
    },
    scorers: [{ name: "Maximilian Mustermann", tore: 2 }],
    heim: { name: "FC Bayern München", crest: { kind: "abbrev", text: "FCB" }, position: 7 },
    gast: { name: "SV Sandhausen", crest: { kind: "logo", src: FAKE_LOGO }, position: 3 }
  },
  // Überlauf-Schutz: sehr lange Namen + mehr Torschützen als Platz.
  "rueckblick-ueberlauf": {
    kind: "rueckblick",
    matchId: "m7",
    teamName: "SpVgg Neckarelz Mosbach Diedesheim",
    league: "Verbandsliga Nordbaden Staffel West",
    ownSide: "heim",
    teamsInLeague: 18,
    dateLine: "Sa., 20.06.2026",
    ergebnisHeim: 8,
    ergebnisGast: 0,
    headline: { outcome: "sieg", headline: "Heimsieg", kicker: "Drei Punkte bleiben daheim" },
    scorers: [
      { name: "Maximilian Mustermann", tore: 3 },
      { name: "Christoph Sonnenschein", tore: 2 },
      { name: "Ali Veli", tore: 1 },
      { name: "Jonas Bergmann-Schmitt", tore: 1 },
      { name: "Tim Weber", tore: 1 },
      { name: "Lukas Meier", tore: 1 },
      { name: "Ein Weiterer Spieler", tore: 1 }
    ],
    heim: {
      name: "SpVgg Neckarelz Mosbach Diedesheim",
      crest: { kind: "abbrev", text: "SPVG" },
      position: 2
    },
    gast: {
      name: "1. FC Kaiserslautern Reserve II",
      crest: { kind: "abbrev", text: "FCK" },
      position: 18
    }
  }
};

/** PNG-Magic-Bytes — beweist, dass wirklich ein Bild rausfiel. */
function isPng(buf: Buffer): boolean {
  return buf.subarray(0, 4).toString("hex") === "89504e47";
}

const OUT_DIR = process.env.STORY_SAMPLE_DIR;

describe("StoryCard rendert als 1080×1920-PNG", () => {
  for (const [name, model] of Object.entries(SAMPLES)) {
    it(name, async () => {
      const res = new ImageResponse(<StoryCard model={model} />, STORY_SIZE);
      const buf = Buffer.from(await res.arrayBuffer());

      expect(isPng(buf)).toBe(true);
      // Ein leeres/kaputtes Motiv wäre nur ein paar hundert Byte groß.
      expect(buf.length).toBeGreaterThan(5_000);

      if (OUT_DIR) {
        mkdirSync(OUT_DIR, { recursive: true });
        writeFileSync(`${OUT_DIR}/${name}.png`, buf);
      }
    }, 30_000);
  }
});
