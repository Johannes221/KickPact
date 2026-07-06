---
title: "Zahlungsübersicht lesen — Aufbau erklärt"
slug: "pdf-rechnung-lesen"
category: "abrechnung"
category_label: "Abrechnung"
prio: "MUSS"
audience: ["sponsor", "verein-admin"]
related_articles:
  - "so-funktioniert-die-monatsrechnung"
  - "ust-und-kleinunternehmer"
  - "als-bezahlt-markieren"
  - "csv-export-fuer-buchhaltung"
last_updated: "2026-07-06"
status: "published"
---

Am 1. des Monats bekommst du als Sponsor eine **Zahlungsübersicht** als PDF — eine saubere DIN-A4-Übersicht über deine zugesagten Unterstützungsbeiträge aus dem Vormonat. Keine Rechnung, kein Kleingedrucktes. Hier eine Tour durch die Seite.

## Warum "Zahlungsübersicht" und nicht "Rechnung"?

Weil du als Sponsor keine Leistung kaufst. Du unterstützt deine Mannschaft freiwillig — die Übersicht fasst nur zusammen, was durch deine Pacts zusammengekommen ist. Deshalb steht auch keine USt drauf: private Unterstützung ist keine bezahlte Leistung.

## Kopfbereich

Oben links:
- **Vereinsname** + Anschrift
- **IBAN** des Vereins

Oben rechts:
- **Dein Anzeigename** und deine E-Mail-Adresse

Darunter:
- **Titel mit Referenznummer** (fortlaufend, z.B. `FCM-2026-05-0042`)
- **Zeitraum** (der Vormonat)
- **Datum** (1. des Monats)

## Beitrags-Tabelle

Die Hauptseite ist eine Tabelle mit allen Beiträgen. Spalten:

| Datum | Spiel | Anlass | Betrag |
|---|---|---|---:|
| 03.04. | FCM vs ASV (2:1) | Tor | 10,00 € |
| 03.04. | FCM vs ASV | Sieg | 20,00 € |
| 10.04. | FCM vs TSG (1:1) | Tor | 5,00 € |
| 10.04. | FCM vs TSG | Unentschieden | 5,00 € |

**Lesehilfe:**
- Eine Zeile pro Spiel × Anlass.
- Bei Spieler-Triggern steht der Spielername mit dabei: "Tor Tim Schmidt".
- Manual-Trigger sehen genauso aus wie automatische — für die Abrechnung ist egal, wie das Ereignis erfasst wurde.
- Vom Cap geblockte Trigger tauchen hier gar nicht erst auf. Du zahlst nur, was innerhalb deiner Limits gezählt hat — die Cap-Details siehst du in deinem Dashboard.

## Gesamtbetrag

Unten rechts steht eine einzige Summe: der **Gesamtbetrag**. Kein Netto/Brutto, keine USt-Zeile — der Betrag, den du siehst, ist der Betrag, den du überweist.

## Zahlungs-Block

Am Ende der klare Hinweis, wie du zahlst:

> Dein zugesagter Unterstützungsbeitrag: bitte überweise **78,00 €** innerhalb von 14 Tagen an:
> FC Musterstadt
> IBAN: DE12 3456 7890 1234 5678 90
> Verwendungszweck: **FCM-2026-05-0042**

Daneben ein **QR-Code**: mit der Banking-App scannen, und das Überweisungsformular ist vorausgefüllt. Wenn der Verein PayPal oder einen Online-Zahllink hinterlegt hat, stehen die als zusätzliche Wege dabei.

Der Verwendungszweck (= Referenznummer) ist **wichtig**, damit der Verein deine Zahlung sauber zuordnen kann.

## Fußzeile

- Auf **Basic**: kleiner Hinweis "Erzeugt mit KickPact".
- Auf **Pro / Vereinslizenz**: nur die Vereins-Angaben, kein KickPact-Branding.

## Wo du die Zahlungsübersicht findest

- **Sponsor**: Mail-Anhang am 1. des Monats + im Sponsor-Dashboard unter "Zahlungsübersichten".
- **Verein**: Vereins-Dashboard unter "Abrechnungen".

Beide können die PDF jederzeit erneut herunterladen.

## Wenn etwas nicht stimmt

1. **Deine Daten falsch** (z.B. Anzeigename): im Profil ändern, neue Übersichten verwenden die neuen Daten.
2. **Falscher Beitrag** (Manual-Event versehentlich bestätigt): Beitrag bestreiten — siehe [Event bestreiten](event-bestreiten.md). Bei berechtigtem Einwand gibt es einen **Stornobeleg**, der Betrag wird verrechnet oder erstattet.
3. **Vereins-Daten falsch** (z.B. IBAN): das kann nur der Verein in seinen Stammdaten korrigieren — kurz Bescheid sagen.

Weiter lesen:
- [So funktioniert die Monatsabrechnung](so-funktioniert-die-monatsrechnung.md)
- [USt und Steuern](ust-und-kleinunternehmer.md)
- [Als bezahlt markieren](als-bezahlt-markieren.md)
