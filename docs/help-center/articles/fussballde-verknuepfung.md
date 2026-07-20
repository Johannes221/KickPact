---
title: "Mannschaft mit Fußball.de verknüpfen"
slug: "fussballde-verknuepfung"
category: "erste-schritte-verein"
category_label: "Erste Schritte — Verein"
prio: "MUSS"
audience: ["verein-admin", "trainer"]
related_articles:
  - "erste-schritte-verein"
  - "wie-der-crawler-funktioniert"
  - "mannschaft-hinzufuegen"
  - "match-fehlt-was-tun"
last_updated: "2026-07-20"
status: "published"
---

KickPact lebt von Fußball.de-Daten. Tore, Karten, Ergebnisse — alles kommt von dort. Damit der Crawler weiß, **welche Mannschaft** er für dich tracken soll, muss sie einmalig verknüpft werden. Das passiert im Verein-Wizard, Schritt 2.

## So findet der Wizard deine Mannschaft

1. Du gibst den **Vereinsnamen** ein, z.B. "FC Musterstadt".
2. Wir fragen die Fußball.de-Suche an und zeigen dir Treffer-Vorschläge.
3. Du wählst den richtigen Verein aus.
4. Wir laden alle aktiven Mannschaften und zeigen sie als Liste.
5. Du klickst auf die Mannschaft, die mitspielen soll — fertig.

Der Wizard speichert dabei die `fussballde_verein_id` und die `fussballde_team_id`. Ab da läuft der Crawler **täglich, am Spieltag-Wochenende mehrfach**, und holt Spiele plus Match-Events automatisch ein.

## Was du sehen solltest

Nach der Verknüpfung steht in der Mannschafts-Übersicht oben rechts ein grüner Punkt mit dem Hinweis "Verknüpft mit Fußball.de". Bewegst du die Maus drüber, siehst du die Team-ID und den letzten Crawl-Zeitstempel.

## Wenn der Verein nicht auftaucht

Mehrere Gründe sind denkbar:

- **Der Verein hat noch keine aktive Mannschaft im laufenden Spielbetrieb.** Häufig bei brandneuen Vereinen oder reinen Hobby-Truppen. → Workaround: Mannschaft manuell anlegen, Spiele dann ebenfalls manuell eintragen.
- **Verband ist nicht auf Fußball.de** — etwa B-Ligen mancher Hobby-Verbände. → Auch hier: Manueller Modus.
- **Tippfehler in deiner Suche.** Probier Abkürzungen ("TSV" statt "Turn- und Sportverein") oder den Ort als Zusatz ("FC Musterstadt 1923").

Bleibt der Verein unauffindbar, hilft nur der manuelle Modus: Mannschaft anlegen und Spiele selbst eintragen.

## Wenn die falsche Mannschaft verknüpft ist

Passiert eher selten, aber kommt vor — etwa wenn ein Verein zwei Mannschaften mit identischem Namen ("Herren") und ähnlicher Liga hat. So korrigierst du es:

1. Gehe auf **Verein → Einstellungen → Mannschaften**.
2. Klicke bei der falschen Mannschaft auf das Drei-Punkte-Menü → "Fußball.de neu verknüpfen".
3. Die Suche startet erneut, du wählst die korrekte Mannschaft.

**Wichtig:** Beim Wechsel bleiben alle bereits importierten Spiele erhalten. Neu importierte Spiele werden aber unter der neuen Team-ID gespeichert. Vermische die Mannschaften nicht — wenn unklar, lieber eine zweite Mannschaft anlegen.

## Was der Crawler nicht holt

Fußball.de gibt uns viel — aber nicht alles. Wir können automatisch:

- Tore mit Schütze
- Karten (Gelb, Gelb-Rot, Rot)
- Auswechslungen
- Endergebnis + Halbzeitergebnis

Wir kriegen **nicht**:

- Welcher Tor-Typ (Kopfball, Volley, Hackentor) → das ist [Manual Event](manual-trigger-katalog.md)
- Assists (sehr selten auf Fußball.de gepflegt)
- Spieler des Spiels, Eckbälle, Ballbesitz

Trigger, die diese Daten brauchen, sind **Manual-only** — Trainer pflegt sie nach Spielende selbst nach.

## Saisonwechsel

Im Sommer wechseln Mannschaften oft Liga oder Spielklasse. Die `fussballde_team_id` ändert sich dabei **pro Saison** — der Wizard erkennt das beim ersten Crawl-Versuch der neuen Saison und fragt dich automatisch, ob du die neue ID übernehmen willst. Ein-Klick-Aktion, keine Daten gehen verloren.

Weiter lesen:
- [Wie der Crawler funktioniert](wie-der-crawler-funktioniert.md)
- [Match fehlt — was tun?](match-fehlt-was-tun.md)
- [Mannschaft hinzufügen](mannschaft-hinzufuegen.md)
