---
title: "Saison-Pass vs Monatlich — was lohnt wann?"
slug: "saison-pass-vs-monatlich"
category: "tarife-pricing"
category_label: "Tarife & Pricing"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "welcher-tarif-passt"
  - "5-spieltag-cutoff"
  - "mid-season-einstieg"
  - "kuendigung-und-pause"
last_updated: "2026-06-02"
status: "published"
---

KickPact hat zwei Abrechnungs-Wege: **Monatlich** (maximal flexibel) und den **Saison-Pass** (~2 Monate geschenkt). Beide kosten dich übers Jahr fast dasselbe pro aktivem Monat — der Unterschied ist **Flexibilität gegen Ersparnis**.

## Die kurze Antwort

- **Du willst erst mal reinschnuppern oder steigst mitten in der Saison ein?** → **Monatlich**. Jederzeit zum Monatsende kündbar, kein Commitment.
- **Du weißt, dass ihr die Saison durchspielt?** → **Saison-Pass**. ~2 Monate gespart, Juni/Juli kostenlos pausiert. Das ist die Default-Empfehlung im Wizard.

## Die Zahlen im direkten Vergleich

| Tarif | Monatlich (10 Mon. Saison) | Saison-Pass | Du sparst |
|---|---|---|---|
| Basic | 50 € (5 €/Mon) | **39 €** (3,90 €/Mon) | ~11 € (~22 %) |
| Pro | 190 € (19 €/Mon) | **149 €** (14,90 €/Mon) | ~41 € (~22 %) |
| Vereinslizenz | 490 € (49 €/Mon) | **389 €** (38,90 €/Mon) | ~101 € (~21 %) |

Der Saison-Pass ist effektiv „zahl 8, bekomm 10 aktive Monate" — plus die Sommerpause Juni/Juli, in der ohnehin nichts läuft, geschenkt.

## Wie funktioniert der Saison-Pass mechanisch?

- **Saison-Definition:** 1. August bis 31. Mai. Wir folgen dem DFB-Spieljahr.
- **Sommerpause:** 1. Juni bis 31. Juli **automatisch pausiert**. Kein Geld wird abgebucht. Der Crawler stoppt. Deine Daten, alle PDFs und Sponsor-Übersichten bleiben sichtbar.
- **Renewal:** Am 1. August zieht Stripe den Saison-Pass für die neue Saison ein. Wenn du **bis zum 30. Juni** kündigst, läuft nichts ein.
- **Winterpause** (Mitte Dezember bis Anfang Februar): **Keine** Subscription-Pause. Du zahlst weiter, weil deine Mannschaft den Rest der Saison aktiv spielt — der Crawler findet vier bis sechs Wochen einfach nichts Neues. Das ist gewollt: Tabellen und Stats bleiben sichtbar.

## Wie funktioniert das Monatsabo?

- Du zahlst den vollen Monatspreis (5 / 19 / 49 €), jeden Monat.
- Jederzeit zum Monatsende kündbar — null Bindung.
- Keine automatische Sommerpause: Du entscheidest selbst, ob du im Sommer pausierst (kündigen) oder durchlaufen lässt.

## Konkrete Entscheidungs-Beispiele

**Beispiel 1 — TSV Beispieldorf, Herren I, Kreisliga A**
Startet am 1. August, spielt die volle Saison. → **Saison-Pass**. ~2 Monate geschenkt, Sommerpause kostenlos.

**Beispiel 2 — Neuer Trainer, will erst mal testen**
Noch unsicher, ob das Sponsoring-Thema zündet. → **Monatlich** starten. Wenn es läuft, zum nächsten 1. August auf den Saison-Pass wechseln und sparen.

**Beispiel 3 — Einstieg im Februar (Rückrunde)**
Mid-Season-Start nach dem 5. Spieltag. → **Monatlich** bis zum 30. Juni, dann zum 1. Juli den Saison-Pass für die nächste Saison buchen.

## Mid-Season-Einstieg — was wenn ich erst im Oktober anfange?

**Vor dem 5. Spieltag** (meist Mitte September): Saison-Pass voll kaufbar. Du zahlst den gleichen Preis wie ein Verein, der am 1. August gestartet ist — kein Pro-Rated. Bewusste Wahl: simpel, fair, keine „Warte-bis-zum-letzten-Spieltag"-Spielchen.

**Ab dem 6. Spieltag**: Saison-Pass für die laufende Saison ist gesperrt. Du startest mit dem Monatsabo bis zum 30. Juni und buchst zum 1. Juli den Saison-Pass für die nächste Saison. → [Der 5-Spieltag-Cutoff](5-spieltag-cutoff.md).

## Wechseln zwischen Monatlich und Saison-Pass

Während der Laufzeit kannst du nicht direkt umstellen — Stripe-Subscriptions sind pro Billing-Cycle. Du kannst aber **zum Renewal-/Saison-Wechsel** umstellen:

- Monatlich → Saison-Pass: Vor dem 5. Spieltag der neuen Saison im Abo-Bereich den Saison-Pass wählen.
- Saison-Pass → Monatlich: bis 30. Juni kündigen, dann ab August monatlich weiterlaufen lassen.

## Faustregel zum Mitnehmen

Sicher, dass ihr die Saison durchspielt? **Saison-Pass** — das ist der Default und spart ~2 Monate. Noch am Ausprobieren oder mitten in der Saison eingestiegen? **Monatlich** — null Bindung, jederzeit kündbar, und der Wechsel auf den Saison-Pass steht dir zum nächsten August offen.

Weiter lesen:
- [Welcher Tarif passt zu deinem Verein?](welcher-tarif-passt.md)
- [Mid-Season-Einstieg — was empfohlen wird](mid-season-einstieg.md)
- [Kündigung und Sommerpause](kuendigung-und-pause.md)
