---
title: "Erste Schritte: Verein anlegen und ersten Sponsor einladen"
slug: "erste-schritte-verein"
category: "erste-schritte-verein"
category_label: "Erste Schritte — Verein"
prio: "MUSS"
audience: ["verein-admin"]
related_articles:
  - "fussballde-verknuepfung"
  - "vereins-stammdaten-und-logo"
  - "sponsor-einladungslink-teilen"
  - "welcher-tarif-passt"
last_updated: "2026-07-20"
status: "published"
---

Vom ersten Login bis zum ersten Sponsor-Link in unter 10 Minuten. Wir gehen einmal komplett durch.

## Was du vorher brauchst

- Eine Mailadresse — fertig. Kein Passwort, kein Stripe-Konto im ersten Schritt.
- Den **Namen deiner Mannschaft, wie sie auf Fußball.de steht**. Ein, zwei Tabs offen lassen schadet nicht.
- Optional, aber empfohlen: Vereinslogo als PNG/SVG, Vereinsadresse, IBAN, ggf. USt-ID. Du kannst das auch nach dem Onboarding eintragen.

## Schritt 1 — Konto anlegen via Magic Link

Auf [kickpact.com](https://kickpact.com) auf **„Verein anlegen"** klicken. Mailadresse eingeben, **„Link senden"** drücken.

Du bekommst eine Mail von `hello@kickpact.com` mit Betreff *„Dein KickPact-Login-Link"*. Klick rein, du landest direkt im Onboarding-Wizard. Kein Passwort, kein Bestätigungs-Dance.

![Screenshot: Magic-Link-Mail im Posteingang](placeholder)

Tipp: Wenn die Mail nach 2 Minuten nicht da ist, schau in den Spam-Ordner. Bei Outlook-Adressen passiert das gelegentlich.

## Schritt 2 — Mannschaft auf Fußball.de finden

Der Wizard fragt nach deinem **Verein**. Tippe den Namen ein, KickPact durchsucht Fußball.de live (es dauert 1–2 Sekunden, das ist normal).

Wähle den richtigen Verein aus der Liste. Tipp: Achte auf den **Ort in Klammern** — gerade „FC Eintracht" gibt es deutschlandweit dreistellig.

Im nächsten Schritt erscheinen alle Mannschaften deines Vereins. Wähle die Mannschaft aus, die du auf KickPact bringen willst — meist die erste Herren oder eine bestimmte Jugend-Mannschaft.

![Screenshot: Wizard Schritt 2 — Mannschaftsauswahl](placeholder)

**Findest du deine Mannschaft nicht?** → [Fußball.de-Verknüpfung — wie sie funktioniert](fussballde-verknuepfung.md). In 95 % der Fälle liegt es am Schreibfehler bei der Suche.

## Schritt 3 — Tarif wählen

KickPact schlägt dir basierend auf dem Datum den passenden Tarif vor:

- **Vor dem 5. Spieltag der laufenden Saison** → Saison-Pass empfohlen (rund 67 % günstiger als 12 Monatsraten, Sommerpause kostenlos).
- **Ab 6. Spieltag** → Monatsabo (Saison-Pass für die nächste Saison ab 1. Juli wieder buchbar).
- **Im Juni** → Frühbucher-Saison-Pass für die nächste Saison.

Du startest mit **30 Tagen Trial**. Während des Trials läuft alles, Zahlungsdaten brauchst du erst gegen Ende.

Wenn du unsicher bist, welcher Tarif passt: → [Welcher Tarif passt zu deinem Verein?](welcher-tarif-passt.md)

## Schritt 4 — Vereins-Stammdaten

Hier trägst du ein:

- **Adresse des Vereins** — landet auf der Zahlungsübersicht als Absender.
- **§19-Kleinunternehmer-Flag** (optional) — betrifft nur eure Vereins-Angaben. Auf den Zahlungsübersichten für Sponsoren steht generell keine USt. Im Zweifel mit dem Kassenwart klären, das ist eine 30-Sekunden-Frage.
- **IBAN** — wird auf der Zahlungsübersicht gedruckt, damit Sponsoren wissen, wohin sie überweisen.
- **Logo** (optional) — erscheint auf den öffentlichen Seiten deiner Mannschaft.

Du kannst alles später unter `/verein/[slug]/einstellungen` ändern. Bremst dich hier nicht, wenn die IBAN nicht zur Hand ist — Trial läuft trotzdem.

## Schritt 5 — Ersten Sponsor-Einladungslink generieren

Letzter Wizard-Schritt: Du bekommst einen **Einladungslink** in der Form `kickpact.com/einladung/xyz123`. Diesen Link teilst du mit deinen Sponsoren — WhatsApp, Mail, Vereins-Slack, was auch immer.

![Screenshot: Wizard Schritt 4 — Einladungslink mit Kopier-Button](placeholder)

**Was der Sponsor sieht:**
„FC Beispieldorf lädt dich ein, die Herren II zu unterstützen. Klick rein, leg in 2 Minuten ein Sponsoring-Versprechen an."

Der Link funktioniert für beliebig viele Sponsoren — kein Limit, keine separaten Codes nötig. Sobald der erste Sponsor seinen Pact angelegt hat, taucht er in deinem Dashboard auf.

## Was als Nächstes passiert

Du landest in deinem **Vereins-Dashboard** unter `/verein/[slug]`. Hier siehst du:

- Aktive Pacts (am Anfang: 0)
- Letzte Spiele deiner Mannschaft (werden automatisch importiert)
- Pending Manual Events (wenn du Spezial-Tore meldest)
- Trial-Restdauer

Der Fußball.de-Crawler läuft täglich im Hintergrund, am Spieltag-Wochenende mehrfach. Spätestens am nächsten Morgen siehst du die letzten Spiele deiner Mannschaft in der Match-Liste.

## Häufige Stolpersteine

- **„Meine Mannschaft hat dieses Jahr eine andere Saison-Bezeichnung."** → Der Wizard nutzt den aktuellen Saison-Code von Fußball.de automatisch. Wenn die Saison auf Fußball.de schon umgestellt ist, bist du auf dem richtigen Stand.
- **„Ich bin Trainer, nicht Vorstand — darf ich überhaupt einen Verein anlegen?"** → Technisch ja. Sinnvoll: Sprich mit dem Vorstand, weil das Lizenz-Abo und die Zahlungsübersichten auf den Vereinsnamen laufen. Du kannst auch erst als **Trainer-Rolle** dazugeladen werden, sobald ein Admin den Verein angelegt hat.
- **„Ich möchte direkt mehrere Mannschaften anlegen."** → Lege erst eine an, schließe das Onboarding ab. Die zweite Mannschaft fügst du danach unter Einstellungen → Mannschaften hinzu. → [Mannschaft hinzufügen](mannschaft-hinzufuegen.md)

Weiter lesen:
- [Fußball.de-Verknüpfung — wie sie funktioniert](fussballde-verknuepfung.md)
- [Sponsor-Einladungslink — Verteilen und tracken](sponsor-einladungslink-teilen.md)
- User-Rollen — Admin, Trainer, Viewer
