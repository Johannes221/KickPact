---
title: "Caps und Monats-Limits"
slug: "caps-und-monats-limits"
category: "pledges-trigger"
category_label: "Pacts & Trigger"
prio: "MUSS"
audience: ["sponsor"]
related_articles:
  - "ersten-pledge-anlegen"
  - "worst-case-berechnung-verstehen"
  - "was-ist-ein-pledge"
  - "auto-trigger-katalog"
last_updated: "2026-05-25"
status: "published"
---

Caps sind dein Sicherheitsnetz. Ein Pact ohne Cap ist offen — bei einem 7:1-Festspiel oder einer wahnsinnigen Glückssträhne kann das **plötzlich teuer** werden. Caps verhindern das. Du legst fest, **wie viel du maximal monatlich oder saisonal ausgeben willst**, und KickPact stoppt automatisch, sobald das Limit erreicht ist.

## Die drei Cap-Ebenen

| Cap | Wirkt auf | Beispiel |
|---|---|---|
| **Per-Match-Cap** | Einzelnes Spiel | "max. 20 €/Spiel" |
| **Monats-Cap** | Kalendermonat | "max. 100 €/Monat" |
| **Saison-Cap** | Aktuelle Saison | "max. 800 €/Saison" |

Caps **kumulieren** — das heißt, alle drei können gleichzeitig aktiv sein, und es greift jeweils das schärfste Limit zuerst.

## Per-Match-Cap

Ein Per-Match-Cap schützt vor **Ausreißer-Spielen**. Klassisches Beispiel:

- Dein Pact: 5 € pro Tor.
- Deine Mannschaft schießt unerwartet 8 Tore beim Auswärtssieg.
- Ohne Cap: 8 × 5 € = 40 € allein für dieses Spiel.
- Mit Cap "max. 20 €/Spiel": 20 € — die letzten 4 Tore werden geblockt.

Geblockte Tore sind sichtbar in deinem Dashboard ("4 Tore vom Per-Match-Cap geblockt"), erzeugen aber **keinen Beitrag**.

**Faustregel:** Per-Match-Cap auf ~2-3× das "Normal-Spiel"-Niveau setzen. Bei 5 €/Tor und durchschnittlich 2 Toren = Per-Match-Cap 15-25 €.

## Monats-Cap

Schützt deinen Monats-Geldbeutel. Praktisches Beispiel:

- Dein Pact: 5 € pro Tor + 20 € pro Sieg.
- Im normalen Monat: 4 Spiele × ~2 Tore + 2 Siege = 4×10 + 40 = 80 €.
- Im **Top-Monat**: 4 Spiele × 4 Tore + 4 Siege = 4×20 + 80 = 160 €.
- Mit Monats-Cap "100 €/Monat": Sobald 100 € an Beiträgen erreicht sind, werden alle weiteren Trigger geblockt.

Das ist der **wichtigste Cap** und der, den fast alle Sponsoren setzen.

## Saison-Cap

Schützt vor langfristigem Drift. Praktisch wenn du eine **harte Obergrenze fürs Jahr** hast:

- "Ich will maximal 600 € pro Saison ausgeben."
- Bei 10 aktiven Monaten ≈ 60 €/Monat Durchschnitt.
- Sobald 600 € erreicht sind: alle weiteren Trigger geblockt, **bis zum Saison-Neustart**.

## Wie KickPact die Caps anwendet

Trigger feuern in folgender Reihenfolge:

1. **Match-Event aus den Spieldaten** (z.B. 5. Tor im 7:1-Spiel)
2. **Regel matched** (5 € pro Tor)
3. **Per-Match-Cap geprüft:** schon ≥20 € in diesem Spiel? → Beitrag geblockt.
4. **Monats-Cap geprüft:** mit diesem Beitrag ≥100 €? → Beitrag geblockt.
5. **Saison-Cap geprüft:** mit diesem Beitrag ≥600 €? → Beitrag geblockt.
6. Wenn alle Checks pass: **Beitrag erzeugt**.

Wichtig: Caps werden **monoton** geprüft. Sobald ein Cap erreicht ist, gibt's keinen Beitrag mehr für den restlichen Cap-Zeitraum. Es wird **nicht** anteilig oder fair zwischen Triggern verteilt — first come, first served.

## Was im Sponsor-Dashboard sichtbar ist

- **Diese Woche:** Beiträge + geblockte Trigger
- **Dieser Monat:** Erreicht vs. Cap als Balken (z.B. "78 € / 100 € — 78 %")
- **Saison:** Erreicht vs. Cap als Balken
- **Worst-Case-Hochrechnung:** Wenn die Mannschaft maximal performt, was passiert dann mit deinem Cap

## Pact-Beispiel mit allen drei Caps

Pact "Familien-Pact für FC Musterstadt Herren":

- **Regel 1:** 5 € pro Tor, kein Filter
- **Regel 2:** 10 € pro Sieg
- **Regel 3:** 25 € pro Hattrick (jeder Spieler)
- **Per-Match-Cap:** 30 €
- **Monats-Cap:** 100 €
- **Saison-Cap:** 600 €

In einem realistischen Monat mit 4 Spielen, 2 Siegen, 1 Unentschieden, 1 Niederlage, durchschn. 2,5 Tore pro Spiel:
- Tore: 4 × 2,5 × 5 € = 50 €
- Siege: 2 × 10 € = 20 €
- Hattricks: 0 (selten) = 0 €
- **Summe: ~70 €** — Cap nicht erreicht, alle Trigger gefeuert.

Im **Worst-Case-Monat** (alles auf Maximum, jedes Spiel mit 5 Toren, alle Siege):
- Tore: 4 × 5 × 5 € = 100 € → aber Per-Match-Cap 30 € pro Spiel = 4 × 30 € = 120 €
- Siege: 4 × 10 € = 40 €
- Aber Monats-Cap 100 €: Beitrags-Stopp nach dem ~14. erfolgreichen Trigger.
- **Resultat:** Genau 100 €. Wie geplant.

## Caps ändern — wann gilt was?

- Cap **erhöht**: gilt sofort, alte geblockte Trigger werden **nicht** rückwirkend aktiviert.
- Cap **gesenkt**: gilt sofort. Bereits erzeugte Beiträge bleiben — du zahlst, was schon angefallen ist.
- Cap **entfernt**: gilt sofort, kein neuer Trigger wird geblockt.

Weiter lesen:
- [Worst-Case-Berechnung verstehen](worst-case-berechnung-verstehen.md)
- [Ersten Pact anlegen](ersten-pledge-anlegen.md)
- [Was ist ein Pact?](was-ist-ein-pledge.md)
