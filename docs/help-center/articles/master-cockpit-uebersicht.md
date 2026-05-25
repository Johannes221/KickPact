---
title: "Master-Cockpit — die Vereinslizenz-Übersicht"
slug: "master-cockpit-uebersicht"
category: "vereinslizenz-spezial"
category_label: "Vereinslizenz-Spezial"
prio: "MUSS"
audience: ["vereinslizenz-admin"]
related_articles:
  - "cross-team-sponsor-view"
  - "10-admin-slots-verteilen"
  - "vereinslizenz-break-even"
  - "vereinslizenz-sammelrechnung"
last_updated: "2026-05-25"
status: "published"
---

Master-Cockpit ist das **Vereins-weite Dashboard**, exklusiv für Vereinslizenz-Vereine. Eine Seite, alle Mannschaften, ein Klick. So nutzt du es.

## Wo es liegt

`/verein/[slug]/admin` — oder einfach in der Seitenleiste: **Verein → Master-Cockpit**. Nur Vereins-Admins sehen den Menüpunkt, Trainer und Viewer nicht.

## Was du auf einen Blick siehst

Die Startseite ist in vier Kacheln aufgeteilt:

### Kachel 1 — Mannschaften
- Liste aller aktiven Mannschaften des Vereins
- Pro Mannschaft: Anzahl Sponsoren, Monats-Pledges-Summe, Tabellenstand (wenn Fußball.de-verknüpft)
- Klick führt direkt zur Mannschafts-Seite

### Kachel 2 — Sponsoren-Total
- Gesamtzahl Sponsoren über alle Mannschaften
- "Top 10 Sponsoren" nach Pledge-Volumen
- Sponsoren, die **mehrere Mannschaften** unterstützen (z.B. Onkel-Schmidt = Herren II + A-Jugend), siehe [Cross-Team-Sponsor-View](cross-team-sponsor-view.md)

### Kachel 3 — Aktueller Monat
- Live-Charges für den laufenden Monat über alle Mannschaften zusammen
- Vergleich zum Vormonat (Trend ↑↓)
- Top-Trigger-Typen (z.B. "60 % der Charges sind goal_team")

### Kachel 4 — Saison-Hochrechnung
- Worst-Case-Total über alle Mannschaften
- Realistischer Bereich
- Bisher abgerechnete Summe (= reale Saison-Performance)

## Saison-Pass-Status

Direkt unter den Kacheln: **Welche Mannschaft ist auf welchem Saison-Pass?** Ein Verein kann selektiv Mannschaften "in den Saison-Pass" buchen — bei Vereinslizenz sind alle automatisch dabei, du siehst hier nur die Übersicht.

## Aktivitäts-Feed (Live)

Rechte Spalte: aktueller Aktivitäts-Stream:

- "11:32 — Sponsor Yilmaz hat Pledge auf U17 aktiviert"
- "10:15 — Trainer hat 3 Manual-Events für FCM I vs ASV gemeldet"
- "09:47 — Sponsor Schmidt bestätigt 5 Pending-Events"

Praktisch zum Tracken, was im Verein gerade läuft. Du kannst den Feed filtern (nur Events, nur Sponsoren, etc.).

## Admin-Aktionen direkt aus dem Cockpit

- **Neue Mannschaft anlegen** (Plus-Button oben rechts)
- **Admin-Slots verwalten** — siehe [10 Admin-Slots verteilen](10-admin-slots-verteilen.md)
- **Mannschaft deaktivieren** (wenn ein Team pausiert, aber Vereinslizenz weiterlaufen soll)
- **Globale Stammdaten** ändern (Verein-Adresse, Logo, IBAN) — gilt für alle Mannschaften

## Aggregierte Berichte

Im Menü oben: **Berichte**. Hier kannst du:

- **CSV-Export** für Buchhaltung (alle Charges aller Mannschaften, ein File)
- **PDF-Saison-Report** generieren — Verein-weite Zusammenfassung am Saison-Ende, brauchbar für Vorstandssitzung
- **Sammelrechnung-Übersicht** — pro Sponsor eine Zeile, was er allen Mannschaften des Vereins schuldet

Mehr in [Aggregiertes Saison-Recap](aggregiertes-saison-recap.md).

## Was du im Cockpit **nicht** machst

- **Einzelne Match-Events bestätigen** — das machst du auf der Mannschafts-Seite (Trainer-Rolle).
- **Spieler hinzufügen** — Mannschaft → Kader.
- **Pledges einzelner Sponsoren ansehen im Detail** — Klick auf Sponsor in der Liste führt zu seinem Detail.

## Performance bei vielen Mannschaften

Master-Cockpit ist auf bis zu **30 Mannschaften** optimiert. Bei größeren Vereinen wirst du wahrscheinlich Filter brauchen ("nur U-Jugend zeigen"). Filter werden in deinen User-Settings gespeichert.

## Mobile-Tauglichkeit

Cockpit funktioniert auf dem Handy, ist aber primär für **Desktop / Tablet** gebaut. Die vier Kacheln stapeln sich vertikal, der Aktivitäts-Feed ist als Tab unter den Kacheln verfügbar.

Weiter lesen:
- [Cross-Team-Sponsor-View](cross-team-sponsor-view.md)
- [10 Admin-Slots verteilen](10-admin-slots-verteilen.md)
- [Vereinslizenz Break-Even](vereinslizenz-break-even.md)
