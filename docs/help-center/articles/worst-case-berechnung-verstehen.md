---
title: "Worst-Case-Berechnung verstehen"
slug: "worst-case-berechnung-verstehen"
category: "pledges-trigger"
category_label: "Pacts & Trigger"
prio: "MUSS"
audience: ["sponsor"]
related_articles:
  - "caps-und-monats-limits"
  - "ersten-pledge-anlegen"
  - "was-ist-ein-pledge"
last_updated: "2026-07-20"
status: "published"
---

Bevor du einen Pact aktivierst, zeigt KickPact dir den **Worst-Case** — also was du **maximal zahlen** würdest, wenn alles auf Höchstniveau läuft. Das ist kein Pessimismus, sondern Risikomanagement. So liest du die Zahlen.

## Drei Worst-Case-Zahlen

Du siehst im Wizard und im Sponsor-Dashboard immer drei Zahlen:

1. **Pro-Match-Worst-Case** — max. Kosten in einem einzelnen Spiel.
2. **Monats-Worst-Case** — max. Kosten in einem typischen Monat (3-5 Spiele).
3. **Saison-Worst-Case** — max. Kosten über die ganze Saison.

Jede Zahl berücksichtigt deine gesetzten Caps — der Worst-Case kann **nie** das Cap überschreiten.

## Wie KickPact rechnet

### Pro-Match-Worst-Case

Wir nehmen an, **alle Trigger feuern auf Maximum**:

- "Pro Tor" mit 5 € → 10 Tore (sehr hoch angesetzt) × 5 € = 50 €
- "Pro Sieg" mit 20 € → 1 × 20 € = 20 €
- "Pro Hattrick" mit 25 € → 1 × 25 € = 25 €
- Summe: **95 €** Worst-Case-Match. Es gibt keinen Cap pro Spiel — begrenzt wird ausschließlich über den Monats-Cap.

### Monats-Worst-Case

- Wir nehmen 4 Spiele/Monat (Standard-Punktspiel-Frequenz im Amateurfußball)
- Jedes Spiel = Pro-Match-Worst-Case
- Summe vs. Monats-Cap, das niedrigere gewinnt

Beispiel: 4 × 95 € = 380 € → Monats-Cap 100 € → **100 €** Worst-Case-Monat

### Saison-Worst-Case

- 10 aktive Monate (typische Punktspielsaison)
- 10 × Monats-Worst-Case → vs. Saison-Cap

Beispiel: 10 × 100 € = 1000 € → Saison-Cap 600 € → **600 €** Worst-Case-Saison

## Annahmen, die der Worst-Case macht

Wir sind **bewusst pessimistisch**:

- 4 Spiele/Monat (real oft 3, im Sommer manchmal 2)
- Alle Auto-Trigger feuern (z.B. immer Comeback + Zu-Null-Sieg + Sieg)
- Bei Spieler-Pacts: Spieler trifft so oft wie der gesamte Mannschafts-Schnitt
- Manuelle Trigger werden alle gemeldet **und** vom Sponsor approved
- Der Monats-Cap wird voll ausgereizt

Real liegt der **Erwartungswert bei 30-60 %** des Worst-Case. Wenn dein Worst-Case z.B. 100 €/Monat ist, zahlst du im Schnitt ca. 35-60 €.

## Beispielrechnung Schritt für Schritt

Pact "Tim's Eltern":

- Regel 1: "Tor von Spieler" (Tim), 10 €
- Regel 2: Spezial-Tor Kopfball, 5 € (Manual, gilt mit Approval)
- Regel 3: Rote Karte, 20 € (Manual, gilt mit Approval)
- Monats-Cap: 80 €

**Pro-Match-Worst-Case:**
- Tim schießt 5 Tore: 5 × 10 € = 50 €
- 2 Kopfball-Tore: 2 × 5 € = 10 €
- 1 Rote Karte: 20 €
- Summe: **80 € pro Spiel** (es gibt keinen Cap pro Spiel)

**Monats-Worst-Case:**
- 4 × 80 € = 320 € → Monats-Cap 80 €
- Resultat: **80 € pro Monat max.**

**Saison-Worst-Case:**
- 10 × 80 € = 800 € (kein Saison-Cap)
- Resultat: **800 € pro Saison max.**

KickPact zeigt also: "Worst-Case-Saison: 800 €. Erwarteter Bereich: 240-480 €."

## Erwarteter Bereich (vs. Worst-Case)

Der Worst-Case ist die obere Spitze. KickPact zeigt zusätzlich einen **realistischen Bereich** — das ist eine Spanne aus historischen Daten ähnlicher Pacts. Format: "Spanne: 240-480 €". Liegt zwischen 30 % und 60 % des Worst-Case.

Diese Spanne basiert auf:

- Durchschnittliche Toranzahl der Liga
- Sieg-/Niederlage-Quote
- Anteil Manual-Approvals, die typisch durchgehen
- Realer Spielerbeitrag (für Spieler-Pacts aus Vorjahres-Daten)

Bei brandneuen Vereinen ohne Historie nutzen wir Default-Werte aus vergleichbaren Ligen.

## Was nicht im Worst-Case steckt

- **Saison-Ziel-Beträge** (Aufstieg, Klassenerhalt, etc.) werden **getrennt** angezeigt, weil sie einmalig sind, nicht monatlich.
- **Custom-Trigger** mit "1 € pro Trainer-Frisur-Lob" werden mit angenommener Häufigkeit reingerechnet (1×/Saison wenn nicht anders gesetzt).
- **Ausreißer** wie 10 Tore in einem Spiel — der Worst-Case nimmt 10 Tore an, real kommt das alle paar Jahre vor. Cap deckt das ab.

## Wann das Worst-Case zu hoch ist

Wenn KickPact dir 250 €/Monat Worst-Case zeigt und du nur 80 €/Monat Budget hast: **Caps setzen**. Geh zurück in den Wizard, setze Monats-Cap auf 80 €. Worst-Case wird automatisch neu berechnet.

Weiter lesen:
- [Caps und Monats-Limits](caps-und-monats-limits.md)
- [Ersten Pact anlegen](ersten-pledge-anlegen.md)
- [Was ist ein Pact?](was-ist-ein-pledge.md)
