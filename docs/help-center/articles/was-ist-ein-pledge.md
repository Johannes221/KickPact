---
title: "Was ist ein Pact?"
slug: "was-ist-ein-pledge"
category: "pledges-trigger"
category_label: "Pacts & Trigger"
prio: "MUSS"
audience: ["sponsor", "verein-admin", "trainer"]
related_articles:
  - "ersten-pledge-anlegen"
  - "auto-trigger-katalog"
  - "caps-und-monats-limits"
  - "worst-case-berechnung-verstehen"
last_updated: "2026-05-25"
status: "published"
---

Der **Pact** ist das Herzstück von KickPact. Ein Sponsor verspricht: "Wenn X passiert, zahle ich Y". Wenn X dann wirklich passiert — durch Fußball.de oder durch den Verein bestätigt — wird Y automatisch verbucht.

## Was ein Pact konkret enthält

Ein Pact ist ein Container für **eine oder mehrere Regeln** plus **Caps**.

### Regel = Trigger + Betrag + optionaler Filter

Beispiele:

- **Trigger:** "Tor der Mannschaft" → **Betrag:** 5 € → **Filter:** keiner → "5 € pro Tor, egal wer"
- **Trigger:** "Tor eines Spielers" → **Betrag:** 10 € → **Filter:** Tim Schmidt → "10 € pro Tor von Tim"
- **Trigger:** "Sieg" → **Betrag:** 20 € → **Filter:** keiner → "20 € pro Sieg"

Du kannst beliebig viele Regeln in einem Pact kombinieren. Auf Basic ist die Obergrenze 3 Regeln pro Sponsor, auf Pro / Vereinslizenz sind beliebig viele Regeln drin.

### Caps = Schutz vor Überraschungen

Ohne Cap ist ein Pact offen — bei einem 7:1-Sieg deiner Mannschaft mit 7 × 5 € wären das 35 € allein für ein Spiel. Caps verhindern das:

- **Monats-Cap** pro Pact — dein Limit pro Kalendermonat
- **Saison-Cap** pro Regel — dein Limit für die ganze Saison

Mehr in [Caps und Monats-Limits](caps-und-monats-limits.md).

## Was passiert wenn ein Trigger feuert

Im Beispiel: Mannschaft spielt am Samstag 3:1. KickPact holt das Ergebnis automatisch ein. Für deinen 5 €-Tor-Pact passieren drei Sachen:

1. **3 Beiträge** mit je 5 € werden erzeugt (3 Tore = 3 × 5 €).
2. Caps werden geprüft. Falls ein Cap erreicht ist, werden weitere Beiträge geblockt.
3. Du siehst die Beiträge in deinem **Sponsor-Dashboard** unter "Diesen Monat". Du musst nichts bestätigen — das passiert automatisch.

Bei Manual-Triggern (z.B. "Kopfball") feuert der Trigger erst, wenn der Verein das Ereignis im KickPact-System bestätigt. Sponsoren mit Manual-Trigger-Pacts haben deshalb oft **Pending Events** zum Bestätigen — siehe [Pending Events bestätigen](pending-events-bestaetigen.md).

## Was am Monatsende passiert

Am **1. des Folgemonats** generiert KickPact:

- Eine **Zahlungsübersicht** (PDF) an dich (den Sponsor) mit allen Beiträgen des Vormonats
- Eine summierte Übersicht im **Verein-Dashboard**

Mehr in [So funktioniert die Monatsabrechnung](so-funktioniert-die-monatsrechnung.md).

Du zahlst dann per Überweisung an den Verein. KickPact zieht **nichts automatisch ein**.

## Pact vs Regel — der feine Unterschied

- **Pact** = das Versprechen insgesamt, das auf der Zahlungsübersicht steht und das du pausieren / beenden kannst.
- **Regel** = einzelne Trigger-Betrag-Kombination innerhalb des Pacts.

Ein Pact mit drei Regeln = ein "Sponsoring-Bundle" mit drei Auslösern.

## Wann ein Pact endet

- Du beendest ihn aktiv ("Pact beenden" im Dashboard) — sofort, keine weiteren Beiträge
- Du pausierst ihn — auch sofort, kein Beitrag bis du fortsetzt
- **Saison-Ende** — bei Saison-Pass-Tarifen läuft der Pact mit der Saison aus, du erneuerst ihn ggf. zur neuen Saison
- **Kündigung des Vereins-Abos** — Pacts werden inaktiv, du hast Read-Only-Zugriff für Archivzwecke

Weiter lesen:
- [Ersten Pact anlegen](ersten-pledge-anlegen.md)
- [Auto-Trigger-Katalog](auto-trigger-katalog.md)
- [Caps und Monats-Limits](caps-und-monats-limits.md)
