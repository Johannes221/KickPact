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
  - "freundschaftsspiele-zahlen-nicht"
last_updated: "2026-07-20"
status: "published"
---

Auto-Trigger sind die Trigger, die KickPact **vollautomatisch** aus Fußball.de-Daten ableitet. Kein Trainer muss klicken, keine Bestätigung nötig — passiert das Ereignis, feuert der Pact.

## Die 10 Auto-Trigger im Überblick

| Trigger | Was es bedeutet | Häufigkeit |
|---|---|---|
| Pro Tor | Tor der eigenen Mannschaft | ~2-3 / Spiel |
| Tor von Spieler | Tor eines bestimmten Spielers | individuell |
| Pro Sieg | Sieg (Endergebnis) | 1× / Spiel falls erreicht |
| Pro Heimsieg | Sieg im Heimspiel | 1× / Spiel falls erreicht |
| Pro Auswärtssieg | Sieg im Auswärtsspiel | 1× / Spiel falls erreicht |
| Pro Zu-Null-Sieg | Sieg ohne Gegentor | selten |
| Pro Hattrick | Drei Tore eines Spielers in einem Spiel | sehr selten |
| Pro Comeback | Rückstand gedreht und gewonnen | selten |
| Hoher Sieg | Tordifferenz erreicht oder überschritten | konfigurierbar |
| Viele Tore | Eigene Torzahl erreicht oder überschritten | konfigurierbar |

## Im Detail

### Pro Tor

Feuert pro Tor deiner Mannschaft, unabhängig vom Torschützen. Klassischer Pact: **5 € pro Tor**.

- Bei 3:1-Sieg: 3 Beiträge
- Bei 7:1-Festspiel: 7 Beiträge (denk an deinen Monats-Cap)

### Tor von Spieler

Feuert nur, wenn ein **bestimmter Spieler** trifft. Du wählst den Spieler beim Anlegen aus. Der Standard-Pact der Eltern für ihren Sohn / ihre Tochter.

- Bei 3:1, Sohn schießt 2 Tore: 2 Beiträge
- Bei 3:1, Sohn schießt 0 Tore: 0 Beiträge

### Pro Sieg

Feuert genau **einmal pro Spiel**, wenn die Mannschaft gewonnen hat (also Endstand > Gegner). Unabhängig von der Toranzahl. Beispiel-Pact: **20 € pro Sieg**.

### Pro Heimsieg und Pro Auswärtssieg

Wie **Pro Sieg**, aber nur für Heim- bzw. Auswärtsspiele. Beide feuern **zusätzlich** zu einem aktiven Pro-Sieg-Pact. Wer also je 5 € auf Sieg und auf Heimsieg gesetzt hat, zahlt bei einem Heimsieg 10 €. Praktisch, wenn dir Heimsiege mehr wert sind als Auswärtssiege (oder umgekehrt).

### Pro Zu-Null-Sieg

Mannschaft **gewinnt ohne Gegentor**. Ein 0:0-Remis zählt nicht — es muss ein Sieg sein. Belohnt die Defensive, typischer Pact für Torwart-Eltern. **15 € pro Zu-Null-Sieg** ist eine gängige Größenordnung.

### Pro Hattrick

Drei Tore eines Spielers im selben Spiel. Mit Spieler-Auswahl machen viele Eltern: "Wenn mein Sohn einen Hattrick schießt, 50 €". Ohne Filter: "50 € wenn irgendwer einen Hattrick macht" — selten genug, dass das Cap meist nicht greift.

**Hinweis:** Hattrick feuert **zusätzlich** zu einem Tor-von-Spieler-Pact. Sind beide aktiv und ein Spieler schießt 3 Tore: 3 × Tor von Spieler + 1 × Hattrick.

### Pro Comeback

Mannschaft lag zurück und hat trotzdem gewonnen. Selten, aber emotional aufgeladen. Beispiel-Pact: **30 € pro Comeback**.

### Hoher Sieg

Feuert, wenn die Tordifferenz (eigene Tore minus Gegnertore) eine **konfigurierbare Schwelle** erreicht.

- Konfig "Differenz >= 3" + 4:1-Sieg → feuert (Differenz 3)
- 3:1-Sieg → feuert nicht (Differenz 2)

Praktisch für Belohnungs-Pacts: "Wenn ihr klar gewinnt (≥3 Tore Differenz), 25 €".

### Viele Tore

Feuert, wenn die **eigene Torzahl** eine Schwelle erreicht oder überschreitet. Es zählen nur die eigenen Tore, nicht die des Gegners.

- Konfig "eigene Tore >= 4" + 4:3-Spiel → feuert (4 eigene Tore)
- 2:1-Spiel → feuert nicht (2 eigene Tore)

Klassischer "Torfestival-Pact": "Wenn ihr richtig abliefert, 15 €".

## Zahlen nur Liga und Pokal?

Ja. Beiträge entstehen **nur bei Liga- und Pokalspielen**. Freundschaftsspiele und Turniere lösen keine Auto-Trigger aus, auch wenn sie auf Fußball.de mit Ergebnis und Torschützen erfasst sind. Details in [Freundschaftsspiele zahlen nicht](freundschaftsspiele-zahlen-nicht.md).

## Was Auto-Trigger NICHT erkennen

- **Tor-Typ** (Kopfball, Elfmeter, Hackentor) — das meldet der Verein als [Manual-Trigger](manual-trigger-katalog.md)
- **Karten** — manchmal verfügbar, aber unzuverlässig, deshalb in Manual
- **Auswechslungen** — sind importiert, aber kein eigener Trigger (Spieler war auf Platz vs. nicht — keine Pact-Logik)

## Wie genau ist das?

- **Tore**: bei Standard-Ligen sehr zuverlässig (>98 %). Nachträgliche Korrekturen auf Fußball.de werden beim nächsten automatischen Abgleich übernommen — siehe [Fußball.de ändert Daten](fussballde-aendert-daten.md).
- **Sieg / Heimsieg / Auswärtssieg**: aus dem Endergebnis abgeleitet. Sehr zuverlässig.
- **Comeback**: aus Halbzeit-Ergebnis + Endergebnis berechnet. Bei spät gespielten Spielen ohne Halbzeit-Eintrag kann's haken — selten.

Weiter lesen:
- [Manual-Trigger-Katalog](manual-trigger-katalog.md)
- [Wie der Crawler funktioniert](wie-der-crawler-funktioniert.md)
- [Freundschaftsspiele zahlen nicht](freundschaftsspiele-zahlen-nicht.md)
