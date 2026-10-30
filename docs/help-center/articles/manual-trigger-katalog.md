---
title: "Manual-Trigger-Katalog"
slug: "manual-trigger-katalog"
category: "pledges-trigger"
category_label: "Pacts & Trigger"
prio: "MUSS"
audience: ["sponsor", "verein-admin", "trainer"]
related_articles:
  - "auto-trigger-katalog"
  - "pending-events-bestaetigen"
  - "event-bestreiten"
  - "disputes-und-trust"
last_updated: "2026-07-20"
status: "published"
---

Manual-Trigger sind die Events, die der **Verein nachträglich pflegen muss**, weil Fußball.de sie nicht (zuverlässig) hat. Der Trainer öffnet nach dem Spiel KickPact, klickt durch die Ereignisse, und der Sponsor bekommt anschließend ein Pending-Event zum Bestätigen.

## Warum Manual?

Fußball.de gibt uns das **Was und Wer** (Tor von Schmidt in der 23. Min). Aber nicht das **Wie**:

- War es ein Kopfball oder ein Elfmeter?
- War es ein Freistoß-Tor?
- Gab es eine Gelbe oder Rote Karte?

Manual-Trigger sind die Sponsoring-Optionen, die das **Wie** abbilden — und deshalb auf eine Trainer-Bestätigung warten müssen.

## Standard-Manual-Trigger (alle Tarife)

### Spezial-Tor (mit Subtyp)

Ein **Spezial-Tor** ist ein Tor, das der Trainer mit einem der folgenden Subtypen kennzeichnet. Oft als Premium-Pact ("10 € pro Kopfball-Tor").

- **Kopfball** — per Kopf erzielt
- **Hackentor** — mit der Hacke
- **Elfmeter** — vom Punkt verwandelt
- **Freistoß** — direkter Freistoß
- **Eckentor** — direkt aus einem Eckball
- **Tor von der Mittellinie** — aus großer Distanz

### Karten
- **Gelbe Karte**
- **Rote Karte**

Pacts auf Karten sind oft "Anti-Pacts": "5 € pro Roter Karte als Vereinsstrafe" — Geld geht trotzdem an die Vereinskasse.

## Workflow: vom Spiel zum Beitrag

1. **Samstag, 16:00** — Mannschaft spielt 2:1.
2. **Samstag, 18:00** — Trainer öffnet KickPact, geht in **Verein → Mannschaft → Ereignisse → Spiel**.
3. Die zwei Tore sind schon automatisch importiert (Tor von Tim, Tor von Mehmet).
4. Trainer klickt auf das Tor von Tim → "Spezial-Tor: Kopfball".
5. Trainer meldet die Gelbe Karte von Mehmet.
6. Trainer klickt **"Ereignisse abschicken"**.
7. **Sonntag, 09:00** — Sponsor sieht in seinem Dashboard 2 **Pending Events**:
   - Kopfball-Tor von Tim (15 €-Pact)
   - Gelbe Karte Mehmet (5 €-Pact)
8. Sponsor bestätigt einzeln oder alle auf einmal → Beiträge werden erzeugt.
9. Falls Sponsor **innerhalb 7 Tagen nicht reagiert**: Erinnerung. Nach 14 Tagen: zweite Erinnerung. Nach 30 Tagen: Auto-Approve oder Auto-Reject (je nach Vereinseinstellung, Default Auto-Approve).

Mehr in [Pending Events bestätigen](pending-events-bestaetigen.md) und [Reminder-Logik](reminder-logik.md).

## Was, wenn der Trainer einen Fehler macht?

- **Falsches Event** → Sponsor kann es bestreiten, siehe [Event bestreiten](event-bestreiten.md).
- **Vergessenes Event** → Trainer kann nachträglich hinzufügen, bis zum Saison-Ende.
- **Doppelt bestätigtes Event** → kannst du melden, KickPact-Support storniert es.

## Was Sponsoren skeptisch macht

"Der Trainer könnte ja alles als Hackentor markieren, um mehr Geld zu kriegen." Stimmt theoretisch. Drei Schutzmechanismen:

1. **Caps** — Sponsor setzt ein Monats-Cap, da hilft alles Markieren nichts.
2. **Pending-Approval** — Sponsor muss aktiv bestätigen, kann skeptische Events anfechten.
3. **Audit-Log** — alle Markierungen sind mit Trainer-Account und Zeitstempel gespeichert. Bei Streit nachvollziehbar.

Mehr Trust-Mechanismen in [Disputes und Trust](disputes-und-trust.md).

Weiter lesen:
- [Auto-Trigger-Katalog](auto-trigger-katalog.md)
- [Pending Events bestätigen](pending-events-bestaetigen.md)
- [Disputes und Trust](disputes-und-trust.md)
