import type { Pact, Tone } from "./decks";
import type { PhotoName } from "./brand";

/**
 * Die Reel-Inhalte. Getrennt von video.tsx, weil dort `main()` auf Modulebene
 * läuft: ein Import der SPOTS von dort hätte den kompletten Render gestartet
 * (~15 Minuten), nur um an eine Liste von Slugs zu kommen. Gleiches Muster wie
 * decks.ts und stories.ts — Inhalt und Renderer sind getrennte Dateien.
 */

export interface Beat {
  kicker?: string;
  headline: string;
  body?: string;
  tone?: Tone;
  photo?: PhotoName;
  pacts?: Pact[];
  logo?: boolean;
  /** Standzeit in Sekunden, inklusive Einblendung. */
  sec: number;
}

export interface Spot {
  slug: string;
  /** Kurzbeschreibung fürs Log. Nur Doku. */
  angle: string;
  caption: string;
  beats: Beat[];
}

/**
 * Lesezeit ist die Grenze, nicht der Geschmack: bei ~3 Wörtern pro Sekunde
 * braucht eine Headline mit Body real 3 Sekunden, sonst wischt der Daumen
 * weiter, bevor der Satz angekommen ist. Beats mit Pact-Karten brauchen mehr,
 * weil drei Karten drei Blicke sind.
 *
 * Alle Beträge sind die echten Defaults aus dem Pact-Builder (TRIGGER_LIBRARY),
 * alle Preise aus lib/stripe/pricing.ts. Nichts geschätzt. Beworben wird die
 * MANNSCHAFTSLIZENZ (Basic, 4,99 €/Monat), nicht die Vereinslizenz.
 */
export const SPOTS: Spot[] = [
  {
    slug: "01-so-funktioniert-ein-pact",
    angle: "Erklärung",
    caption:
      "Sponsoring im Amateurfußball läuft so: einmal im Jahr 300 Euro, dafür ein " +
      "Banner am Zaun, das keiner liest.\n\n" +
      "Ein Pact läuft anders.\n\n" +
      "Ab 4,99 € im Monat pro Mannschaft, 30 Tage kostenlos.\nkickpact.com",
    beats: [
      { headline: "So funktioniert ein Pact.", logo: true, sec: 2.4 },
      {
        kicker: "Der Mensch dahinter",
        headline: "Euer Onkel will euch unterstützen.",
        body: "Nicht mit 50 Euro im Umschlag, einmal im Jahr.",
        tone: "photo",
        photo: "player-and-sponsor",
        sec: 3.4
      },
      {
        kicker: "Schritt 1",
        headline: "Seine Regeln, seine Beträge.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" },
          { label: "Pro Comeback-Sieg", amount: "20 €" }
        ],
        sec: 4.2
      },
      {
        kicker: "Schritt 2",
        headline: "Ihr spielt. Mehr nicht.",
        body: "Die Spieldaten kommen automatisch. Ihr tragt nichts ein.",
        sec: 3.2
      },
      { headline: "2 Tore und ein Comeback. 30 € in der Kasse.", sec: 3.0 },
      {
        kicker: "Und die Angst davor?",
        headline: "Er setzt sein Monatslimit selbst.",
        body: "Darüber läuft nichts.",
        sec: 3.0
      },
      {
        kicker: "Mannschaftslizenz",
        headline: "Ab 4,99 € im Monat.",
        body: "30 Tage kostenlos testen, ohne Kreditkarte.",
        logo: true,
        sec: 3.4
      }
    ]
  },

  {
    slug: "02-was-ihr-festlegen-koennt",
    angle: "Features",
    caption:
      "24 Pact-Typen. Von „pro Tor“ bis „Tor hinter der Mittellinie“.\n\n" +
      "Die Beträge sind Voreinstellungen, jeder Sponsor ändert sie selbst.\n\n" +
      "Welchen würdet ihr nehmen?\nkickpact.com",
    beats: [
      { headline: "Wofür kann euch jemand sponsern?", logo: true, sec: 2.6 },
      {
        kicker: "Kurz vorweg",
        headline: "Ihr legt fest, was zählt.",
        body: "Nicht wir.",
        tone: "photo",
        photo: "team-green",
        sec: 3.0
      },
      {
        kicker: "Die Klassiker",
        headline: "Tore und Siege.",
        pacts: [
          { label: "Pro Tor", amount: "5 €" },
          { label: "Pro Sieg", amount: "10 €" },
          { label: "Pro Auswärtssieg", amount: "15 €" }
        ],
        sec: 3.8
      },
      {
        kicker: "Für hinten",
        headline: "Auch die Null wird bezahlt.",
        pacts: [
          { label: "Pro Zu-Null-Sieg", amount: "5 €" },
          { label: "Pro Comeback-Sieg", amount: "20 €" }
        ],
        sec: 3.4
      },
      {
        kicker: "Für die Kunststücke",
        headline: "Das Ding aus 50 Metern.",
        pacts: [
          { label: "Kopfballtor", amount: "10 €" },
          { label: "Hackentor", amount: "15 €" },
          { label: "Tor hinter Mittellinie", amount: "25 €" }
        ],
        sec: 4.0
      },
      {
        kicker: "Für die ganze Saison",
        headline: "Das Große kommt am Ende.",
        pacts: [
          { label: "Klassenerhalt", amount: "100 €" },
          { label: "Aufstieg", amount: "200 €" },
          { label: "Meister-Titel", amount: "300 €" }
        ],
        sec: 4.0
      },
      {
        kicker: "24 Typen",
        headline: "Ab 4,99 € im Monat.",
        body: "Pro Mannschaft. 30 Tage kostenlos.",
        logo: true,
        sec: 3.2
      }
    ]
  },

  {
    slug: "03-wer-sponsert-euch",
    angle: "Mannschaftskasse",
    caption:
      "Ihr sucht Sponsoren beim Autohaus und übersehen die Leute, die eh jedes " +
      "Wochenende an der Linie stehen.\n\nkickpact.com",
    beats: [
      { headline: "Ihr fragt die Falschen.", logo: true, sec: 2.4 },
      {
        kicker: "Der übliche Weg",
        headline: "Autohaus. Bäcker. Getränkemarkt.",
        body: "Drei Anrufe, zwei Absagen, einmal 50 Euro.",
        sec: 3.2
      },
      {
        kicker: "Dabei",
        headline: "Die Richtigen stehen schon da.",
        body: "Jeden Samstag, an der Linie, bei 3 Grad.",
        tone: "photo",
        photo: "team-celebration",
        sec: 3.4
      },
      {
        kicker: "Wer das ist",
        headline: "Eltern. Ehemalige. Der Onkel.",
        body: "Privatleute, keine Firmen. Genau das ist der Punkt.",
        sec: 3.2
      },
      { headline: "Die wollen kein Logo am Zaun. Die wollen dabei sein.", sec: 3.2 },
      {
        kicker: "Mannschaftslizenz",
        headline: "Ab 4,99 € im Monat.",
        body: "30 Tage kostenlos testen.",
        logo: true,
        sec: 2.8
      }
    ]
  }
];
