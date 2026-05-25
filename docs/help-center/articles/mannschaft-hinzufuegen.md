---
title: "Zweite Mannschaft hinzufügen"
slug: "mannschaft-hinzufuegen"
category: "erste-schritte-verein"
category_label: "Erste Schritte — Verein"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "fussballde-verknuepfung"
  - "vereinslizenz-break-even"
  - "10-admin-slots-verteilen"
  - "welcher-tarif-passt"
last_updated: "2026-05-25"
status: "published"
---

Du hast den FC Musterstadt schon mit der Herren I drin und willst jetzt die A-Jugend dazunehmen? Drei Minuten, drei Klicks.

## Voraussetzung: passender Tarif

Pro Mannschaft brauchst du eine Lizenz. Was du hast:

- **Basic / Pro:** Eine Lizenz pro Mannschaft, separate Abrechnung pro Team. Du kannst beliebig viele Teams in **einem Verein** anlegen, jede zahlt ihr eigenes Abo.
- **Vereinslizenz:** Ein Abo deckt alle Mannschaften ab. Stripe wickelt 1× Abo pro Monat ab, nicht 5×.

Wenn du nicht weißt, was günstiger ist: [Vereinslizenz Break-Even](vereinslizenz-break-even.md) rechnet es dir vor.

## So legst du eine neue Mannschaft an

1. Gehe auf **Verein → Mannschaften → "+ Mannschaft hinzufügen"**.
2. Der Wizard öffnet sich — derselbe wie beim ersten Setup, nur Schritt 1 (Vereinsdaten) entfällt.
3. **Schritt 2: Fußball.de-Verknüpfung** — Verein ist schon ausgewählt, du wählst nur die Mannschaft aus der Liste. Wenn die Mannschaft nicht auftaucht, siehe [Fußball.de-Verknüpfung](fussballde-verknuepfung.md).
4. **Schritt 3: Tarif** — wenn du Vereinslizenz hast, ist das nur ein Bestätigungsschritt (die Mannschaft wird automatisch abgedeckt). Bei Basic/Pro wählst du den Tarif für diese Mannschaft separat. Trial-Bonus: jede neue Mannschaft kriegt nochmal **14 Tage Trial** auf den gewählten Tarif (statt 30, weil du den Verein schon kennst).
5. **Schritt 4: Sponsoren einladen** — optional, kannst du auch später machen.

Nach Schritt 4 landest du auf der **neuen Mannschafts-Seite** mit leerem Spielplan. Der Crawler fängt innerhalb 6 Stunden an, Spiele zu importieren.

## Bestehende Sponsoren auf die neue Mannschaft holen

Häufiger Use-Case: Onkel Schmidt sponsert seinen Neffen. Der Neffe wechselt von der C-Jugend in die B-Jugend, oder spielt parallel in zwei Teams.

Zwei Wege:

- **Sponsor legt selbst zweiten Pledge an** — Onkel Schmidt loggt sich ein, klickt auf der Sponsor-Übersicht "+ Neuer Pledge", wählt die neue Mannschaft. Das ist der saubere Weg.
- **Du schickst ihm einen neuen Einladungslink** — dadurch landet er direkt im Pledge-Wizard für die neue Mannschaft, ohne dass er navigieren muss. Praktisch, wenn er KickPact selten benutzt.

Beide Wege erzeugen einen **eigenen Pledge** mit eigenen Triggern und Caps. Die alte Pledge auf der ursprünglichen Mannschaft bleibt unverändert.

## Team-Membership separat verwalten

Pro Mannschaft kannst du Trainer und Viewer einzeln einladen — siehe [User-Rollen Admin/Trainer/Viewer](user-rollen-admin-trainer-viewer.md). Vereins-Admins haben automatisch Zugriff auf alle Mannschaften. Ein Jugendtrainer hingegen sieht nur seine eine Mannschaft.

Best Practice in größeren Vereinen:

- **Vorstand** = Vereins-Admin (alle Mannschaften).
- **Trainer** = Trainer-Rolle, nur eigene Mannschaft.
- **Eltern-Helfer** = Viewer-Rolle, kann Statistiken sehen, nichts ändern.

## Was du nicht versehentlich tun solltest

- **Nicht** zwei Mannschaften mit identischer Fußball.de-Team-ID anlegen. Der Crawler würde Daten doppelt verarbeiten. Wenn die Fußball.de-Suche dasselbe Team mehrfach zurückliefert, wähle die richtige Saison-Variante.
- **Nicht** eine Mannschaft löschen, um sie "frisch" anzulegen — du verlierst die Historie. Lieber den Fußball.de-Bezug korrigieren.

Weiter lesen:
- [Fußball.de-Verknüpfung](fussballde-verknuepfung.md)
- [Vereinslizenz Break-Even](vereinslizenz-break-even.md)
- [10 Admin-Slots verteilen](10-admin-slots-verteilen.md)
