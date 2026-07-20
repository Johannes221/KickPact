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
  - "kuendigung-und-pause"
last_updated: "2026-07-20"
status: "published"
---

KickPact hat zwei Abrechnungs-Wege: **Monatlich** (maximal flexibel) und den **Saison-Pass** (rund 67 % günstiger als 12 Monatsraten). Der Unterschied ist **Flexibilität gegen Ersparnis**.

## Die kurze Antwort

- **Du willst erst mal reinschnuppern oder steigst mitten in der Saison ein?** → **Monatlich**. Jederzeit zum Monatsende kündbar, kein Commitment.
- **Du weißt, dass ihr die Saison durchspielt?** → **Saison-Pass**. Rund 67 % gespart, Juni/Juli kostenlos pausiert. Das ist die Default-Empfehlung im Wizard.

## Die Zahlen im direkten Vergleich

| Tarif | Monatlich (12 Monate) | Saison-Pass | Du sparst |
|---|---|---|---|
| Basic | 59,88 € (4,99 €/Mon) | **19,99 €** (≈2 €/Mon) | 39,89 € (≈67 %) |
| Pro | 107,88 € (8,99 €/Mon) | **34,99 €** (≈3,50 €/Mon) | 72,89 € (≈68 %) |
| Vereinslizenz | 239,88 € (19,99 €/Mon) | **79,99 €** (≈8 €/Mon) | 159,89 € (≈67 %) |

Der Saison-Pass kostet effektiv rund 4 Monatsraten für 10 aktive Monate — plus die Sommerpause Juni/Juli, in der ohnehin nichts läuft, geschenkt. Selbst wenn du beim Monatsabo im Sommer selbst kündigst und nur 10 Monate zahlst, bleibt der Saison-Pass klar günstiger.

## Wie funktioniert der Saison-Pass mechanisch?

- **Saison-Definition:** 1. August bis 31. Mai. Wir folgen dem DFB-Spieljahr.
- **Sommerpause:** 1. Juni bis 31. Juli **automatisch pausiert**. Kein Geld wird abgebucht. Der Crawler stoppt. Deine Daten, alle PDFs und Sponsor-Übersichten bleiben sichtbar.
- **Renewal:** Zum Saison-Start (1. August) zieht Stripe den Saison-Pass für die neue Saison ein. Wenn du **bis zum 1. Juli** kündigst, läuft nichts ein — sonst verlängert sich der Pass automatisch um eine weitere Saison.
- **Winterpause** (Mitte Dezember bis Anfang Februar): **Keine** Subscription-Pause. Du zahlst weiter, weil deine Mannschaft den Rest der Saison aktiv spielt — der Crawler findet vier bis sechs Wochen einfach nichts Neues. Das ist gewollt: Tabellen und Stats bleiben sichtbar.

## Wie funktioniert das Monatsabo?

- Du zahlst den vollen Monatspreis (4,99 / 8,99 / 19,99 €), jeden Monat.
- Jederzeit zum Monatsende kündbar — null Bindung.
- Keine automatische Sommerpause: Du entscheidest selbst, ob du im Sommer pausierst (kündigen) oder durchlaufen lässt.

## Konkrete Entscheidungs-Beispiele

**Beispiel 1 — TSV Beispieldorf, Herren I, Kreisliga A**
Startet am 1. August, spielt die volle Saison. → **Saison-Pass**. Rund 67 % gespart, Sommerpause kostenlos.

**Beispiel 2 — Neuer Trainer, will erst mal testen**
Noch unsicher, ob das Sponsoring-Thema zündet. → **Monatlich** starten. Wenn es läuft, zum nächsten 1. August auf den Saison-Pass wechseln und sparen.

**Beispiel 3 — Einstieg im Februar (Rückrunde)**
Mid-Season-Start nach dem 5. Spieltag. → **Monatlich** weiterlaufen lassen, dann zum 1. Juli den Saison-Pass für die nächste Saison buchen.

## Mid-Season-Einstieg — was wenn ich erst im Oktober anfange?

**Vor dem 5. Spieltag** (meist Mitte September): Saison-Pass voll kaufbar. Du zahlst den gleichen Preis wie ein Verein, der am 1. August gestartet ist — kein Pro-Rated. Bewusste Wahl: simpel, fair, keine „Warte-bis-zum-letzten-Spieltag"-Spielchen.

**Ab dem 6. Spieltag**: Saison-Pass für die laufende Saison ist gesperrt. Du startest mit dem Monatsabo und buchst zum 1. Juli den Saison-Pass für die nächste Saison. → [Der 5-Spieltag-Cutoff](5-spieltag-cutoff.md).

## Wechseln zwischen Monatlich und Saison-Pass

Während der Laufzeit kannst du nicht direkt umstellen — Stripe-Subscriptions sind pro Billing-Cycle. Du kannst aber **zum Renewal-/Saison-Wechsel** umstellen:

- Monatlich → Saison-Pass: Vor dem 5. Spieltag der neuen Saison im Abo-Bereich den Saison-Pass wählen.
- Saison-Pass → Monatlich: bis 1. Juli kündigen, dann ab August monatlich weiterlaufen lassen.

## Faustregel zum Mitnehmen

Sicher, dass ihr die Saison durchspielt? **Saison-Pass** — das ist der Default und spart rund 67 %. Noch am Ausprobieren oder mitten in der Saison eingestiegen? **Monatlich** — null Bindung, jederzeit kündbar, und der Wechsel auf den Saison-Pass steht dir zum nächsten August offen.

Weiter lesen:
- [Welcher Tarif passt zu deinem Verein?](welcher-tarif-passt.md)
- [Der 5-Spieltag-Cutoff](5-spieltag-cutoff.md)
- [Kündigung und Sommerpause](kuendigung-und-pause.md)
