---
title: "Auto-Trigger-Katalog (alle 10 Trigger erklärt)"
slug: "auto-trigger-katalog"
category: "pledges-trigger"
category_label: "Pacts & Trigger"
prio: "MUSS"
audience: ["sponsor", "verein-admin", "trainer"]
related_articles:
  - "manual-trigger-katalog"
  - "wie-der-crawler-funktioniert"
  - "ersten-pledge-anlegen"
  - "custom-trigger-anlegen"
last_updated: "2026-05-25"
status: "published"
---

Auto-Trigger sind die Trigger, die KickPact **vollautomatisch** aus Fußball.de-Daten ableitet. Kein Trainer muss klicken, keine Bestätigung nötig — passiert das Ereignis, feuert der Pact.

## Die 10 Auto-Trigger im Überblick

| Trigger | Was es bedeutet | Häufigkeit |
|---|---|---|
| `goal_team` | Tor der eigenen Mannschaft | ~2-3 / Spiel |
| `goal_player` | Tor eines bestimmten Spielers | individuell |
| `win` | Sieg (Endergebnis) | 1× / Spiel falls erreicht |
| `draw` | Unentschieden | 1× / Spiel falls erreicht |
| `loss` | Niederlage | 1× / Spiel falls erreicht |
| `clean_sheet` | Zu-Null-Spiel der eigenen Mannschaft | selten |
| `hat_trick` | Drei Tore eines Spielers in einem Spiel | sehr selten |
| `comeback` | Rückstand aufgeholt + Sieg | selten |
| `goal_difference` | Tordifferenz erreicht oder überschritten | konfigurierbar |
| `total_goals` | Gesamttore (beide Teams) erreicht oder überschritten | konfigurierbar |

## Im Detail

### `goal_team` — Tor der eigenen Mannschaft

Feuert pro Tor deiner Mannschaft, unabhängig vom Torschützen. Klassischer Pact: **5 € pro Tor**.

- Bei 3:1-Sieg: 3 Beiträge
- Bei 7:1-Festspiel: 7 Beiträge (denk an deinen Monats-Cap)

### `goal_player` — Tor eines Spielers

Feuert nur, wenn ein **bestimmter Spieler** trifft. Pflicht-Filter: `player_id`. Der Standard-Pact der Eltern für ihren Sohn / ihre Tochter.

- Bei 3:1, Sohn schießt 2 Tore: 2 Beiträge
- Bei 3:1, Sohn schießt 0 Tore: 0 Beiträge

### `win` — Sieg

Feuert genau **einmal pro Spiel**, wenn die Mannschaft gewonnen hat (also Endstand > Gegner). Unabhängig von der Toranzahl. Beispiel-Pact: **20 € pro Sieg**.

### `draw` und `loss` — Unentschieden / Niederlage

Analog zu `win`. Manche Sponsoren stützen gezielt den Misserfolg ab: "10 € pro Niederlage" (= ich helfe euch trotzdem, wenn's mal schlecht läuft).

### `clean_sheet` — Zu Null

Mannschaft gewinnt oder spielt remis **ohne Gegentor**. Belohnt die Defensive. Typischer Pact für Torwart-Eltern. **15 € pro Clean Sheet** ist eine gängige Größenordnung.

### `hat_trick` — Hattrick

Drei Tore eines Spielers im selben Spiel. Mit Player-Filter machen viele Eltern: "Wenn mein Sohn einen Hattrick schießt, 50 €". Ohne Filter: "50 € wenn irgendwer einen Hattrick macht" — selten genug, dass das Cap meist nicht greift.

**Hinweis:** Hattrick triggert **zusätzlich** zu `goal_player`. Wenn beide aktiv sind und ein Spieler 3 Tore schießt: 3 × goal_player + 1 × hat_trick.

### `comeback` — Comeback-Sieg

Mannschaft lag mit mindestens 2 Toren zurück und hat trotzdem gewonnen. Selten, aber emotional aufgeladen. Beispiel-Pact: **30 € pro Comeback**.

### `goal_difference` — Tordifferenz

Feuert, wenn die Tordifferenz (eigene Tore minus Gegnertore) eine **konfigurierbare Schwelle** erreicht.

- Konfig "differenz >= 3" + 4:1-Sieg → feuert (Differenz 3)
- 3:1-Sieg → feuert nicht (Differenz 2)

Praktisch für Belohnungs-Pacts: "Wenn ihr klar gewinnt (≥3 Tore Differenz), 25 €".

### `total_goals` — Gesamttore

Feuert, wenn die **Summe aller Tore im Spiel** (beide Mannschaften) eine Schwelle überschreitet.

- Konfig "total >= 6" + 4:3-Spiel → feuert (7 Tore)
- 2:1-Spiel → feuert nicht (3 Tore)

Klassischer "Spektakel-Pact": "Wenn das Spiel torreich ist, 15 €".

## Was Auto-Trigger NICHT erkennen

- **Tor-Typ** (Kopfball, Volley, Hackentor) — das ist [Manual-Trigger](manual-trigger-katalog.md)
- **Assists** — werden auf Fußball.de selten gepflegt
- **Karten** — manchmal verfügbar, aber unzuverlässig, deshalb in Manual
- **Auswechslungen** — sind importiert, aber kein eigener Trigger (Spieler war auf Platz vs. nicht — keine Pact-Logik)

## Wie genau ist das?

- **Tore**: bei Standard-Ligen sehr zuverlässig (>98 %). Nachträgliche Korrekturen auf Fußball.de werden beim nächsten automatischen Abgleich übernommen — siehe [Fußball.de ändert Daten](fussballde-aendert-daten.md).
- **Sieg / Unentschieden / Niederlage**: aus dem Endergebnis abgeleitet. Sehr zuverlässig.
- **Comeback**: aus Halbzeit-Ergebnis + Endergebnis berechnet. Bei spät gespielten Spielen ohne Halbzeit-Eintrag kann's haken — selten.

Weiter lesen:
- [Manual-Trigger-Katalog](manual-trigger-katalog.md)
- [Wie der Crawler funktioniert](wie-der-crawler-funktioniert.md)
- [Custom-Trigger anlegen](custom-trigger-anlegen.md)
