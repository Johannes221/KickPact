---
title: "So funktioniert die Monatsabrechnung"
slug: "so-funktioniert-die-monatsrechnung"
category: "abrechnung"
category_label: "Abrechnung"
prio: "MUSS"
audience: ["verein-admin", "sponsor", "vereinslizenz-admin"]
related_articles:
  - "pdf-rechnung-lesen"
  - "als-bezahlt-markieren"
  - "ust-und-kleinunternehmer"
  - "reminder-logik"
last_updated: "2026-05-25"
status: "published"
---

KickPact rechnet **monatlich** ab. Am **1. eines Monats**, **08:00 Uhr**, generieren wir aus allen Beiträgen des Vormonats eine **Zahlungsübersicht** (PDF) pro Sponsor + Mannschaft und schicken sie automatisch raus. So sieht der Ablauf aus.

## Was passiert am 1. des Monats

1. **00:00 Uhr** — KickPact sperrt alle Beiträge des Vormonats für Änderungen. Sie sind ab jetzt unveränderlich.
2. **08:00 Uhr** — Der **Abrechnungslauf** startet pro Mannschaft:
   - Für jeden Sponsor wird ein **PDF erstellt** mit allen Beiträgen aus dem Vormonat.
   - Eine **Vereins-Übersicht** wird erstellt: Summe aller Zahlungsübersichten.
   - PDFs werden dauerhaft gespeichert und bleiben jederzeit abrufbar.
3. **08:30 Uhr** — **Mails an Sponsoren** mit PDF als Anhang + Link zum Dashboard.
4. **08:30 Uhr** — **Mail an Verein** mit der Vereins-Übersicht + Liste aller Zahlungsübersichten.

Die ganze Aktion dauert für die meisten Vereine **wenige Sekunden**. Bei Vereinen mit 50+ Sponsoren ein paar Minuten.

## Was auf der Zahlungsübersicht steht

Eine typische Zahlungsübersicht enthält:

- **Empfänger:** Sponsor (Anzeigename + E-Mail aus dem Sponsor-Profil)
- **Absender:** Verein (Name + Adresse + IBAN aus den Vereins-Stammdaten)
- **Referenznummer:** fortlaufend pro Verein (Format: `VEREIN-2026-05-0001`)
- **Datum:** 1. des Monats
- **Zeitraum:** der Vormonat (z.B. "April 2026")
- **Beitrags-Zeilen:**
  - Pro Beitrag eine Zeile mit Datum, Spiel und Anlass: "Tor in Spiel FCM vs ASV am 12.04. — 5,00 €"
- **Gesamtbetrag:** eine Summe, fertig. Keine USt — Sponsoren-Beiträge sind private Unterstützung, keine bezahlte Leistung.
- **Zahlungs-Block:** IBAN mit QR-Code für die Banking-App, Verwendungszweck = Referenznummer. Wenn der Verein PayPal oder einen Online-Zahllink hinterlegt hat, stehen die auch drauf.

Mehr zur Lesart in [Zahlungsübersicht lesen](pdf-rechnung-lesen.md).

## Was der Verein bekommt

Eine **Zusammenfassung** mit:

- Pro Sponsor eine Zeile: "Familie Schmidt — 78 €"
- Total für den Vormonat
- Liste der bisher **bezahlten** vs. **offenen** Zahlungsübersichten
- Erinnerungs-Hilfe: KickPact stellt dir einen fertigen, freundlichen Erinnerungstext bereit, den du kopierst und selbst verschickst

Plus eine **PDF-Sammelmappe** mit allen einzelnen Zahlungsübersichten.

## Wann der Sponsor zahlt

KickPact zieht **nichts automatisch** ein. Der Sponsor sieht die Zahlungsübersicht, überweist den Betrag manuell ans Vereinskonto — oder scannt einfach den QR-Code mit der Banking-App.

Standardablauf:

- **Zahlbar binnen 14 Tagen** (Default).
- Danach markiert KickPact die Übersicht als **überfällig**. Automatische Mahnungen gibt es bewusst nicht — das sind eure Leute, kein Inkasso-Fall.
- Du kannst jederzeit den vorbereiteten Erinnerungstext kopieren und per WhatsApp oder Mail schicken.

Mehr in [Als bezahlt markieren](als-bezahlt-markieren.md).

## Was ist mit dem laufenden Monat?

Beiträge des **laufenden Monats** werden im **Sponsor-Dashboard und im Vereins-Dashboard live** angezeigt. Du siehst:

- "Stand heute, 23. Mai: 47 € offene Beiträge für diesen Monat"
- Pro Beitrag die Match-Referenz, das Datum, den Betrag
- Cap-Auslastung (z.B. "47 € / 100 € Monats-Cap — 47 %")

Du kannst diese **Live-Beiträge noch ändern** — z.B. ein Manual-Event widerrufen, ein Match nachträglich anpassen. Sobald der 1. des Folgemonats kommt, sind alle Beiträge **eingefroren**.

## Mehrere Pacts, mehrere Mannschaften

Ein Sponsor mit mehreren Pacts (z.B. zwei Mannschaften):

- **Bei Basic / Pro**: 2 separate Zahlungsübersichten vom Verein (eine pro Mannschaft).
- **Bei Vereinslizenz**: 1 Sammelübersicht mit allen Mannschaften zusammen.

## Storno und Nachträge

**Storno eines einzelnen Beitrags** (Verein-Admin):

- Bis zum 1. des Folgemonats: Beitrag direkt löschen, taucht nirgends mehr auf.
- Nach dem 1.: **Stornobeleg** zur ursprünglichen Zahlungsübersicht — der Betrag wird verrechnet bzw. erstattet.

**Nachtrag** (Trainer hat ein Manual-Event vergessen):

- Trainer kann bis zum 7. des Folgemonats nachpflegen. Der Eintrag erscheint in der **Abrechnung des Folgemonats** (nicht rückwirkend in der schon versendeten).

## Was wenn das KickPact-Abo gekündigt ist?

Read-Only-Modus: Die letzte Monatsabrechnung läuft noch durch. Danach: keine automatischen Spieldaten, keine Beiträge, keine Zahlungsübersichten. Bestehende, unbezahlte Übersichten bleiben sichtbar und können noch markiert werden.

Weiter lesen:
- [Zahlungsübersicht lesen](pdf-rechnung-lesen.md)
- [Als bezahlt markieren](als-bezahlt-markieren.md)
- [USt und Steuern](ust-und-kleinunternehmer.md)
