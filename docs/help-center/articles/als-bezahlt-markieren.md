---
title: "Rechnung als bezahlt markieren"
slug: "als-bezahlt-markieren"
category: "abrechnung"
category_label: "Abrechnung"
prio: "MUSS"
audience: ["verein-admin"]
related_articles:
  - "so-funktioniert-die-monatsrechnung"
  - "reminder-an-sponsor"
  - "pdf-rechnung-lesen"
  - "csv-export-fuer-buchhaltung"
last_updated: "2026-05-25"
status: "published"
---

Geld kommt **off-platform** — also direkt per Überweisung von Sponsor auf Vereinskonto. Damit KickPact weiß, wer schon bezahlt hat, markierst du Rechnungen manuell als bezahlt. So gehts.

## Wo du es markierst

**Verein → Mannschaft → Abrechnungen → Vergangene Monate.**

Pro Monat siehst du eine Liste aller Sponsoren-Rechnungen mit:

- Sponsor-Name
- Rechnungs-Nummer
- Betrag
- Status: **Offen** / **Bezahlt** / **Überfällig** / **Storniert**
- Rechnungsdatum
- Zahlungsziel

Pro Zeile gibt's einen Button **"Als bezahlt markieren"**.

## Was passiert beim Markieren

1. Status springt auf **Bezahlt**.
2. Zeitstempel + dein User wird hinterlegt (Audit-Log).
3. Sponsor sieht in **seinem Dashboard** den neuen Status — keine separate Mail nötig, aber Sponsor bekommt eine Bestätigungs-Notification (optional).
4. Rechnung verschwindet aus der **"Offen"**-Liste, taucht in **"Bezahlt"** auf.

## Drei sinnvolle Workflows

### Workflow 1 — Bank-Online-Banking + KickPact parallel

Du loggst dich abends ins Online-Banking, siehst die heute eingegangenen Überweisungen. Pro Überweisung:
- Notiere die Rechnungsnummer aus dem Verwendungszweck.
- Gehe in KickPact → Abrechnungen, suche die Rechnung, markier als bezahlt.

Mit ein bisschen Übung: ca. 30 Sekunden pro Rechnung.

### Workflow 2 — CSV-Abgleich (Pro / Vereinslizenz)

Du exportierst:
- Aus dem **Online-Banking** die CSV mit Zahlungseingängen.
- Aus **KickPact → Abrechnungen → Export → CSV** die offenen Rechnungen.

Beide enthalten Rechnungsnummern. Über Excel oder Buchhaltungs-Software einen Abgleich machen, dann in KickPact die passenden als bezahlt markieren. Mehr in [CSV-Export für Buchhaltung](csv-export-fuer-buchhaltung.md).

### Workflow 3 — Vereins-Schatzmeister-Doppelcheck

Schatzmeister hat **Viewer-Rolle** und sieht alle Rechnungen, kann aber nichts markieren. Vorstand-Admin macht die Markierung, Schatzmeister kann jederzeit gegenchecken.

## Massen-Markierung

Wenn du an einem Stichtag (z.B. 15. des Monats) viele Sponsoren auf einmal als bezahlt markieren willst:

1. Filtere die Liste auf **"Offen"**.
2. Checkboxen pro Zeile + Massenaktion **"Auswahl als bezahlt markieren"**.
3. Du kannst optional einen **Zahlungs-Eingangs-Tag** angeben (Standard: heute).

## Was tun bei Teilzahlungen?

Sponsor zahlt nicht den vollen Betrag, sondern weniger (z.B. weil Cap-Streit, oder Sponsor protestiert ein Event):

- **Option A** — Rechnung **nicht als bezahlt markieren**, in der nächsten Rechnung den Restbetrag mit Hinweis berücksichtigen.
- **Option B** — Verein storniert ein einzelnes Event (Manual-Action), die Folgemonatsrechnung enthält die Korrektur.
- **Option C** — Manuelle Anmerkung: Rechnung als bezahlt markieren, im Feld "Notiz" "Teilzahlung 50 von 78 €, Rest pending" hinterlegen. Pragmatisch, weniger sauber.

KickPact hat **keinen automatischen Teilzahlungs-Workflow** in v1 — kommt in v2.

## Zurück auf Offen setzen

Wenn du versehentlich falsch markiert hast:

- **Drei-Punkte-Menü** auf der Zeile → **"Status zurücksetzen"**.
- Audit-Log behält den Eintrag (du siehst "markiert von X um 14:33, zurückgesetzt von X um 14:35").

## Überfällig-Markierung

KickPact markiert eine Rechnung automatisch als **Überfällig**, sobald das Zahlungsziel verstrichen ist. Du bekommst eine Mail mit Hinweis, kannst von dort direkt eine **Erinnerung an den Sponsor** schicken — siehe [Reminder an Sponsor](reminder-an-sponsor.md).

## Was du **nicht** machen solltest

- **Nicht** alle Rechnungen pauschal markieren, weil "der Verein hat eh genug Geld". Sponsor sieht den Status und vertraut darauf. Wenn das ungenau ist, brennt das Vertrauen weg.
- **Nicht** eine Rechnung als bezahlt markieren, bevor das Geld da ist (außer du machst das absichtlich für interne Vorerfassung — dann setze sie zurück, wenn das Geld nicht kommt).

## Bei Vereinslizenz mit Sammelrechnung

Wenn ein Sponsor mehrere Mannschaften unterstützt und du Vereinslizenz hast, gibt's **eine Sammelrechnung** pro Monat. Markieren funktioniert genauso — wenn der Sponsor zahlt, markierst du die Sammelrechnung. Die Aufteilung auf einzelne Mannschaften erledigt KickPact intern, die Buchhaltung ist eine Zahlung.

Weiter lesen:
- [Reminder an Sponsor](reminder-an-sponsor.md)
- [So funktioniert die Monatsrechnung](so-funktioniert-die-monatsrechnung.md)
- [CSV-Export für Buchhaltung](csv-export-fuer-buchhaltung.md)
