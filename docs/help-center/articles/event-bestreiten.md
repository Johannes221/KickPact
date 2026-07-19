---
title: "Event bestreiten"
slug: "event-bestreiten"
category: "approvals-disputes"
category_label: "Approvals & Disputes"
prio: "MUSS"
audience: ["sponsor", "verein-admin"]
related_articles:
  - "pending-events-bestaetigen"
  - "manual-trigger-katalog"
  - "disputes-und-trust"
  - "reminder-logik"
last_updated: "2026-05-25"
status: "published"
---

Trainer meldet ein Manual-Event, du als Sponsor zweifelst. Kein Drama — du kannst es bestreiten. Wie das geht, was danach passiert, und wann es sinnvoll ist.

## Wann es sinnvoll ist

- **Du warst beim Spiel** und das gemeldete Ereignis ist objektiv falsch ("Tim hat kein Kopfball-Tor geschossen, das war ein Volley").
- Das Manual-Event passt **nicht zur Spielsituation** ("Spieler des Spiels war Tim, der hatte aber drei Fehlpässe und ist früh ausgewechselt worden").
- Du hast Hinweise von Beobachtern, dass etwas nicht stimmt.
- Trigger-Konfiguration matched nicht: "Ich habe den Pact nur für **Pflichtspiele** abgeschlossen, das war aber ein Freundschaftsspiel."

## Wann es nicht sinnvoll ist

- Du willst einfach Geld sparen, das Event ist aber realistisch.
- Du bist schlecht gelaunt nach einer Niederlage und willst Trigger blockieren.
- Du verstehst die Trigger-Konfiguration falsch — z.B. der Pact gilt für die Mannschaft generell, nicht nur für deinen Sohn.

Wir sehen jedes Dispute. Sponsoren mit hoher Dispute-Quote ohne sachliche Begründung kommen auf den Radar.

## Wie du es technisch machst

1. **Inbox → Pending Events.**
2. Klick auf das Event in Frage.
3. Button **"Bestreiten"** unten rechts.
4. Optional: Textfeld "Grund" (max. 280 Zeichen). Schreib kurz und sachlich.
5. Klick auf **Bestätigen** des Dispute.

## Was passiert nach dem Dispute

1. Event wechselt zu Status `disputed`.
2. **Trainer + Vereins-Admin** bekommen Notification (Mail + In-App).
3. Trainer/Admin sehen dein Dispute in ihrem **Disputes-Tab** (Verein-Mannschaft-Seite).
4. Sie können:
   - **Dispute akzeptieren** → Event wird gelöscht, kein Beitrag.
   - **Dispute ablehnen** → Event wird zu approved, Beitrag wird erzeugt.
   - **Korrigieren** → Event wird angepasst (z.B. "Volley statt Kopfball") und du bekommst neues Pending-Event zum Bestätigen.

## Was wenn der Trainer das Dispute ablehnt?

- Du bekommst Mail + In-App-Notification.
- Du kannst **eskalieren** → Klick auf "Eskalation an Vereins-Admin" (wenn der Admin nicht selbst der Trainer ist).
- Bei wiederholten Konflikten bleibt nur: persönlich beim Verein klären. KickPact ist keine Schiedsstelle.

**Pragmatisch:** Bei Amateurfußball-Sponsoren mit familiärem Bezug klären sich Disputes meist im persönlichen Gespräch. KickPact bietet das Werkzeug, der Verein die Beziehung.

## Wie lange ein Dispute offen sein darf

- Sobald du bestreitest, ist das Event **nicht mehr pending**.
- Trainer/Admin sollten innerhalb von **7 Tagen** reagieren.
- Bei keiner Reaktion: Event bleibt `disputed`, **kein Beitrag** entsteht. Verein verliert das Geld.

Das ist asymmetrisch: ein Sponsor-Dispute ohne Reaktion vom Verein führt zu Geld-für-Sponsor, nicht zu Geld-für-Verein. Bewusste Entscheidung — wir schützen Sponsoren-Trust mehr als Verein-Bequemlichkeit.

## Dispute nachträglich (Event schon bestätigt)

Du hast einen Beitrag schon vor Tagen bestätigt, jetzt fällt dir auf, dass es falsch war? Bis zum **7. des Folgemonats** kannst du noch anfechten:

1. **Sponsor-Dashboard → Abrechnungen → Aktueller Monat.**
2. Klick auf die Zeile, klick "..." → **"Beitrag anfechten"**.
3. Grund eingeben.

Verein-Admin sieht die Anfechtung, kann genauso entscheiden wie beim normalen Dispute.

Nach dem 7. des Folgemonats: nur noch Support-Anfrage an support@kickpact.com mit Begründung.

## Audit-Log

Alle Disputes sind im Audit-Log:

- Wer hat bestritten (Sponsor-Account + IP-Adresse anonymisiert)
- Welcher Grund wurde angegeben
- Wann
- Wer hat entschieden (Trainer/Admin)
- Was war die Entscheidung

Sichtbar für Vereins-Admin in **Verein → Mannschaft → Ereignisse → Audit-Log**. Sponsor sieht seine eigenen Disputes in **Inbox → Tab Disputes**.

## Was Disputes nicht abdecken

- **Auto-Trigger** (Crawler-Daten von Fußball.de) — die kannst du **nicht** bestreiten, sie kommen aus offiziellen Quellen. Wenn Fußball.de falsch ist, korrigiert Fußball.de, KickPact zieht beim nächsten Crawl nach.
- **Verein-Stammdaten** (z.B. IBAN falsch) — kein Dispute, sondern direkt Vereins-Admin anschreiben.
- **Konfiguration deines eigenen Pacts** — wenn du den Pact falsch konfiguriert hast, ist das deine Verantwortung, kein Dispute.

Weiter lesen:
- [Pending Events bestätigen](pending-events-bestaetigen.md)
- [Disputes und Trust](disputes-und-trust.md)
- [Manual-Trigger-Katalog](manual-trigger-katalog.md)
