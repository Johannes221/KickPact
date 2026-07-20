import type { PhotoName, ScreenshotName } from "./brand";

/**
 * Der Content selbst. DAS ist die Datei, die man anfasst, um zu posten.
 *
 * Ein Deck = ein Karussell-Post. `npm run social:render` macht daraus PNGs unter
 * `out/social/<slug>/`, fertig zum Hochladen.
 *
 * Wir posten als KICKPACT, nicht als Verein. Kein Content im Namen einer
 * Mannschaft, keine echten Spiele. Es geht immer um die App: was sie kann, wie
 * sie läuft, was sie kostet, warum man sie lädt.
 *
 * BEWORBEN WIRD DIE MANNSCHAFTSLIZENZ, nicht die Vereinslizenz (Johannes,
 * 2026-07-17). Einstieg ist Basic mit 4,99 € pro Mannschaft und Monat — genau
 * das, was app/(marketing)/preise/page.tsx selbst bewirbt. Die 19,99 € der
 * Vereinslizenz gelten für einen ganzen Verein mit beliebig vielen Mannschaften
 * und sind der falsche Einstieg für einen Post.
 *
 * NICHTS ERFINDEN. Alle Beträge unten sind die echten Defaults aus dem
 * Pact-Builder (app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx,
 * TRIGGER_LIBRARY), alle Preise aus lib/stripe/pricing.ts. Wer hier eine Zahl
 * ändert, prüft sie vorher dort. Platzhalter `[X]` blockieren den Render.
 *
 * SPRACHE: „Pact" für das Ganze, „Regel" für die einzelne Festlegung, „Beitrag"
 * für den ausgelösten Betrag. NIE „Wette" (Framing ist Gaudi und Community, nicht
 * Glücksspiel), nie „Spende" (es ist Sponsoring), nie „Charge"/„Pledge" (das ist
 * Code-Vokabular). Die Datenquelle wird NICHT namentlich genannt, nur
 * „automatisch" — so hält es die Kunden-UI auch.
 */

/**
 * Tonart einer Fläche.
 *   light = weiß, Navy-Text, grüne Akzente. Der Normalfall und der Regelfall.
 *   photo = echtes Foto mit Navy-Schleier, weißer Text. Für den Menschen dahinter.
 *
 * KEINE grüne Vollfläche. Gab es mal, ist raus (Johannes, 2026-07-17: „zu grün").
 * Das Grün trägt als AKZENT — Marke, Kicker, Balken der Pact-Karte — nicht als
 * Grund. Wer sie wieder einführen will: erst fragen, nicht einfach eine Tonart
 * ergänzen.
 *
 * Der Rhythmus kommt trotzdem nicht aus dem Nichts: ein Karussell aus acht
 * identischen weißen Textflächen liest sich als eine einzige lange Fläche, und
 * der Daumen wischt durch. Er kommt jetzt aus den Fotos (dunkel) und den
 * Pact-Karten (graue Blöcke). Ein Deck ohne beides wird flach — dann gehört ein
 * Foto rein, kein neuer Hintergrund.
 */
export type Tone = "light" | "photo";

/** Eine Beispiel-Regel als Karte. Betrag als String, damit „5 €" so bleibt. */
export interface Pact {
  label: string;
  amount: string;
}

export interface Slide {
  /** Kleines Caps-Label über der Headline. */
  kicker?: string;
  /** Die Aussage. Trägt den Slide, muss allein lesbar sein. */
  headline: string;
  /** Optionale Ausführung darunter. Kurz halten, das ist kein Blogpost. */
  body?: string;
  tone?: Tone;
  /** Pflicht bei tone: "photo". */
  photo?: PhotoName;
  /** Beispiel-Regeln als Karten unter der Headline. Max. 3, sonst wird es klein. */
  pacts?: Pact[];
  /** Echter App-Screenshot im Handy-Rahmen. Schließt `pacts` aus (kein Platz). */
  screenshot?: ScreenshotName;
  /** Statt Text: das Logo groß in die Fläche. Für Aufschlag und Abbinder. */
  logo?: boolean;
}

/**
 * Wohin der Post geht. Bestimmt Maße UND Layout-Regeln, nicht nur die Größe:
 *
 *   feed  = 1080×1350 (4:5). Das Format, das Instagram im Feed zeigt, seit das
 *           Grid auf Portrait steht. Quadratisch wäre das Alt-Format und
 *           verschenkte rund ein Viertel der Fläche. Unten ist frei, also sitzen
 *           dort Fortschrittspunkte und Logo.
 *   story = 1080×1920 (9:16), für Highlights zum Anpinnen. Instagram legt oben
 *           und unten je ~250 px eigene Bedienelemente drüber, deshalb KEINE
 *           Punkte unten und das Logo oben — dieselbe Regel wie im Reel.
 */
export type Format = "feed" | "story";

export interface Deck {
  /** Ordnername unter out/social/<karussell|stories>/. */
  slug: string;
  /** Welcher Angle (siehe docs/marketing/content-strategie.md). Nur Doku. */
  angle: string;
  /** Standard ist "feed". */
  format?: Format;
  /** Instagram-/Facebook-Caption. Hashtags kommen zentral aus tags.ts dazu. */
  caption: string;
  slides: Slide[];
}

