---
title: "Match fehlt — was tun?"
slug: "match-fehlt-was-tun"
category: "crawler-fussballde"
category_label: "Crawler & Fußball.de"
prio: "MUSS"
audience: ["verein-admin", "trainer"]
related_articles:
  - "wie-der-crawler-funktioniert"
  - "fussballde-verknuepfung"
  - "fussballde-aendert-daten"
last_updated: "2026-05-25"
status: "published"
---

Du erwartest ein Spiel im KickPact-Spielplan, es taucht aber nicht auf. Bevor du panisch wirst — meistens ist die Lösung trivial.

## Erste Checks

### Check 1 — Steht das Spiel überhaupt auf Fußball.de?

Geh direkt auf fussball.de, such deine Mannschaft, sieh den Spielplan an. Wenn das Spiel **dort nicht steht**, kann der Crawler es auch nicht holen. Häufige Gründe:

- **Freundschaftsspiel** — wird oft nicht auf Fußball.de geführt.
- **Hallenturnier** — meist gar nicht abgebildet.
- **Nachholtermin** noch nicht eingetragen.
- **Spielklassen-Verschiebung** — Liga-Wechsel mitten in der Saison, alte Spielklasse leer.

→ **Lösung**: [Manuell anlegen](#spiel-manuell-anlegen).

### Check 2 — Steht das Spiel auf Fußball.de, aber bei einer anderen Mannschaft des Vereins?

Manche Vereine haben mehrere Herren-Mannschaften (Herren I + II + III). KickPact holt nur Spiele der **verknüpften Mannschaft**. Wenn ein Spiel falsch verbucht ist auf Fußball.de, oder du die falsche Mannschaft verknüpft hast:

→ **Lösung**: Verknüpfung prüfen über **Mannschaft → Einstellungen → Daten-Quelle**. Korrigieren wenn nötig, siehe [Fußball.de-Verknüpfung](fussballde-verknuepfung.md).

### Check 3 — Wann war der letzte Crawl?

**Mannschaft → Einstellungen → Daten-Quelle** zeigt den letzten Crawl-Zeitstempel. Der Crawler läuft täglich, am Spieltag-Wochenende mehrfach.

- Möglich: Rate-Limited oder vorübergehender Fehler. Beim nächsten Lauf löst sich's.
- Wenn der Zeitstempel 48+ Stunden alt ist: an support@kickpact.de melden.

### Check 4 — Ist das Spielergebnis schon eingetragen?

Manchmal steht das Spiel im Spielplan, hat aber **kein Endergebnis** (Spiel noch nicht gespielt oder Verband-Sekretär hat's noch nicht eingetragen). KickPact zeigt das als "Spiel im Spielplan, kein Ergebnis" — kein Fehler, sondern Wartezustand.

## Spiel manuell anlegen

Wenn Check 1 fehlschlägt (Spiel ist auch nicht auf Fußball.de), kannst du es manuell eintragen.

### So gehts

1. **Verein → Mannschaft → Spiele → "+ Manuelles Spiel anlegen"**.
2. Felder ausfüllen:
   - **Datum + Uhrzeit**
   - **Heim / Auswärts**
   - **Gegner-Name** (Freitext, da nicht aus Fußball.de)
   - **Endergebnis** (Tore eigene / Tore Gegner)
   - **Halbzeit-Ergebnis** (optional, aber für Comeback-Trigger wichtig)
   - **Torschützen** mit Spieler-Zuordnung — wählst aus deinem Kader
3. Klick **"Speichern"**.

Das Spiel hat dann eine interne ID `manual-XYZ` (statt einer Fußball.de-Match-ID). Alle Auto-Trigger feuern normal.

### Idempotenz

KickPact prüft beim Anlegen, ob es schon ein Spiel mit gleichem Datum / Heim / Gegner gibt. Wenn ja, warnt es vor Duplizierung. Falls Fußball.de das Spiel später nachträglich einträgt, würde der Crawler es importieren — du hast dann zwei Einträge. **Empfehlung**: Wenn Fußball.de nachzieht, das manuelle Spiel löschen, das gecrawlte behalten (Audit-Trail ist sauberer).

### Manuelles Spiel löschen oder editieren

Bis zum **1. des Folgemonats** kannst du:
- Spiel komplett löschen (alle Beiträge werden storniert).
- Einzelne Torschützen ändern (Beiträge werden angepasst).
- Endergebnis ändern (alle abgeleiteten Trigger werden re-evaluiert).

Nach dem 1.: nur noch Stornos in der Abrechnung des Folgemonats möglich.

## Manuelle Events zu einem gecrawlten Spiel hinzufügen

Häufiger Use-Case: Spiel ist gecrawlt (Auto-Trigger funktionierten), du willst aber Manual-Events hinzufügen (Kopfball-Tor, Assist):

1. **Verein → Mannschaft → Spiele → das Spiel öffnen**.
2. Tab **"Manuelle Events"**.
3. **"+ Manual-Event hinzufügen"** → Trigger-Typ wählen, Spieler, Minute (optional).

Diese Events erscheinen bei den Sponsoren als Pending zur Bestätigung — siehe [Pending Events bestätigen](pending-events-bestaetigen.md).

## Wenn der Crawler chronisch ein bestimmtes Spiel verpasst

Beispiel: Ihr habt jede Woche Mittwoch ein Verbandsligaspiel, das Fußball.de erst spät nachzieht. KickPact-Tipp:
- **Wartet bis zum nächsten Morgen** — der tägliche Lauf holt das in der Regel.
- Wenn auch am Tag danach nichts da ist: manuell anlegen.

Es gibt **keinen "Jetzt abrufen"-Button** — die Läufe sind fest geplant (täglich + Spieltag-Wochenende). Manuell angestoßene Abrufe führen wir in einer späteren Version evtl. ein.

Weiter lesen:
- [Wie der Crawler funktioniert](wie-der-crawler-funktioniert.md)
- [Fußball.de-Verknüpfung](fussballde-verknuepfung.md)
- [Fußball.de ändert Daten](fussballde-aendert-daten.md)
