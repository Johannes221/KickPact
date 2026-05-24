---
title: "Saison-Pass vs Annual — was lohnt wann?"
slug: "saison-pass-vs-annual"
category: "tarife-pricing"
category_label: "Tarife & Pricing"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "welcher-tarif-passt"
  - "5-spieltag-cutoff"
  - "mid-season-einstieg"
  - "kuendigung-und-pause"
last_updated: "2026-05-24"
status: "published"
---

Beide sparen rund **2 Monate** gegenüber dem Monatsabo. Der Unterschied liegt darin, **wann dein Spielbetrieb läuft**.

## Die kurze Antwort

- **Du spielst nur die normale Punktspielsaison (August bis Mai)?** → **Saison-Pass**. 10 Monate aktiv, Juni/Juli kostenlos pausiert.
- **Du spielst ganzjährig** (Hallenfußball-Liga, Veteranen-Turniere, Sommer-Cup, AHs)? → **Annual**. 12 Monate durchgängig, kein Pause-Stop.

Wer 80 % der KickPact-Vereine sind, fährt mit dem **Saison-Pass** besser — und genau deshalb ist er die Default-Empfehlung im Wizard.

## Die Zahlen im direkten Vergleich

| Tarif | Saison-Pass (10 Mon. aktiv) | Annual (12 Mon. aktiv) | Differenz |
|---|---|---|---|
| Basic | **39 €** (3,90 €/Mon) | 49 €/Jahr (4,08 €/Mon) | Pass ist 18 ct/Mon günstiger |
| Pro | **149 €** (14,90 €/Mon) | 189 €/Jahr (15,75 €/Mon) | Pass ist 85 ct/Mon günstiger |
| Vereinslizenz | **389 €** (38,90 €/Mon) | 489 €/Jahr (40,75 €/Mon) | Pass ist 1,85 €/Mon günstiger |

Pro **aktivem** Monat ist der Saison-Pass immer minimal billiger. Annual kompensiert das nur, wenn du Juni und Juli wirklich aktiv brauchst (Crawler läuft, Sponsoren bekommen Charges, Rechnungen werden generiert).

## Wie funktioniert der Saison-Pass mechanisch?

- **Saison-Definition:** 1. August bis 31. Mai. Wir folgen dem DFB-Spieljahr.
- **Sommerpause:** 1. Juni bis 31. Juli **automatisch pausiert**. Kein Geld wird abgebucht. Der Crawler stoppt. Deine Daten, alle PDFs und Sponsor-Übersichten bleiben sichtbar.
- **Renewal:** Am 1. August zieht Stripe den Saison-Pass für die neue Saison ein. Wenn du **bis zum 30. Juni** kündigst, läuft nichts ein.
- **Winterpause** (Mitte Dezember bis Anfang Februar): **Keine** Subscription-Pause. Du zahlst weiter, weil deine Mannschaft den Rest der Saison aktiv spielt — der Crawler findet vier bis sechs Wochen einfach nichts Neues. Das ist gewollt: Tabellen und Stats bleiben sichtbar.

## Wie funktioniert Annual?

- 12 Monate Laufzeit ab Buchungsdatum.
- Crawler läuft durchgehend, auch im Juli, wenn deine Hallenmannschaft spielt.
- Renewal am Jahrestag der Buchung.
- Kündigung jederzeit zum Ende der 12-Monats-Laufzeit.

Kein Sommerpause-Reset. Das ist der einzige funktionale Unterschied.

## Konkrete Entscheidungs-Beispiele

**Beispiel 1 — TSV Beispieldorf, Herren I, Kreisliga A**
Spielt August bis Mai, Sommer ist Trainings-Camp und Fußballvereinsfest, keine offiziellen Spiele. → **Saison-Pass**. Kein Grund, Juni/Juli zu bezahlen.

**Beispiel 2 — TG Hallenstadt, Senioren Ü32**
Spielt eine Hallenliga im Sommer und nur eine kurze Punktspielsaison im Winter. → **Annual**, damit der Crawler ganzjährig durchläuft. Die 40 € Mehrkosten gegenüber dem Pro-Saison-Pass sind ein Witz gegenüber dem manuellen Aufwand, Spiele nachzutragen.

**Beispiel 3 — FC Mehrteam, Vereinslizenz mit 4 Mannschaften, eine davon spielt Sommerturniere**
Die meisten Mannschaften haben Sommerpause, eine nicht. → Trotzdem **Vereinslizenz Saison-Pass**. Die eine Sommerturnier-Mannschaft kannst du als Ausnahme manuell pflegen, oder die Sommer-Charges einfach im August nach der Pause nachtragen. Der Preisunterschied von 100 €/Jahr lohnt sich nicht.

## Mid-Season-Einstieg — was wenn ich erst im Oktober anfange?

**Vor dem 5. Spieltag** (meist Mitte September): Saison-Pass voll kaufbar. Du zahlst den gleichen Preis wie ein Verein, der am 1. August gestartet ist — kein Pro-Rated. Bewusste Wahl: simpel, fair, keine „Warte-bis-zum-letzten-Spieltag"-Spielchen.

**Ab dem 6. Spieltag**: Saison-Pass für die laufende Saison ist gesperrt. Du startest mit dem Monatsabo bis zum 30. Juni und buchst zum 1. Juli den Saison-Pass für die nächste Saison. → [Der 5-Spieltag-Cutoff](5-spieltag-cutoff.md).

## Wechseln zwischen Saison-Pass und Annual

Du kannst während der Laufzeit nicht zwischen den beiden wechseln — Stripe-Subscriptions sind pro Billing-Cycle. Du kannst aber **zum Renewal-Datum** umstellen:

- Saison-Pass → Annual: bis 30. Juni kündigen, dann zum 1. August Annual neu buchen.
- Annual → Saison-Pass: zum Annual-Ende kündigen, dann den nächsten Saison-Pass zum 1. August buchen (oder direkt während des Wechselfensters, wenn die Annual-Laufzeit zufällig am Saison-Anfang endet).

## Faustregel zum Mitnehmen

Wenn dein Verein einen klar definierten **Saisonkalender mit Sommerpause** hat: Saison-Pass. Das ist der Default und für die meisten Vereine die richtige Wahl. Annual ist die explizite Aussage „Wir spielen ganzjährig, der Sommer ist nicht still" — und nur dann lohnt es.

Weiter lesen:
- [Welcher Tarif passt zu deinem Verein?](welcher-tarif-passt.md)
- [Mid-Season-Einstieg — was empfohlen wird](mid-season-einstieg.md)
- [Kündigung und Sommerpause](kuendigung-und-pause.md)
