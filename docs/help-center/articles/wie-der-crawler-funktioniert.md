---
title: "Wie der Crawler funktioniert"
slug: "wie-der-crawler-funktioniert"
category: "crawler-fussballde"
category_label: "Crawler & Fußball.de"
prio: "MUSS"
audience: ["verein-admin", "sponsor", "trainer"]
related_articles:
  - "fussballde-verknuepfung"
  - "auto-trigger-katalog"
  - "match-fehlt-was-tun"
  - "fussballde-aendert-daten"
last_updated: "2026-07-20"
status: "published"
---

KickPact braucht Spiel-Daten, um Trigger feuern zu lassen. Statt dass Trainer alles manuell einträgt, holen wir die offiziellen Daten von **Fußball.de** — automatisiert, täglich und am Spieltag-Wochenende mehrfach. So funktioniert die Pipeline.

## Crawl-Frequenz

- **Einmal täglich am Morgen** — der Standard-Lauf für alle Mannschaften.
- **Am Wochenende (Samstag + Sonntag) mehrfach zusätzlich** am Nachmittag und Abend — genau dann, wenn die meisten Spiele laufen.
- Die meisten Spielergebnisse sind innerhalb von **2-4 Stunden nach Spielende** auf Fußball.de — und damit beim nächsten Lauf bei uns. Samstagsspiele siehst du in der Regel noch am selben Abend.

## Was der Crawler holt

Pro Mannschaft (über `fussballde_team_id` verknüpft):

- **Spielplan** der aktuellen Saison (alle Spiele, vergangene + zukünftige)
- **Endergebnisse** und Halbzeitstände
- **Torschützen** mit Spielerzuordnung
- **Karten** (Gelb, Gelb-Rot, Rot) wenn auf Fußball.de gepflegt
- **Auswechslungen** (selten zuverlässig auf Amateur-Niveau)
- **Liga-Tabelle** der laufenden Saison

Wir holen **nicht**:
- Tor-Subtypen (Kopfball, Volley, etc.)
- Assists
- Spieler des Spiels
- Eckbälle / Ballbesitz / Statistiken

Diese fehlenden Daten sind die **Manual-Trigger** und werden vom Trainer nach Spiel ergänzt.

## Wie die Daten landen

1. Crawler ruft die Mannschafts-Seite auf Fußball.de auf.
2. HTML wird geparst, Match-Events extrahiert.
3. Spieler werden über Name + Fußball.de-Player-ID identifiziert. Neue Spieler werden in `players` angelegt.
4. **Idempotenz-Check**: ein Match-Event mit derselben Spiel-ID + Minute + Spieler-ID wird nicht doppelt importiert.
5. Pro neuem Match-Event wird die **Trigger-Engine** gefeuert: alle aktiven Pacts der Mannschaft werden geprüft, passende Beiträge erzeugt.

Das ganze ist **transaktional** — entweder alle Events eines Crawls werden konsistent verarbeitet, oder nichts.

## Nicht jedes erkannte Spiel erzeugt Beiträge

Der Crawler holt auch Freundschaftsspiele und Turniere ein, wenn sie auf Fußball.de stehen. Beiträge entstehen daraus aber nicht: Nur Liga- und Pokalspiele lösen Trigger aus. Ein erkanntes Freundschaftsspiel taucht also im Spielplan auf, kostet den Sponsor aber nichts. Mehr in [Freundschaftsspiele zahlen nicht](freundschaftsspiele-zahlen-nicht.md).

## Was ist mit nachträglichen Korrekturen?

Fußball.de korrigiert manchmal Daten nach 1-2 Tagen (z.B. falscher Torschütze, falsches Ergebnis). Unser Crawler erkennt das beim nächsten Lauf:

- **Endergebnis korrigiert** (3:1 → 4:1): neuer Match-Event mit zusätzlichem Tor wird angelegt. Pacts feuern für das neue Tor.
- **Torschütze korrigiert** (Tor von A → Tor von B): alter Event wird invalidiert (Beitrag storniert oder Storno-Beitrag erzeugt), neuer Event mit korrektem Spieler.

Mehr in [Fußball.de ändert Daten](fussballde-aendert-daten.md).

## Was wenn das Spiel auf Fußball.de fehlt?

Manche Spiele tauchen nicht auf Fußball.de auf — Freundschaftsspiele, Hallenturniere, abgesagte Spiele die nachgespielt wurden ohne Nachtrag. Optionen:

1. **Warten** — manchmal kommt das Ergebnis nachträglich. Crawler holt's beim nächsten Lauf.
2. **Manuell anlegen** — siehe [Match fehlt, was tun?](match-fehlt-was-tun.md). Trainer trägt das Spiel mit Spiel-ID "manual-X" ein.

## Rate-Limiting und Fußball.de-Schutz

KickPact respektiert Fußball.de:
- **User-Agent-Rotation** mit identifizierbarem Bot-Header
- Keine parallel-Requests pro Mannschaft
- **Backoff bei 429-Antworten**
- Alle Crawls gelogged und überwacht

Wir wollen nicht gebanned werden, sonst geht für alle Vereine nichts mehr. Wenn du beim Crawl-Status eine Warnung "Rate-Limited" siehst, ist das vorübergehend und löst sich beim nächsten Lauf.

## Wann der Crawler **nicht** läuft

- **Trial abgelaufen + Grace Period rum** → Mannschaft ist Read-Only, kein Crawl.
- **Sommerpause** (keine Spiele in Spielplan): Crawler läuft trotzdem, findet aber nichts.
- **Vereins-Abo gekündigt** → Read-Only, kein Crawl.
- **Wartung** (geplante KickPact-Updates) → ausgelassener Crawl-Slot, wird beim nächsten Slot nachgeholt.

## Crawl-Status sehen

**Verein → Mannschaft → Einstellungen → Daten-Quelle.**

Du siehst:
- Letzter erfolgreicher Crawl (Zeitstempel)
- Letzter Crawl-Status (success / error / rate-limited)
- Anzahl importierter Match-Events insgesamt
- Bei Fehler: Fehler-Meldung mit Workaround

## Privacy

- Wir crawlen **nur deine** Mannschaft, nicht den Gegner als separate Mannschaft.
- Spielernamen aus Fußball.de werden bei uns als `players`-Zeilen abgelegt. Bei DSGVO-Anfrage eines Spielers ("ich will nicht in eurer App auftauchen") setzen wir `blocked = true` und anonymisieren den Namen zu "Spieler X" — Tore werden weiter gezählt, aber ohne Namen.

Weiter lesen:
- [Auto-Trigger-Katalog](auto-trigger-katalog.md)
- [Match fehlt, was tun?](match-fehlt-was-tun.md)
- [Fußball.de ändert Daten](fussballde-aendert-daten.md)
