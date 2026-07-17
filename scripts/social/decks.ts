/**
 * Der Content selbst. DAS ist die Datei, die man anfasst, um zu posten.
 *
 * Ein Deck = ein Karussell-Post. `npm run social:render` macht daraus PNGs unter
 * `out/social/<slug>/`, fertig zum Hochladen.
 *
 * Wir posten als KICKPACT, nicht als Verein (Johannes, 2026-07-17). Kein Content
 * im Namen einer Mannschaft, keine echten Spiele, keine Vorschauen oder
 * Rückblicke als Eigen-Content. Es geht immer um die App: was sie kann, wie sie
 * läuft, was sie kostet, warum man sie lädt. Ein Rückblick-Motiv darf vorkommen,
 * aber als FEATURE-Beleg („das baut dir die App"), nie als Vereins-Post.
 *
 * Leitplanke, geerbt von lib/story/story-data.ts: NICHTS ERFINDEN. Keine Zahl,
 * kein Vereinsname, kein Zitat, das nicht real ist. Erfundene Sozialbeweise
 * fliegen im Amateurfußball sofort auf, weil sich in einer Liga alle kennen.
 * Platzhalter stehen als [X] im Text und BLOCKIEREN den Render (siehe
 * assertNoPlaceholders in render.tsx) — lieber kein Post als ein erfundener.
 */

/**
 * Tonart einer Fläche.
 *   light = weiß, Navy-Text, grüne Akzente. Der Normalfall.
 *   green = volle grüne Fläche, Navy-Text. Für Aufschlag und Pointe.
 *
 * Ein Karussell aus sieben identischen weißen Flächen liest sich als eine einzige
 * lange Fläche, und der Daumen wischt durch. Der Tonartwechsel ist der Rhythmus.
 * Sparsam einsetzen: wenn alles knallt, knallt nichts.
 */
export type Tone = "light" | "green";

export interface Slide {
  /** Kleines Caps-Label über der Headline. */
  kicker?: string;
  /** Die Aussage. Trägt den Slide, muss allein lesbar sein. */
  headline: string;
  /** Optionale Ausführung darunter. Kurz halten, das ist kein Blogpost. */
  body?: string;
  tone?: Tone;
}

export interface Deck {
  /** Ordnername unter out/social/. */
  slug: string;
  /** Welcher Angle (siehe docs/marketing/content-strategie.md). Nur Doku. */
  angle: string;
  /** Instagram-/Facebook-Caption. Wird als caption.txt mit ausgegeben. */
  caption: string;
  hashtags: string[];
  slides: Slide[];
}

/* -------------------------------------------------------------------------- */

const TAGS = [
  "#amateurfußball",
  "#kreisliga",
  "#vereinsleben",
  "#mannschaftskasse",
  "#kickpact"
];

