---
title: "So funktioniert die Monatsrechnung"
slug: "so-funktioniert-die-monatsrechnung"
category: "abrechnung"
category_label: "Abrechnung"
prio: "MUSS"
audience: ["verein-admin", "sponsor", "vereinslizenz-admin"]
related_articles:
  - "pdf-rechnung-lesen"
  - "als-bezahlt-markieren"
  - "ust-und-kleinunternehmer"
  - "reminder-an-sponsor"
last_updated: "2026-05-25"
status: "published"
---

KickPact rechnet **monatlich** ab. Am **1. eines Monats**, **08:00 Uhr**, generieren wir aus allen Charges des Vormonats eine **PDF-Rechnung** pro Sponsor + Mannschaft und schicken sie automatisch raus. So sieht der Ablauf aus.

## Was passiert am 1. des Monats

1. **00:00 Uhr** — KickPact sperrt alle Charges des Vormonats für Änderungen. Sie sind ab jetzt unveränderlich.
2. **08:00 Uhr** — Der **Rechnungs-Generator** läuft pro Mannschaft:
   - Für jeden Sponsor wird ein **PDF erstellt** mit allen Charges aus dem Vormonat.
   - Eine **Vereins-Übersicht** wird erstellt: Summe aller Sponsoren-Rechnungen.
   - PDFs werden in deinem S3-Speicher abgelegt, persistent + revisionssicher.
3. **08:30 Uhr** — **Mails an Sponsoren** mit PDF als Anhang + Link zum Dashboard.
4. **08:30 Uhr** — **Mail an Verein** mit der Vereins-Übersicht + Liste aller Sponsoren-Rechnungen.

Die ganze Aktion dauert für die meisten Vereine **wenige Sekunden**. Bei Vereinen mit 50+ Sponsoren ein paar Minuten.

## Was auf der Sponsor-Rechnung steht

Eine typische Monatsrechnung enthält:

- **Rechnungs-Empfänger:** Sponsor (Name + Adresse aus Sponsor-Profil)
- **Rechnungs-Sender:** Verein (Name + Adresse + IBAN + USt-Status aus Vereins-Stammdaten)
- **Rechnungsnummer:** fortlaufend pro Verein (Format: `VEREIN-2026-05-0001`)
- **Rechnungsdatum:** 1. des Monats
- **Leistungszeitraum:** der Vormonat (z.B. "April 2026")
- **Trigger-Items:**
  - Pro Charge eine Zeile: "Tor in Spiel FCM vs ASV am 12.04. — 5,00 €"
  - Manual-Trigger werden separat gruppiert
- **Summe**: netto, ggf. USt (falls Verein regelbesteuert), brutto
- **Zahlungs-Hinweis:** "Bitte überweisen an IBAN ... mit Verwendungszweck Rechnungs-Nummer XYZ"
- **§ 19 UStG-Hinweis** falls Verein Kleinunternehmer (siehe [USt und Kleinunternehmer](ust-und-kleinunternehmer.md))

Mehr zur Lesart in [PDF-Rechnung lesen](pdf-rechnung-lesen.md).

## Was der Verein bekommt

Eine **Zusammenfassung** mit:

- Pro Sponsor eine Zeile: "Familie Schmidt — 78 €"
- Total für den Vormonat
- Liste der bisher **bezahlten** vs. **offenen** Rechnungen
- Reminder-Möglichkeit (Button "Sponsoren erinnern, die noch nicht gezahlt haben")

Plus eine **PDF-Sammelmappe** mit allen einzelnen Sponsor-Rechnungen.

## Wann der Sponsor zahlt

KickPact zieht **nichts automatisch** ein. Der Sponsor sieht die Rechnung, überweist den Betrag manuell ans Vereinskonto.

Standardfristen:

- **Zahlbar binnen 14 Tagen** ohne Skonto (Default, Verein kann das in Stammdaten ändern).
- Nach 14 Tagen: erste Erinnerung via KickPact + Mail.
- Nach 28 Tagen: zweite Erinnerung.
- Nach 60 Tagen: Verein entscheidet (Inkasso, Mahnverfahren, weglassen — KickPact unterstützt das nicht aktiv).

Mehr in [Reminder an Sponsor](reminder-an-sponsor.md) und [Als bezahlt markieren](als-bezahlt-markieren.md).

## Was ist mit dem laufenden Monat?

Charges des **laufenden Monats** werden im **Sponsor-Dashboard und im Vereins-Dashboard live** angezeigt. Du siehst:

- "Stand heute, 23. Mai: 47 € offene Charges für diesen Monat"
- Pro Charge die Match-Referenz, das Datum, der Betrag
- Cap-Auslastung (z.B. "47 € / 100 € Monats-Cap — 47 %")

Du kannst diese **Live-Charges noch ändern** — z.B. ein Manual-Event widerrufen, ein Match nachträglich anpassen. Sobald der 1. des Folgemonats kommt, sind alle Charges **eingefroren**.

## Mehrere Pledges, mehrere Mannschaften

Ein Sponsor mit mehreren Pledges (z.B. zwei Mannschaften):

- **Bei Basic / Pro**: 2 separate Rechnungen vom Verein (eine pro Mannschaft).
- **Bei Vereinslizenz**: 1 Sammelrechnung mit allen Mannschaften zusammen. Siehe [Vereinslizenz Sammelrechnung](vereinslizenz-sammelrechnung.md).

## Storno und Nachträge

**Storno einer einzelnen Charge** (Verein-Admin):

- Bis zum 1. des Folgemonats: Charge direkt löschen, taucht nirgends mehr auf.
- Nach dem 1.: Storno-Eintrag in der **Folgemonatsrechnung** mit Negativbetrag.

**Nachtrag** (Trainer hat ein Manual-Event vergessen):

- Trainer kann bis zum 7. des Folgemonats nachpflegen. Der Eintrag erscheint in der **Folgemonatsrechnung** (nicht rückwirkend in der schon versendeten).

## Was wenn KickPact-Abo gekündigt ist?

Read-Only-Modus: Die letzte Monatsrechnung läuft noch durch. Danach: keine Crawler-Events, keine Charges, keine Rechnungen. Bestehende, unbezahlte Rechnungen bleiben sichtbar und können noch markiert werden.

Weiter lesen:
- [PDF-Rechnung lesen](pdf-rechnung-lesen.md)
- [Als bezahlt markieren](als-bezahlt-markieren.md)
- [USt und Kleinunternehmer](ust-und-kleinunternehmer.md)
