import type { Deck } from "./decks";

/**
 * Story-Highlights zum Anpinnen (Johannes, 2026-07-17).
 *
 * Anders als ein Karussell: eine Story wird ANGETIPPT, nicht gewischt, und sie
 * bleibt als Highlight dauerhaft am Profil kleben. Wer sie liest, ist schon auf
 * dem Profil und hat sich aktiv dafür entschieden — das darf ruhiger und
 * erklärender sein als ein Feed-Post, der jemanden im Vorbeiscrollen abfangen
 * muss. Deshalb kürzere Sätze, weniger Pointe, mehr Antwort.
 *
 * Format ist 9:16 (`format: "story"`), Ausgabe unter `out/social/stories/`.
 *
 * Vier Highlights, weil vier Fragen: Wie läuft das? Was kann ich festlegen? Was
 * kostet es? Und die Einwände. Mehr Highlights als Fragen sind Deko.
 *
 * Alle Zahlen wie in decks.ts: echte Defaults aus TRIGGER_LIBRARY, Preise aus
 * lib/stripe/pricing.ts. Nichts erfinden.
 */

/** Steht am Ende jedes Highlights. Einmal formuliert, überall gleich. */
const CTA: Deck["slides"][number] = {
  kicker: "Loslegen",
  headline: "30 Tage kostenlos.",
  body: "Ab 4,99 € im Monat pro Mannschaft. Ohne Kreditkarte. kickpact.com",
  logo: true
};

export const STORIES: Deck[] = [
  {
    slug: "wie-funktioniert-das",
    angle: "Erklärung",
    format: "story",
    caption: "Highlight: Wie funktioniert das",
    slides: [
      {
        kicker: "Highlight",
        headline: "Wie funktioniert KickPact?",
        logo: true
      },
      {
        kicker: "1",
        headline: "Jemand verspricht euch einen Betrag.",
        body: "Pro Tor, pro Sieg, pro Comeback. Meistens Eltern, Ehemalige, der Onkel.",
        tone: "photo",
        photo: "player-and-sponsor"
      },
      {
        kicker: "2",
        headline: "Ihr spielt.",
        body: "Die Spieldaten kommen automatisch. Ihr tragt nichts ein."
      },
      {
        kicker: "3",
        headline: "Die App zählt mit.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" }
        ]
      },
      {
        kicker: "4",
        headline: "Am Monatsende kommt die Zahlungsübersicht.",
        body: "Der Sponsor zahlt, das Geld geht an die Mannschaft. Wir behalten nichts ein."
      },
      CTA
    ]
  },

  {
    slug: "was-kann-ich-festlegen",
    angle: "Features",
    format: "story",
    caption: "Highlight: Was kann ich festlegen",
    slides: [
      {
        kicker: "Highlight",
        headline: "Was kann ich festlegen?",
        logo: true
      },
      {
        kicker: "24 Typen",
        headline: "Ihr nehmt, was zu euch passt.",
        body: "Die Beträge hier sind Voreinstellungen. Jeder Sponsor ändert sie selbst."
      },
      {
        kicker: "Automatisch",
        headline: "Tore und Siege.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" },
          { label: "Pro Comeback-Sieg", amount: "20 €" }
        ]
      },
      {
        kicker: "Ihr meldet",
        headline: "Die Kunststücke.",
        pacts: [
          { label: "Kopfballtor", amount: "10 €" },
          { label: "Hackentor", amount: "15 €" },
          { label: "Tor hinter Mittellinie", amount: "25 €" }
        ]
      },
      {
        kicker: "Am Saison-Ende",
        headline: "Das Große.",
        pacts: [
          { label: "Klassenerhalt", amount: "100 €" },
          { label: "Aufstieg", amount: "200 €" },
          { label: "Meister-Titel", amount: "300 €" }
        ]
      },
      CTA
    ]
  },

  {
    slug: "was-kostet-das",
    angle: "Preis",
    format: "story",
    caption: "Highlight: Was kostet das",
    slides: [
      {
        kicker: "Highlight",
        headline: "Was kostet das?",
        logo: true
      },
      {
        kicker: "Mannschaftslizenz",
        headline: "Ab 4,99 € im Monat.",
        pacts: [
          { label: "Pro Mannschaft, monatlich", amount: "4,99 €" },
          { label: "Provision auf eure Pacts", amount: "0 %" }
        ]
      },
      {
        kicker: "Wer zahlt",
        headline: "Nur die Mannschaft.",
        body: "Sponsoren zahlen keine Gebühr. Und von dem Geld, das reinkommt, behalten wir nichts ein."
      },
      {
        kicker: "Vorher testen",
        headline: "30 Tage kostenlos.",
        body: "Ohne Kreditkarte. Läuft von allein aus, wenn ihr nicht wollt."
      },
      CTA
    ]
  },

  {
    slug: "haeufige-fragen",
    angle: "Einwand",
    format: "story",
    caption: "Highlight: Häufige Fragen",
    slides: [
      {
        kicker: "Highlight",
        headline: "Häufige Fragen.",
        logo: true
      },
      {
        kicker: "Frage",
        headline: "„Müssen wir alles eintragen?“",
        body: "Nein. Tore, Siege und Karten kommen automatisch. Nur die Kunststücke meldet ihr selbst."
      },
      {
        kicker: "Frage",
        headline: "„Und wenn wir zehn Tore schießen?“",
        body: "Jeder Sponsor setzt sein eigenes Monatslimit. Darüber läuft nichts."
      },
      {
        kicker: "Frage",
        headline: "„Wer soll uns denn sponsern?“",
        body: "Eltern, Ehemalige, der Onkel, der eh jedes Spiel schaut. Keine Firmen.",
        tone: "photo",
        photo: "team-celebration"
      },
      {
        // Wortlaut aus der FAQ auf /preise, nicht aus dem Bauch: das Monatsabo
        // endet zum Abrechnungsmonat, der Saison-Pass läuft ohne Kündigung bis
        // 1. Juli automatisch weiter. Beides gehört hin, sonst ist die Antwort
        // für Saison-Pass-Kunden schlicht falsch.
        kicker: "Frage",
        headline: "„Können wir wieder raus?“",
        body: "Das Monatsabo jederzeit zum Ende des Abrechnungsmonats. Den Saison-Pass bis 1. Juli für die kommende Saison."
      },
      CTA
    ]
  },

  {
    // Feature #44 als Highlight zum Anpinnen. Slide 2 und 3 zeigen die echten
    // Story-Motive (story-image-Route) im Handy-Rahmen. Eigener Abbinder statt
    // des geteilten CTA, weil die Kernbotschaft hier „presented by KickPact" ist.
    slug: "spieltag-story",
    angle: "Features",
    format: "story",
    caption: "Highlight: So kündigt ihr euer Spiel an",
    slides: [
      {
        kicker: "Spieltag-Story",
        headline: "So kündigt ihr euer Spiel an.",
        logo: true
      },
      {
        headline: "Ein Tipp. Fertige Story.",
        body: "Gegner, Datum, Tabellenplatz automatisch drauf.",
        screenshot: "spiel-vorschau"
      },
      {
        headline: "Nach dem Abpfiff: Ergebnis und Torschützen.",
        screenshot: "spiel-rueckblick"
      },
      {
        kicker: "Loslegen",
        headline: "Presented by KickPact.",
        body: "Ab 4,99 € pro Mannschaft und Monat.",
        logo: true
      }
    ]
  }
];
