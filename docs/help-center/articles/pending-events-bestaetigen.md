---
title: "Pending Events bestätigen"
slug: "pending-events-bestaetigen"
category: "approvals-disputes"
category_label: "Approvals & Disputes"
prio: "MUSS"
audience: ["sponsor"]
related_articles:
  - "event-bestreiten"
  - "manual-trigger-katalog"
  - "reminder-logik"
  - "disputes-und-trust"
last_updated: "2026-07-20"
status: "published"
---

Manual-Trigger funktionieren so: Trainer meldet ein Ereignis (Kopfball-Tor, Assist, Spieler des Spiels), Sponsor bestätigt es, **dann** wird der Beitrag erzeugt. Diese Zwischenphase heißt **Pending**. So gehst du damit um.

## Wo du Pending Events siehst

**Sponsor-Dashboard → Inbox.**

Wenn neue Pending Events vorliegen, steht ein **roter Counter** auf dem Inbox-Icon (z.B. "3"). Klick rein, du siehst eine Liste mit:

- Mannschaftsname + Match (Datum + Gegner)
- Trigger-Typ (Kopfball, Assist, Spieler des Spiels...)
- Spieler-Name (wenn relevant)
- Betrag aus deinem Pact
- Wer hat es gemeldet (Trainer-Name + Zeitstempel)
- Buttons: **Bestätigen** | **Bestreiten**

## Was Bestätigen bewirkt

Mit Klick auf **Bestätigen**:
- Event wechselt von `pending` zu `approved`
- Beitrag wird **sofort erzeugt** (Betrag aus deiner Pact-Regel)
- Erscheint in deinem laufenden Monat
- Trigger-Counter im Sponsor-Dashboard zählt hoch

Du kannst auch **Mehrere auf einmal** bestätigen: Checkbox-Spalte links + Massenaktion oben.

## Was Bestreiten bewirkt

Klick auf **Bestreiten** öffnet ein Dialog mit Textfeld (optional, max. 280 Zeichen). Du kannst kurz erklären, warum — oder es leer lassen. Dann:

- Event wechselt zu `disputed`
- Verein-Admin und der meldende Trainer bekommen eine Notification
- Beitrag wird **nicht erzeugt**
- Audit-Log hält dein Dispute fest

Mehr in [Event bestreiten](event-bestreiten.md).

## Wenn du gar nicht reagierst

Pending Events haben eine **Auto-Resolution-Zeit**:

- **Nach 7 Tagen**: erste Erinnerung per Mail
- **Nach 14 Tagen**: zweite Erinnerung
- **Nach 30 Tagen**: Auto-Approve oder Auto-Reject

Die Auto-Resolution **kann der Verein konfigurieren**:
- **Default**: Auto-Approve (Verein bekommt das Geld, das ist die Verein-freundliche Voreinstellung)
- **Alternative**: Auto-Reject (Sponsor zahlt nichts, wenn er nicht aktiv bestätigt)

Du als Sponsor siehst die Konfiguration in deinem Dashboard transparent: "Pending Events werden nach 30 Tagen automatisch approved" oder "...rejected".

## Empfehlung: Wöchentlich kurz reingucken

Wenn dein Verein viel meldet (Kopfball-Pacts, Karten), kommen pro Spieltag mehrere Pending Events. Einmal pro Woche 5 Minuten:

1. Inbox öffnen.
2. Alle plausiblen Events markieren + **Bestätigen**.
3. Eines, das dir merkwürdig vorkommt? → Detail anklicken, lesen, ggf. bestreiten.

Mit Routine: 30 Sekunden für 10 Events.

## Filter und Suche

Wenn die Inbox voll ist:
- Filter nach Mannschaft (wenn du mehrere unterstützt)
- Filter nach Trigger-Typ ("nur Kopfball-Tore zeigen")
- Filter nach Spieler ("nur Events meines Sohnes")
- Datumsbereich

## Vergangenheit ansehen

**Inbox → Tab "Bestätigt"** zeigt dir die letzten 90 Tage. Du kannst einen Beitrag nachträglich **anfechten** (selten, aber möglich), wenn dir nach 5 Tagen auffällt, dass das Event doch falsch war:

- Klick auf "..." rechts an der Zeile → **"Beitrag anfechten"**.
- Verein bekommt Notification + Entscheidung.
- Bis zum 7. des Folgemonats kann das noch rückgängig gemacht werden.

## Mobile-Tauglichkeit

Inbox läuft auf dem Handy gut — Trainer-Eltern bestätigen oft Sonntag-früh auf dem Sofa. Swipe nach rechts = Bestätigen, Swipe nach links = Detail öffnen.

## Notification-Settings

In **Profil → Benachrichtigungen** kannst du steuern, wie du über neue Pending Events informiert wirst:

- **Sofort** — jede Meldung eine Mail
- **Wöchentlich-Digest** — Samstag 9:00 eine Sammelmail mit allen offenen Events (empfohlen)
- **Aus** — nur In-App-Notifications, keine Mails

Mehr in [Reminder-Logik](reminder-logik.md).

Weiter lesen:
- [Event bestreiten](event-bestreiten.md)
- [Manual-Trigger-Katalog](manual-trigger-katalog.md)
- [Reminder-Logik](reminder-logik.md)
