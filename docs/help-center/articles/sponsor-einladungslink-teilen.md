---
title: "Sponsor-Einladungslink teilen"
slug: "sponsor-einladungslink-teilen"
category: "erste-schritte-verein"
category_label: "Erste Schritte — Verein"
prio: "MUSS"
audience: ["verein-admin", "trainer"]
related_articles:
  - "sponsor-einladung-oeffnen"
  - "was-ist-ein-pledge"
  - "ersten-pledge-anlegen"
  - "faq"
last_updated: "2026-07-20"
status: "published"
---

Der Sponsor-Einladungslink ist dein wichtigstes Akquise-Tool. Ein Link, ein Klick beim Empfänger — schon ist er in seinem Pact-Wizard. So holst du ihn raus und schickst ihn richtig.

## So generierst du einen Link

1. **Verein → Mannschaft → Sponsoren → "+ Sponsor einladen"**.
2. Du hast zwei Varianten:
   - **Persönlicher Link** mit Name des Empfängers — beim Öffnen wird er namentlich begrüßt ("Hallo Mehmet!"). Empfohlen bei privaten Sponsoren.
   - **Generischer Link** — derselbe Link für alle. Praktisch für offene Akquise, z.B. Vereinswebsite oder WhatsApp-Gruppe.
3. Klick auf **"Link generieren"** — KickPact erstellt einen Token. Der Link sieht so aus:
   `kickpact.com/einladung/abc123XYZ...`
4. Kopier den Link in Zwischenablage (Button rechts neben dem Feld), schick ihn raus.

## Wie lange ist der Link gültig?

**30 Tage ab Erzeugung.** Wenn der Empfänger nicht klickt, läuft der Link ab. Du kannst dann einen neuen erzeugen, ohne dass alte Links automatisch reaktiviert werden.

Pro Sponsor solltest du **maximal einen aktiven Link** haben. Wenn du einen neuen erzeugst, weil der erste nicht angekommen ist, wird der erste nicht ungültig — daran denken beim Tracking.

## Wo du Sponsoren-Status siehst

**Verein → Mannschaft → Sponsoren** zeigt eine Tabelle:

| Spalte | Bedeutung |
|---|---|
| Name | Person hinter dem Link oder "Anonym" bei generischem Link |
| Status | `pending` (Link erzeugt, noch nicht eingelöst), `aktiv` (Pact angelegt), `paused`, `cancelled` |
| Letzter Klick | Wann er den Link zuletzt geöffnet hat (Tracking via Token) |
| Monats-Pact | Aktueller Worst-Case-Betrag für den laufenden Monat |

Die Spalte "Letzter Klick" ist dein Tracking: Du siehst, ob und wann der Empfänger den Link geöffnet hat.

## Empfohlene Kanäle

- **WhatsApp** (am häufigsten): kurzer persönlicher Text, dann der Link. Mobile-Klickrate >70 %.
- **E-Mail**: kurzer persönlicher Text plus Link. Klickrate ca. 40 %.
- **Vereins-WhatsApp-Gruppe**: nur mit generischem Link, nicht mit Persönlichkeits-Token. Sonst klickt der falsche Onkel.
- **Vereinswebsite**: den generischen Link als Button oder Textlink einbauen, z.B. "Unterstütze die Herren II — 5 € pro Tor".
- **Druck (Flyer, Aushang)**: QR-Code-Funktion in der Sponsoren-Tabelle (Druck-Icon). 3-Klick-Download als PDF.

## Was passiert beim Sponsor nach Klick

1. Er landet auf der Einladungs-Begrüßung: Vereinsname, Mannschaftsname, dein Logo.
2. Wenn er noch keinen KickPact-Account hat: Magic-Link-Login per Mail (kein Passwort).
3. Direkt nach Login: Pact-Wizard für genau diese Mannschaft, vorausgefüllt. Mehr in [Ersten Pact anlegen](ersten-pledge-anlegen.md).

Während dieses Flows ist die Einladung an seinen Account gebunden — auch wenn er den Wizard abbricht und morgen über sein Dashboard zurückkommt, weiß KickPact, zu welcher Mannschaft er gehört.

## Wenn ein Sponsor sagt "Ich krieg keinen Link rein"

Drei häufige Ursachen:

- **WhatsApp hat den Link gekürzt:** WhatsApp ersetzt manchmal Tokens. → Schick den Link als zweite Nachricht oder per E-Mail.
- **Mail-Spam-Filter:** Magic-Link-Mail landet im Spam. → Sponsor soll Spam-Ordner checken.
- **Falscher Account beim Login:** Sponsor hat sich mit anderer Mail-Adresse eingeloggt als der, an die der Link ging. Das ist okay — KickPact akzeptiert das, der Token gilt für den ersten Account, der ihn einlöst.

## Link zurückziehen

Sponsor antwortet nicht, oder du willst es aktiv beenden? **Sponsoren-Tabelle → Drei-Punkte-Menü → "Link zurückziehen"**. Der Token wird sofort ungültig, der Empfänger sieht beim Klick "Einladung zurückgezogen, frag den Verein nach einem neuen Link".

Weiter lesen:
- [Sponsor-Einladung öffnen](sponsor-einladung-oeffnen.md)
- [Ersten Pact anlegen](ersten-pledge-anlegen.md)
