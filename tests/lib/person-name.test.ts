import { describe, it, expect } from "vitest";
import {
  cleanPlayerName,
  isLikelyPlayerName,
  extractSuffixClub,
  suffixClubMatchesOwn,
  playerDedupKey
} from "@/lib/players/person-name";

describe("cleanPlayerName", () => {
  it("strippt das (Verein) Spieler-Suffix", () => {
    expect(cleanPlayerName("Tobias Kruse (FG Union Heidelberg) Spieler")).toBe("Tobias Kruse");
    expect(cleanPlayerName("Ümit Olgun (FC Spechbach) Spieler")).toBe("Ümit Olgun");
    expect(cleanPlayerName("Max Mustermann Spieler")).toBe("Max Mustermann");
    expect(cleanPlayerName("Adel Chaabou")).toBe("Adel Chaabou");
  });
});

describe("extractSuffixClub", () => {
  it("liest den Verein aus dem Suffix", () => {
    expect(extractSuffixClub("Ümit Olgun (FC Spechbach) Spieler")).toBe("FC Spechbach");
    expect(extractSuffixClub("Adel Chaabou")).toBeNull();
  });
});

describe("isLikelyPlayerName", () => {
  it("akzeptiert echte Spielernamen", () => {
    for (const n of [
      "Adel Chaabou",
      "Juan Esteban Mora Zepeda",
      "Mohamed Amine Belhajjem",
      "Eduardo Maximiliano Ruiz",
      "Tobias Kruse (FG Union Heidelberg) Spieler", // Suffix wird gestrippt
      "Ümit Olgun" // Personenname an sich plausibel (Gegner-Check ist separat)
    ]) {
      expect(isLikelyPlayerName(n), n).toBe(true);
    }
  });

  it("verwirft Match-Bericht-Überschriften", () => {
    for (const n of [
      "FG Union Heidelberg feiert Sieg in Neckargemünd",
      "FG Union Heidelberg siegt in Heiligkreuzsteinach klar und verdient",
      "FG Union Heidelberg verliert Spitzenspiel in Bammental",
      "Sprecakovic glänzt als dreifacher Torschütze",
      "Tore am laufenden Band für SpG Schönau 1/Altneudorf 1/Neckarsteinach 2",
      "Keine Tore in Schönau",
      "Heidelberger SC 3 verliert in Heidelberg",
      "Eberbacher SC 2 auf dem absteigenden Ast"
    ]) {
      expect(isLikelyPlayerName(n), n).toBe(false);
    }
  });

  it("verwirft Leeres / Tofu", () => {
    expect(isLikelyPlayerName("")).toBe(false);
    expect(isLikelyPlayerName(null)).toBe(false);
    expect(isLikelyPlayerName("")).toBe(false);
  });
});

describe("suffixClubMatchesOwn", () => {
  const OWN = "FG Union Heidelberg";
  it("akzeptiert den eigenen Verein", () => {
    expect(suffixClubMatchesOwn("FG Union Heidelberg", OWN)).toBe(true);
    expect(suffixClubMatchesOwn("Union Heidelberg", OWN)).toBe(true);
    expect(suffixClubMatchesOwn("FG Union 1911 Heidelberg", OWN)).toBe(true);
  });
  it("erkennt Stadt-Kollisions-Gegner als FREMD", () => {
    // teilt nur das Stadt-Fragment 'Heidelberg', NICHT 'Union' → Gegner
    expect(suffixClubMatchesOwn("Heidelberger SC", OWN)).toBe(false);
    expect(suffixClubMatchesOwn("SV Heidelberg", OWN)).toBe(false);
  });
  it("erkennt klar fremde Vereine", () => {
    expect(suffixClubMatchesOwn("FC Spechbach", OWN)).toBe(false);
    expect(suffixClubMatchesOwn("SpVgg. Neckargemünd", OWN)).toBe(false);
    expect(suffixClubMatchesOwn("Eberbacher SC", OWN)).toBe(false);
  });
});

describe("playerDedupKey", () => {
  it("führt Suffix-Variante und Reinform zusammen", () => {
    expect(playerDedupKey("Tobias Kruse (FG Union Heidelberg) Spieler")).toBe(
      playerDedupKey("Tobias Kruse")
    );
    expect(playerDedupKey("Ümit Olgun")).toBe(playerDedupKey("Umit Olgun"));
  });
});
