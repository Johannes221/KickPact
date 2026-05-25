---
title: "USt und Kleinunternehmer (§ 19 UStG)"
slug: "ust-und-kleinunternehmer"
category: "abrechnung"
category_label: "Abrechnung"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "vereins-stammdaten-und-logo"
  - "pdf-rechnung-lesen"
  - "so-funktioniert-die-monatsrechnung"
last_updated: "2026-05-25"
status: "published"
---

Steuerrechtlich entscheidest du beim Setup: ist dein Verein **Kleinunternehmer (§ 19 UStG)** oder **regelbesteuert**? Die Wahl bestimmt, was auf der Rechnung steht. KickPact ist neutral — wir wissen deine Steuersituation nicht, du musst es korrekt setzen.

> **Wichtig:** Das hier ist keine Steuerberatung. Im Zweifel deinen Steuerberater fragen. KickPact stellt nur die technische Möglichkeit zur Verfügung, beides korrekt abzubilden.

## Die zwei Optionen — Schnellüberblick

| § 19 UStG (Kleinunternehmer) | Regelbesteuerung |
|---|---|
| Kein USt-Ausweis auf Rechnung | USt-Ausweis (meist 19 %) auf Rechnung |
| Hinweis "Gemäß § 19 UStG..." | USt-ID Pflicht auf Rechnung |
| Keine USt-Voranmeldung nötig | USt-Voranmeldung beim Finanzamt |
| Umsatzgrenze: 22.000 € im Vorjahr UND ≤ 50.000 € erwartet | Keine Grenze |
| Praktisch für kleine Vereine | Standard für größere Vereine |

## Wo du es setzt

**Verein → Einstellungen → Stammdaten → Steuerstatus.**

Drei Felder:

- Radio-Button: **Kleinunternehmer (§ 19 UStG)** oder **Regelbesteuert**
- Bei Regelbesteuerung: **USt-Satz** (meist 19 %, bei einigen Vereinen 7 % als ermäßigter Satz für gemeinnützige Tätigkeit)
- **USt-ID** (Pflicht bei Regelbesteuerung, leer bei Kleinunternehmer)

## Was auf der Rechnung erscheint

### Bei Kleinunternehmer (§ 19 UStG)

```
Zwischensumme: 78,00 €

Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.

Gesamtsumme: 78,00 €
```

Keine separate USt-Zeile, keine USt-ID nötig auf der Rechnung. Der Verein zeigt **stattdessen** seine Steuer-Nummer (vom Finanzamt, nicht USt-ID).

### Bei Regelbesteuerung

```
Zwischensumme: 65,55 € (netto)
zzgl. 19 % USt: 12,45 €
Gesamtsumme: 78,00 € (brutto)

USt-ID des Vereins: DE123456789
```

Wenn der **Sponsor geschäftlich** ist und seine USt-ID hinterlegt hat, erscheint sie auch auf der Rechnung. Damit kann er die ausgewiesene USt als Vorsteuer abziehen.

## Welche Option für dich passt

### Du bist sehr wahrscheinlich Kleinunternehmer wenn...

- Dein Verein im Vorjahr unter 22.000 € Umsatz hatte (alle Vereinseinnahmen zusammen, nicht nur Sponsoring).
- Du erwartest in diesem Jahr unter 50.000 € Umsatz.
- Du hast bisher dem Finanzamt **keinen Verzicht auf die Kleinunternehmer-Regelung** mitgeteilt.

In dieser Lage sind die meisten Amateur-Vereine.

### Du bist regelbesteuert wenn...

- Vorjahresumsatz über 22.000 € **oder** erwarteter Umsatz über 50.000 €.
- Du hast aktiv **Verzicht auf § 19** beim Finanzamt erklärt (passiert manchmal bei größeren Vereinen, um Vorsteuer-Abzug auf Investitionen zu nutzen).

## Wechsel der Option

Du kannst jederzeit wechseln, aber:

- **Wechsel von § 19 → Regelbesteuerung**: muss beim Finanzamt angemeldet werden. Gilt dann für 5 Jahre verpflichtend. Erst nach dieser Bindung kannst du zurück.
- **Wechsel von Regelbesteuerung → § 19**: möglich bei Unterschreitung der Grenzen, beim Finanzamt anzeigen.

In KickPact: Stammdaten ändern, alle **zukünftigen Rechnungen** verwenden den neuen Status. Alte Rechnungen bleiben mit dem damals gültigen Status archiviert.

## Was der Sponsor steuerlich davon hat

### Privat-Sponsor

- **Nicht absetzbar** in der eigenen Steuererklärung, egal ob § 19 oder Regelbesteuerung.
- Bei § 19: keine zusätzliche Komplikation.
- Bei Regelbesteuerung: USt steht zur Info auf der Rechnung, hat aber keine steuerliche Wirkung für den Sponsor.

### Geschäfts-Sponsor

- **Bei Verein § 19**: Brutto = Netto, voller Betrag als Betriebsausgabe absetzbar (sofern Marketing-Charakter gegeben).
- **Bei Verein Regelbesteuerung**: Netto als Betriebsausgabe + USt als Vorsteuer absetzbar (sofern Sponsor selbst USt-pflichtig).

Für den Geschäfts-Sponsor ist **Regelbesteuerung des Vereins steuerlich attraktiver** — er kriegt die Vorsteuer zurück. Pragmatisch: Bei größeren Local-Business-Sponsoren ist Regelbesteuerung des Vereins oft willkommen.

## Was wenn du falsch gesetzt hast und die Rechnung schon raus ist?

- **Verein war § 19, sollte aber Regelbesteuerung sein**: Korrektur-Rechnung an den Sponsor, USt nachzahlen, beim Finanzamt klären. KickPact macht **Korrektur-Rechnungen über den Support**: support@kickpact.de mit Vereinsname.
- **Verein war Regelbesteuerung, sollte § 19 sein**: Auch hier Korrektur. Sponsor zahlt zu viel, kriegt USt zurück. Verein darf die zu viel ausgewiesene USt nicht behalten — beim Finanzamt klären.

## Sondertarife (ermäßigter USt-Satz 7 %)

Manche gemeinnützige Vereine können für bestimmte Leistungen **7 % USt** statt 19 % ansetzen. Sponsoring ist normalerweise **nicht** in diesem Bereich — typischer Sponsoring-Umsatz fällt unter 19 %.

Wenn dein Steuerberater dir sagt "7 % anwenden", kannst du das in KickPact entsprechend setzen. Wir prüfen das nicht inhaltlich, vertrauen deiner Angabe.

Weiter lesen:
- [Vereins-Stammdaten und Logo](vereins-stammdaten-und-logo.md)
- [PDF-Rechnung lesen](pdf-rechnung-lesen.md)
- [So funktioniert die Monatsrechnung](so-funktioniert-die-monatsrechnung.md)
