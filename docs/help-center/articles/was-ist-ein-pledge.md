---
title: "Was ist ein Pledge?"
slug: "was-ist-ein-pledge"
category: "pledges-trigger"
category_label: "Pledges & Trigger"
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

**Pledge** ist das Herzstück von KickPact. Ein Sponsor verspricht: "Wenn X passiert, zahle ich Y". Wenn X dann wirklich passiert — durch Fußball.de oder durch den Verein bestätigt — wird Y automatisch verbucht.

## Was ein Pledge konkret enthält

Ein Pledge ist ein Container für **eine oder mehrere Pledge-Regeln** plus **Caps**.

### Pledge-Regel = Trigger + Betrag + optionaler Filter

Beispiele:

- **Trigger:** "Tor der Mannschaft" → **Betrag:** 5 € → **Filter:** keiner → "5 € pro Tor, egal wer"
- **Trigger:** "Tor eines Spielers" → **Betrag:** 10 € → **Filter:** Tim Schmidt → "10 € pro Tor von Tim"
- **Trigger:** "Sieg" → **Betrag:** 20 € → **Filter:** keiner → "20 € pro Sieg"

Du kannst beliebig viele Regeln in einem Pledge kombinieren. Auf Basic ist die Obergrenze 3 Regeln pro Sponsor, auf Pro / Vereinslizenz sind beliebig viele Regeln drin.

### Caps = Schutz vor Überraschungen

Ohne Cap ist ein Pledge offen — bei einem 7:1-Sieg deiner Mannschaft mit 7 × 5 € Pledge wären das 35 € allein für ein Spiel. Caps verhindern das:

- **Per-Match-Cap** pro Regel oder pro Pledge
- **Monats-Cap** pro Pledge
- **Saison-Cap** pro Pledge

Mehr in [Caps und Monats-Limits](caps-und-monats-limits.md).

## Was passiert wenn ein Trigger feuert

Im Beispiel: Mannschaft spielt am Samstag 3:1. Crawler holt das Ergebnis am Sonntag ein. Für deinen 5 €-Tor-Pledge passieren drei Sachen:

1. **3 Charges** mit je 5 € werden erzeugt (3 Tore = 3 × 5 €).
2. Caps werden geprüft. Falls ein Cap erreicht ist, werden weitere Charges geblockt.
3. Du siehst die Charges in deinem **Sponsor-Dashboard** unter "Diese Woche". Du musst nichts bestätigen — das passiert automatisch.

Bei Manual-Triggern (z.B. "Kopfball") feuert der Trigger erst, wenn der Verein das Ereignis im KickPact-System bestätigt. Sponsoren mit Manual-Trigger-Pledges haben deshalb oft **Pending Events** zum Bestätigen — siehe [Pending Events bestätigen](pending-events-bestaetigen.md).

## Was am Monatsende passiert

Am **1. des Folgemonats** generiert KickPact:

- Eine **PDF-Rechnung** an dich (den Sponsor) mit allen Charges des Vormonats
- Eine **PDF-Rechnung** an den Verein als Spiegel
- Eine summierte Übersicht im **Verein-Dashboard**

Mehr in [So funktioniert die Monatsrechnung](so-funktioniert-die-monatsrechnung.md).

Du zahlst dann per Überweisung an den Verein. KickPact zieht **nichts automatisch ein** in v1.

## Pledge vs Pledge-Regel — der feine Unterschied

- **Pledge** = das Versprechen insgesamt, das auf der Rechnung steht und das du pausieren / beenden kannst.
- **Pledge-Regel** = einzelne Trigger-Betrag-Kombination innerhalb des Pledges.

Ein Pledge mit drei Regeln = ein "Sponsoring-Bundle" mit drei Auslösern.

## Wann ein Pledge endet

- Du beendest ihn aktiv ("Pledge beenden" im Dashboard) — sofort, keine weiteren Charges
- Du pausierst ihn — auch sofort, kein Charge bis du fortsetzt
- **Saison-Ende** — bei Saison-Pass-Tarifen läuft der Pledge mit der Saison aus, du erneuerst ihn ggf. zur neuen Saison
- **Kündigung des Vereins-Abos** — Pledges werden inaktiv, du hast Read-Only-Zugriff für Archivzwecke

## Wie KickPact technisch Pledges abbildet

(Für die Neugierigen — der Rest darf weiterscrollen.)

Ein Pledge hat eine `pledges`-Zeile in der DB, dazu N `pledge_rules`-Zeilen mit Trigger-Typ, Betrag, optionalem `player_id` und Caps. Jedes Match-Event vom Crawler wird gegen alle aktiven Pledges der Mannschaft geprüft (Trigger-Engine in `lib/triggers/`), passende `charges`-Zeilen werden erzeugt, Caps applied.

Weiter lesen:
- [Ersten Pledge anlegen](ersten-pledge-anlegen.md)
- [Auto-Trigger-Katalog](auto-trigger-katalog.md)
- [Caps und Monats-Limits](caps-und-monats-limits.md)