/* -------------------------------------------------------------------------- */

/** Steht unter fast jedem Deck. Einmal formuliert, überall gleich. */
const CTA_PREIS: Slide = {
  kicker: "Mannschaftslizenz",
  headline: "Ab 4,99 € im Monat.",
  body: "Pro Mannschaft. 30 Tage kostenlos testen, ohne Kreditkarte. Und 0 % Provision auf das, was reinkommt."
};

export const DECKS: Deck[] = [
  {
    slug: "01-so-funktioniert-ein-pact",
    angle: "Erklärung",
    caption:
      "Sponsoring im Amateurfußball läuft so: Einmal im Jahr 300 Euro, dafür ein " +
      "Banner am Zaun, das keiner liest. Beim zweiten Mal sagt er ab.\n\n" +
      "Ein Pact läuft anders. Jemand legt fest, wofür er zahlt: pro Tor, pro Sieg, " +
      "pro Comeback. Ihr spielt, die App zählt mit, am Monatsende kommt die " +
      "Zahlungsübersicht.\n\n" +
      "Ab 4,99 € im Monat pro Mannschaft. 30 Tage kostenlos, ohne Kreditkarte.\n" +
      "kickpact.com, Link in der Bio.",
    slides: [
      {
        kicker: "In 60 Sekunden",
        headline: "So funktioniert ein Pact.",
        logo: true
      },
      {
        kicker: "Der Mensch dahinter",
        headline: "Euer Onkel will euch unterstützen.",
        body: "Nicht mit 50 Euro im Umschlag, einmal im Jahr. Sondern jedes Wochenende ein bisschen.",
        tone: "photo",
        photo: "player-and-sponsor"
      },
      {
        kicker: "Schritt 1",
        headline: "Er legt fest, wofür er zahlt.",
        body: "Seine Regeln, seine Beträge. Er nimmt, was ihm Spaß macht.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" },
          { label: "Pro Comeback-Sieg", amount: "20 €" }
        ]
      },
      {
        kicker: "Schritt 2",
        headline: "Ihr spielt. Mehr nicht.",
        body: "Die Spieldaten kommen automatisch. Ihr tragt nichts ein, ihr meldet nichts, ihr müsst an gar nichts denken."
      },
      {
        kicker: "Schritt 3",
        headline: "2 Tore und ein Comeback. 30 € in der Kasse."
      },
      {
        kicker: "Und die Angst davor?",
        headline: "Er legt sein Monatslimit selbst fest.",
        body: "Darüber läuft nichts. Niemand wacht am Montag mit einer Überraschung auf."
      },
      {
        kicker: "Am Monatsende",
        headline: "Zahlungsübersicht raus, Geld an die Mannschaft.",
        body: "Kein Kassenwart-Abend mit Excel."
      },
      {
        // Echter Screenshot vom Demo-Verein, nicht gezeichnet.
        kicker: "Euer Dashboard",
        headline: "Bilanz, Tore, Sponsor-Geld.",
        screenshot: "dashboard"
      },
      CTA_PREIS,
      {
        headline: "30 Tage kostenlos testen.",
        body: "kickpact.com, Link in der Bio.",
        logo: true
      }
    ]
  },

  {
    slug: "02-was-ihr-festlegen-koennt",
    angle: "Features",
    caption:
      "24 Pact-Typen. Ihr nehmt, was zu euch passt.\n\n" +
      "Von „pro Tor“ über „Tor hinter der Mittellinie“ bis „Aufstieg“. Die " +
      "Beträge hier sind die Voreinstellungen, jeder Sponsor kann sie ändern.\n\n" +
      "Welchen würdet ihr nehmen? Ab in die Kommentare.\n\nkickpact.com",
    slides: [
      {
        kicker: "24 Typen",
        headline: "Wofür kann euch jemand sponsern?",
        logo: true
      },
      {
        kicker: "Kurz vorweg",
        headline: "Ihr legt fest, was zählt.",
        body: "Nicht wir. Jeder Sponsor baut sich seine Regeln selbst zusammen.",
        tone: "photo",
        photo: "team-green"
      },
      {
        kicker: "Die Klassiker",
        headline: "Tore und Siege.",
        body: "Zählt die App automatisch mit.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" },
          { label: "Pro Auswärtssieg", amount: "15 €" }
        ]
      },
      {
        kicker: "Für hinten",
        headline: "Auch die Null wird bezahlt.",
        body: "Comeback heißt: irgendwann hinten gelegen, am Ende gewonnen.",
        pacts: [
          { label: "Pro Zu-Null-Sieg", amount: "5 €" },
          { label: "Pro Comeback-Sieg", amount: "20 €" }
        ]
      },
      {
        kicker: "Für einzelne Spieler",
        headline: "Immer wenn genau der trifft.",
        body: "Geht überall dort, wo für eure Liga die Torschützen erfasst werden.",
        pacts: [
          { label: "Tore von Spieler X", amount: "3 €" },
          { label: "Pro Hattrick", amount: "25 €" }
        ]
      },
      {
        kicker: "Für die Kunststücke",
        headline: "Das Ding aus 50 Metern.",
        body: "Meldet ihr selbst, der Sponsor bestätigt. Dauert zehn Sekunden.",
        pacts: [
          { label: "Kopfballtor", amount: "10 €" },
          { label: "Hackentor", amount: "15 €" },
          { label: "Tor hinter Mittellinie", amount: "25 €" }
        ]
      },
      {
        kicker: "Für die ganze Saison",
        headline: "Das Große kommt am Ende.",
        body: "Einmalig, wenn es klappt.",
        pacts: [
          { label: "Klassenerhalt", amount: "100 €" },
          { label: "Aufstieg", amount: "200 €" },
          { label: "Meister-Titel", amount: "300 €" }
        ]
      },
      {
        // Echter Screenshot, aufgenommen von npm run social:capture. Kein Mockup.
        kicker: "So sieht das aus",
        headline: "Alle Spiele auf einen Blick.",
        screenshot: "spiele-uebersicht"
      },
      {
        kicker: "Sogar das",
        headline: "Gelbe Karte: 2 € in die Kasse.",
        body: "Weil es der Mannschaftskasse egal ist, warum sie voll wird."
      },
      CTA_PREIS
    ]
  },

  {
    slug: "03-wer-sponsert-euch",
    angle: "Mannschaftskasse",
    caption:
      "Ihr sucht Sponsoren beim Autohaus, beim Bäcker, beim Getränkemarkt. " +
      "Und übersehen dabei die Leute, die eh jedes Wochenende an der Linie " +
      "stehen.\n\n" +
      "Keine Firmen. Eltern, Ehemalige, Onkel, Nachbarn.\n\nkickpact.com",
    slides: [
      {
        kicker: "Sponsorensuche",
        headline: "Ihr fragt die Falschen.",
        logo: true
      },
      {
        kicker: "Der übliche Weg",
        headline: "Autohaus. Bäcker. Getränkemarkt.",
        body: "Drei Anrufe, zwei Absagen, einmal 50 Euro. Und im Sommer geht das Ganze von vorne los."
      },
      {
        kicker: "Dabei",
        headline: "Die Richtigen stehen schon da.",
        body: "Jeden Samstag, an der Linie, bei 3 Grad. Die fragt nur nie jemand.",
        tone: "photo",
        photo: "team-celebration"
      },
      {
        kicker: "Wer das ist",
        headline: "Eltern. Ehemalige. Der Onkel. Der Nachbar.",
        body: "Privatleute, keine Firmen. Genau das ist der Punkt: die wollen kein Logo am Zaun, die wollen dabei sein."
      },
      {
        kicker: "Was sie kriegen",
        headline: "Einen Grund, jedes Spiel zu schauen.",
        body: "Wer 5 € pro Tor drin hat, fragt sonntags nicht mehr, wie es ausgegangen ist. Der war da."
      },
      {
        // Die andere Hälfte: was beim Sponsor ankommt.
        kicker: "Seine Sicht",
        headline: "Er sieht, was er bewirkt hat.",
        screenshot: "sponsor-dashboard"
      },
      {
        kicker: "Was ihr kriegt",
        headline: "Eine Kasse, die sich selbst füllt.",
        body: "Ohne dass jemand nochmal irgendwo klingeln muss."
      },
      CTA_PREIS
    ]
  },

  {
    slug: "04-vier-fragen",
    angle: "Einwand",
    caption:
      "Die vier Fragen, die im Vorstand immer kommen. Kurz beantwortet.\n\n" +
      "Wenn eure nicht dabei ist: ab in die Kommentare, ich antworte da.\n\n" +
      "kickpact.com",
    slides: [
      {
        kicker: "Vorstandssitzung",
        headline: "Vier Fragen kommen immer.",
        logo: true
      },
      {
        kicker: "Frage 1",
        headline: "„Müssen wir dann alles eintragen?“",
        body: "Nein. Tore, Siege und Karten kommen automatisch. Nur die Kunststücke meldet ihr selbst, und das dauert zehn Sekunden."
      },
      {
        kicker: "Frage 2",
        headline: "„Und wenn wir zehn Tore schießen?“",
        body: "Jeder Sponsor setzt sein eigenes Monatslimit. Darüber läuft nichts."
      },
      {
        kicker: "Frage 3",
        headline: "„Was kostet uns das?“",
        body: "4,99 € im Monat für eure Mannschaft. Von dem Geld, das reinkommt, behalten wir nichts ein.",
        pacts: [
          { label: "Mannschaft, monatlich", amount: "4,99 €" },
          { label: "Provision auf Pacts", amount: "0 %" }
        ]
      },
      {
        kicker: "Frage 4",
        headline: "„Wer soll uns denn sponsern?“",
        body: "Eltern, Ehemalige, der Onkel, der eh jedes Spiel schaut. Keine Firmen.",
        tone: "photo",
        photo: "player-and-sponsor"
      },
      {
        kicker: "kickpact.com",
        headline: "Noch eine Frage offen?",
        body: "Ab in die Kommentare. Ich antworte da.",
        logo: true
      }
    ]
  }
];
