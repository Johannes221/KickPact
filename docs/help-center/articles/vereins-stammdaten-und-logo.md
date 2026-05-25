---
title: "Vereins-Stammdaten und Logo"
slug: "vereins-stammdaten-und-logo"
category: "erste-schritte-verein"
category_label: "Erste Schritte — Verein"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "pdf-rechnung-lesen"
  - "ust-und-kleinunternehmer"
  - "vereins-mail-absender-einrichten"
  - "erste-schritte-verein"
last_updated: "2026-05-25"
status: "published"
---

Stammdaten klingt langweilig — aber genau diese Daten landen auf der **PDF-Rechnung**, die deine Sponsoren bekommen. Ohne saubere Stammdaten keine ordentliche Rechnung. Setze es einmal richtig, dann läufts.

## Was KickPact von dir braucht

- **Vereinsname** (offiziell, wie im Vereinsregister)
- **Anschrift**: Straße, PLZ, Ort, Land
- **IBAN** des Vereinskontos
- **Steuer-ID oder USt-ID** (eine von beiden reicht)
- **§ 19 UStG-Status** (Kleinunternehmer ja/nein) — siehe [USt und Kleinunternehmer](ust-und-kleinunternehmer.md)
- **Logo** als PNG oder SVG, idealerweise transparenter Hintergrund

## Wo du das einträgst

**Verein → Einstellungen → Stammdaten.**

Alle Felder sind editierbar. Speichern wirkt sofort — die nächste PDF-Rechnung verwendet die neuen Daten. Vergangene Rechnungen bleiben mit den damals gültigen Daten archiviert (Abrechnungs-History fälschungsfrei).

## Pflichtfelder vor erster Rechnung

Vor der ersten Monatsrechnung am 1. des Monats prüft KickPact automatisch:

- Anschrift komplett? ✅
- IBAN gesetzt? ✅
- Steuer-Status entschieden (§ 19 oder Regelbesteuerung)? ✅

Fehlt was, schreiben wir dir 5 Tage vorher eine E-Mail mit konkretem Link auf das fehlende Feld. Wenn die Rechnung gestartet wird und Pflichtfelder fehlen, **pausiert** der Rechnungslauf für deinen Verein, bis du nachgepflegt hast — Sponsoren kriegen dann nichts.

## Logo-Upload

Pro Mannschaft kannst du **ein eigenes Logo** uploaden (z.B. Hauptlogo der Herren, Stadtwappen für die Jugend). Das Logo erscheint:

- Oben links in jeder PDF-Rechnung
- Im Browser-Tab und auf öffentlichen Seiten der Mannschaft
- Optional auf dem [Embed-Widget](embed-widget-vereinswebsite.md)

**Empfohlene Specs:**

- Format: SVG (skaliert verlustfrei) oder PNG mit transparentem Hintergrund
- Auflösung: mindestens 512×512 px bei PNG
- Dateigröße: max. 2 MB
- Verhältnis: möglichst quadratisch (Wir beschneiden bei stark abweichendem Seitenverhältnis)

## USt-ID vs. Steuer-Nummer

- **Kein Verein hat eine USt-ID**, der nicht regelbesteuert ist. Wenn dein Verein § 19 UStG nutzt, lass das Feld leer.
- **Steuer-Nummer** ist die normale Vereins-Steuernummer vom Finanzamt — die haben praktisch alle Vereine.

Auf der Rechnung erscheint:

- Bei § 19: "Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen."
- Bei Regelbesteuerung: USt-Ausweis (z.B. 19 %) plus deine USt-ID.

Welche Variante korrekt ist, hängt von Vereins-Umsatz und Vereinsstatus ab. Im Zweifel: deinen Steuerberater fragen. KickPact ist neutral, wir kennen deine Steuersituation nicht.

## IBAN sichtbar für Sponsoren

Die IBAN steht **nur auf der PDF-Rechnung**, die der Sponsor bekommt. Im KickPact-Dashboard zeigen wir sie maskiert (DE12 **** **** **** **** 34) an, damit ein zufällig danebenstehender Trainer nicht das Vereinskonto vor Augen hat.

## Vereins-Logo vs. Mannschafts-Logo

Bei Vereinslizenz kannst du:

- Ein **Vereins-Logo** auf der Verein-Ebene (erscheint auf Sammelrechnungen).
- Ein **Mannschafts-Logo** pro Team (erscheint auf Einzelrechnungen).

Bei Basic/Pro ist nur das Mannschafts-Logo verfügbar.

Weiter lesen:
- [PDF-Rechnung lesen](pdf-rechnung-lesen.md)
- [USt und Kleinunternehmer](ust-und-kleinunternehmer.md)
- [Vereins-Mail-Absender einrichten](vereins-mail-absender-einrichten.md)
