---
title: "Manual-Trigger-Katalog"
slug: "manual-trigger-katalog"
category: "pledges-trigger"
category_label: "Pledges & Trigger"
prio: "MUSS"
audience: ["sponsor", "verein-admin", "trainer"]
related_articles:
  - "auto-trigger-katalog"
  - "pending-events-bestaetigen"
  - "event-bestreiten"
  - "custom-trigger-anlegen"
last_updated: "2026-05-25"
status: "published"
---

Manual-Trigger sind die Events, die der **Verein nachträglich pflegen muss**, weil Fußball.de sie nicht (zuverlässig) hat. Der Trainer öffnet nach dem Spiel KickPact, klickt durch die Ereignisse, und der Sponsor bekommt anschließend ein Pending-Event zum Bestätigen.

## Warum Manual?

Fußball.de gibt uns das **Was und Wer** (Tor von Schmidt in der 23. Min). Aber nicht das **Wie**:

- War es ein Kopfball oder ein Volley?
- War es ein Elfmeter?
- Wer hat assistiert?
- Wer ist Spieler des Spiels?

Manual-Trigger sind die Sponsoring-Optionen, die das **Wie** abbilden — und deshalb auf eine Trainer-Bestätigung warten müssen.

## Standard-Manual-Trigger (alle Tarife)

### Tor-Subtypen
- **Kopfball-Tor** — Kopfball, oft als Premium-Pledge ("10 € pro Kopfball-Tor")
- **Volley-Tor** — direkt aus der Luft geschossen
- **Hackentor** — mit der Hacke
- **Fernschuss** — Schuss aus großer Entfernung (~25+ m)
- **Elfmeter** — vom Punkt verwandelt
- **Freistoß-Tor** — direkter Freistoß
- **Verwandelter Eckball** (selten, aber gibt's)

### Karten
- **Gelbe Karte**
- **Gelb-Rote Karte**
- **Rote Karte**

Pledges auf Karten sind oft "Anti-Pledges": "5 € pro Roter Karte als Vereinsstrafe" — Geld geht trotzdem an die Vereinskasse.

### Spielereignisse
- **Assist** — Tor-Vorbereitung. "5 € pro Assist meines Sohnes."
- **Spieler des Spiels** — vom Trainer benannt, max. 1 pro Spiel. "20 € wenn Tim Spieler des Spiels ist."
- **Eckball-Tor** — Tor direkt aus einem Eckball, separat vom Eckball selbst.

### Sonstige
- **Auswärtssieg** (kommt automatisch via Crawler — nicht manuell nötig, daher in der Übergangsphase noch hier)
- **Verlorene Halbzeit** (Halbzeit-Stand 0:Gegner-Tore > 0)

## Custom-Trigger (Pro / Vereinslizenz)

Du kannst eigene Manual-Trigger anlegen. Beispiele aus der Pilotphase:

- "Bizeps-Tor von Schmidt nach Krafttraining"
- "Trainer-Frisur-Lob"
- "Im richtigen Stadion-Lied mitgesungen"
- "Aufkleber-Spende: Kapitän nimmt Aufkleber an"

Die Logik: Du erfindest den Trigger-Text, der Trainer entscheidet pro Spiel, ob er ihn meldet. Mehr in [Custom-Trigger anlegen](custom-trigger-anlegen.md).

## Workflow: vom Spiel zum Charge

1. **Samstag, 16:00** — Mannschaft spielt 2:1.
2. **Samstag, 18:00** — Trainer öffnet KickPact, geht in **Verein → Mannschaft → Ereignisse → Spiel**.
3. Crawler hat schon die zwei Tore importiert (Tor von Tim, Tor von Mehmet).
4. Trainer klickt auf das Tor von Tim → "Tor-Subtyp: Kopfball".
5. Trainer fügt einen Assist hinzu (Mehmet → Tim).
6. Trainer benennt **Spieler des Spiels: Tim**.
7. Trainer klickt **"Ereignisse abschicken"**.
8. **Sonntag, 09:00** — Sponsor sieht in seinem Dashboard 3 **Pending Events**:
   - Kopfball-Tor von Tim (15 € Pledge)
   - Assist Mehmet → Tim (5 € Pledge)
   - Spieler des Spiels Tim (20 € Pledge)
9. Sponsor bestätigt einzeln oder alle auf einmal → Charges werden erzeugt.
10. Falls Sponsor **innerhalb 7 Tagen nicht reagiert**: Erinnerung. Nach 14 Tagen: zweite Erinnerung. Nach 30 Tagen: Auto-Approve oder Auto-Reject (je nach Vereinseinstellung, Default Auto-Approve).

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
- [Custom-Trigger anlegen](custom-trigger-anlegen.md)
