---
title: "PDF-Rechnung lesen — Aufbau erklärt"
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
last_updated: "2026-05-25"
status: "published"
---

Die KickPact-Rechnung ist ein **steuerlich saubere DIN-A4-PDF** — geeignet für Buchhaltung, Vorsteuerabzug (wenn USt ausgewiesen) und Banküberweisung. Hier eine Tour durch die Seiten.

## Kopfbereich

Oben links:
- **Vereinslogo** (wenn hinterlegt)
- **Vereinsname** + Anschrift
- **Steuer-ID oder USt-ID**
- **IBAN**

Oben rechts:
- **Rechnungsnummer** (fortlaufend, z.B. `FCM-2026-05-0042`)
- **Rechnungsdatum** (1. des Monats)
- **Leistungszeitraum** (Vormonat)
- **Zahlungsziel** (Datum, Standard 14 Tage)

Darunter:
- **Sponsor-Anschrift** (Rechnungs-Empfänger)

## Anschreiben

Ein kurzer freundlicher Absatz: "Wir bedanken uns für deine Unterstützung im Monat April. Die folgenden Ereignisse sind aus deinem Pledge entstanden."

Vereine mit Pro/Vereinslizenz können diesen Text individuell anpassen — siehe [Vereins-Mail-Absender einrichten](vereins-mail-absender-einrichten.md).

## Detailtabelle

Die Hauptseite ist eine Tabelle mit allen Charges. Spalten:

| Datum | Match / Ereignis | Trigger | Anzahl | Einzelpreis | Summe |
|---|---|---|---:|---:|---:|
| 03.04. | FCM vs ASV (2:1) | Tor | 2 | 5,00 € | 10,00 € |
| 03.04. | FCM vs ASV | Sieg | 1 | 20,00 € | 20,00 € |
| 10.04. | FCM vs TSG (1:1) | Tor | 1 | 5,00 € | 5,00 € |
| 10.04. | FCM vs TSG | Unentschieden | 1 | 5,00 € | 5,00 € |
| ... | ... | ... | ... | ... | ... |

**Lesehilfe:**
- Eine Zeile pro Match × Trigger.
- Spieler-Triggers haben den Spielernamen in der "Match / Ereignis"-Spalte mit drin: "FCM vs ASV — Tor Tim Schmidt".
- Manual-Triggers werden gleich behandelt — der Sponsor sieht nicht, ob das auto oder manual war, das ist abrechnungstechnisch egal.

## Cap-Hinweise

Wenn ein Cap gegriffen hat, gibt es einen Hinweis am Ende der Tabelle:

> **Hinweis:** Im Spiel FCM vs ASV (03.04.) wurden 5 Tore erzielt, davon 3 Tore vom Per-Match-Cap (15 €) geblockt.

Das ist **transparenz-only** — die geblockten Tore tauchen nicht als Charge auf, du wirst dafür nicht abgerechnet.

## Summen-Block

Unten rechts:

- **Zwischensumme** (alle Charges summiert)
- **USt** (falls Verein regelbesteuert): z.B. 19 %
- **Brutto-Summe**

Wenn der Verein **Kleinunternehmer (§ 19 UStG)** ist:
- Keine USt-Zeile.
- Stattdessen Text: "Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen."
- Brutto = Zwischensumme.

## Zahlungs-Hinweis

Ein klarer Hinweis am Ende:

> Bitte überweise **78,00 €** binnen 14 Tagen auf:
> IBAN: DE12 3456 7890 1234 5678 90
> BIC: BAFEDXXX
> Verwendungszweck: **FCM-2026-05-0042**

Der Verwendungszweck (= Rechnungsnummer) ist **wichtig**, damit der Verein die Zahlung automatisch zuordnen kann (wenn er die KickPact-Banking-Integration in einer späteren Version nutzt — v1 noch manuell).

## Fußzeile

- Vereinsname, Anschrift (Pflicht laut UStG)
- Geschäftsführung / Vorstand (vom Verein hinterlegt)
- Vereinsregister-Nummer (optional)
- KickPact-Branding nur in der Trial-Phase + auf Basic-Tarif — Pro / Vereinslizenz **white-label**, also kein KickPact-Hinweis.

## Mehrseitig bei vielen Charges

Wenn die Detailtabelle die erste Seite überschreitet, läuft sie auf Folgeseiten weiter. Jede Seite hat **Rechnungsnummer + Seitenzahl** in der Kopfzeile, damit beim Druck nichts verloren geht.

## Wo du die Rechnung findest

- **Sponsor**: Mail-Anhang am 1. des Monats + im Sponsor-Dashboard unter "Rechnungen".
- **Verein**: Vereins-Dashboard unter "Abrechnungen → Vergangene Monate".

Beide können die PDF jederzeit erneut herunterladen.

## Wenn die Rechnung Fehler enthält

Drei Fälle:

1. **Sponsoren-Stammdaten falsch** (z.B. neue Adresse nicht aktualisiert): Sponsor ändert in Profil, neue Rechnungen verwenden neue Daten. **Korrektur-Rechnung** auf Anfrage an support@kickpact.de.
2. **Falsche Charge** (Manual-Event versehentlich bestätigt): Sponsor bestreitet die Charge — siehe [Event bestreiten](event-bestreiten.md). Bei berechtigtem Bestreit erscheint im **Folgemonat eine Storno-Charge**.
3. **USt-Status falsch** (Verein war als § 19 hinterlegt, ist aber regelbesteuert): Verein ändert in Stammdaten, alle Folgerechnungen sind korrekt. Korrektur vergangener Rechnungen über Support.

Weiter lesen:
- [So funktioniert die Monatsrechnung](so-funktioniert-die-monatsrechnung.md)
- [USt und Kleinunternehmer](ust-und-kleinunternehmer.md)
- [Als bezahlt markieren](als-bezahlt-markieren.md)