export const DECKS: Deck[] = [
  {
    slug: "01-so-funktioniert",
    angle: "Erklärung",
    caption:
      "Sponsoring im Amateurfußball heißt bisher: jemand überweist einmal im Jahr " +
      "300 Euro und bekommt dafür sein Logo auf ein Banner, das keiner liest.\n\n" +
      "KickPact dreht das um. Jemand verspricht einen Betrag pro Tor, ihr spielt, " +
      "die App zählt mit. Am Monatsende geht die Rechnung raus.\n\n" +
      "Alles auf kickpact.com, Link in der Bio.",
    hashtags: TAGS,
    slides: [
      {
        kicker: "In 60 Sekunden",
        headline: "So funktioniert KickPact.",
        tone: "green"
      },
      {
        kicker: "Schritt 1",
        headline: "Jemand verspricht einen Betrag pro Tor.",
        body:
          "Eltern, Ehemalige, der Onkel, der eh jedes Spiel schaut. Keine Firmen, " +
          "keine Banner, kein Vertrag über drei Jahre."
      },
      {
        kicker: "Schritt 2",
        headline: "Ihr spielt einfach.",
        body:
          "Die Spieldaten holt sich die App selbst. Ihr tragt nichts ein, ihr meldet " +
          "nichts, ihr müsst an gar nichts denken."
      },
      {
        kicker: "Schritt 3",
        headline: "Jedes Tor zählt sich selbst.",
        body:
          "Tor, Sieg, Spiel ohne Gegentor. Ihr legt vorher fest, was zählt und was " +
          "es wert ist."
      },
      {
        kicker: "Schritt 4",
        headline: "Am Monatsende kommt die Rechnung.",
        body:
          "Der Sponsor zahlt, das Geld geht an den Verein. Wir behalten davon nichts ein."
      },
      {
        kicker: "Was es kostet",
        headline: "19,99 € im Monat. Für den ganzen Verein.",
        body: "Weniger als 1 Euro pro Spieler. Sponsoren zahlen keine Gebühr.",
        tone: "green"
      },
      {
        kicker: "kickpact.com",
        headline: "30 Tage testen.",
        body: "Link in der Bio."
      }
    ]
  },

  {
    slug: "02-fuenf-euro-pro-tor",
    angle: "Ansporn",
    caption:
      "88. Minute, ihr führt 3:1, und normalerweise schiebt jetzt nur noch jeder.\n\n" +
      "Außer es hängen 5 Euro pro Tor drin. Dann läuft plötzlich der " +
      "Innenverteidiger mit nach vorne.\n\n" +
      "kickpact.com",
    hashtags: [...TAGS, "#kabine"],
    slides: [
      {
        kicker: "88. Minute",
        headline: "Ihr führt 3:1.",
        body: "Normalerweise schiebt jetzt nur noch jeder."
      },
      {
        headline: "Außer es hängen 5 € pro Tor drin.",
        tone: "green"
      },
      {
        kicker: "Dann",
        headline: "Läuft der Innenverteidiger mit nach vorne.",
        body: "Und der Trainer muss in der Halbzeit niemanden mehr anschreien."
      },
      {
        kicker: "Ihr entscheidet",
        headline: "Was zählt und was es wert ist.",
        body:
          "5 € pro Tor. 20 € pro Sieg. 10 €, wenn hinten die Null steht. " +
          "Jede Regel kann jeder Sponsor selbst setzen."
      },
      {
        kicker: "Und danach",
        headline: "Wird in der Kabine gerechnet.",
        body: "Das ist der Teil, den vorher keiner auf dem Zettel hatte."
      },
      {
        kicker: "kickpact.com",
        headline: "Macht die Mannschaftskasse voll.",
        body: "30 Tage testen. Link in der Bio.",
        tone: "green"
      }
    ]
  },

  {
    slug: "03-was-die-app-kann",
    angle: "Features",
    caption:
      "Was in der App drin ist, ohne Marketing-Sprech.\n\n" +
      "Fehlt euch was? Schreibt es in die Kommentare, ich lese da wirklich mit.\n\n" +
      "kickpact.com",
    hashtags: [...TAGS, "#vereinsmarketing"],
    slides: [
      {
        kicker: "Ohne Marketing-Sprech",
        headline: "Was die App wirklich kann.",
        tone: "green"
      },
      {
        kicker: "Spieldaten",
        headline: "Kommen von allein.",
        body:
          "Ergebnis, Torschützen, Tabellenplatz. Was öffentlich nirgends steht, " +
          "meldet ihr in zwei Klicks selbst."
      },
      {
        kicker: "Regeln",
        headline: "Baut jeder Sponsor sich selbst.",
        body: "Pro Tor, pro Sieg, pro Spiel ohne Gegentor. Mit eigenem Monatslimit."
      },
      {
        kicker: "Überblick",
        headline: "Der Verein sieht jeden Cent.",
        body: "Wer hat was versprochen, was ist schon drin, was kommt am Monatsende."
      },
      {
        kicker: "Rechnung",
        headline: "Schreibt sich selbst.",
        body: "PDF an den Sponsor, Geld an den Verein. Kein Kassenwart-Abend mit Excel."
      },
      {
        kicker: "Motive",
        headline: "Fertige Bilder fürs Vereins-Konto.",
        body:
          "Vorschau und Rückblick zu jedem Spiel, im 9:16-Format. Antippen, teilen, fertig."
      },
      {
        kicker: "Saison-Rückblick",
        headline: "Am Ende kriegt ihr eure Saison als Story.",
        body: "Tore, Serien, Bilanz. Fünfzehn Bilder, die keiner von Hand bauen will.",
        tone: "green"
      },
      {
        kicker: "kickpact.com",
        headline: "30 Tage testen.",
        body: "Link in der Bio."
      }
    ]
  },

  {
    slug: "04-vier-fragen",
    angle: "Einwand",
    caption:
      "Die vier Fragen, die im Vorstand immer kommen. Kurz beantwortet.\n\n" +
      "Wenn eure nicht dabei ist: ab in die Kommentare, ich antworte da.\n\n" +
      "kickpact.com",
    hashtags: TAGS,
    slides: [
      {
        kicker: "Vorstandssitzung",
        headline: "Vier Fragen kommen immer.",
        tone: "green"
      },
      {
        kicker: "Frage 1",
        headline: "„Müssen wir dann alles eintragen?“",
        body:
          "Nein. Die Spieldaten kommen automatisch. Nur was öffentlich nirgends " +
          "steht, meldet ihr selbst, und das dauert zehn Sekunden."
      },
      {
        kicker: "Frage 2",
        headline: "„Und wenn wir zehn Tore schießen?“",
        body:
          "Jeder Sponsor setzt sein eigenes Monatslimit. Darüber läuft nichts. " +
          "Niemand wacht mit einer Überraschung auf."
      },
      {
        kicker: "Frage 3",
        headline: "„Was kostet uns das?“",
        body:
          "19,99 € im Monat für den Verein. Sponsoren zahlen keine Gebühr, und von " +
          "dem Geld, das reinkommt, behalten wir nichts ein."
      },
      {
        kicker: "Frage 4",
        headline: "„Wer soll uns denn sponsern?“",
        body:
          "Eltern, Ehemalige, der Onkel, der eh jedes Spiel schaut. Keine Firmen. " +
          "Genau das ist der Punkt."
      },
      {
        kicker: "kickpact.com",
        headline: "Noch eine Frage offen?",
        body: "Ab in die Kommentare. Ich antworte da.",
        tone: "green"
      }
    ]
  }
];
