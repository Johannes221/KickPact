# Desktop-Glocke für Benachrichtigungen

**Datum:** 2026-07-20
**Status:** Approved

## Problem

KickPact hat bereits eine vollständige Notification-Infrastruktur (In-App-Inbox,
Push, `access_request`-Typ inkl. Auslösung beim Anlegen einer Zugriffs-Anfrage)
und eine `NotificationsBell`-Komponente mit rotem Zähler-Badge. Diese Glocke ist
aber `md:hidden` — Teil der nativen iOS-App-Nav-Bar (`AppNavBar` mit `brand`-Prop)
und auf Desktop-Web nicht sichtbar. Auf Desktop existiert dafür aktuell keine
Entsprechung: `verein-sub-nav.tsx`, `team-sub-nav.tsx` und `sponsor-sub-nav.tsx`
rendern dort nur eine reine Text-Link-Tableiste ohne Icon-Slot.

Folge: Ein Club-Admin, der z. B. eine neue Zugriffs-Anfrage per E-Mail bekommt und
im Desktop-Browser arbeitet, hat keinerlei sichtbaren Hinweis im Produkt selbst —
er muss aktiv in die Mitglieder-Einstellungen navigieren, wo der Hinweis nur als
kleiner Badge neben der Überschrift „Offene Anfragen" auftaucht.

## Ziel

Dieselbe Glocke (Icon + rotes Badge mit Anzahl) auch auf Desktop, an derselben
Stelle in der Informationsarchitektur, in der sie mobil bereits existiert:
Verein-, Mannschafts- und Sponsor-Bereich.

## Nicht Teil dieser Änderung

- Kein neues Dashboard-Banner (bewusst gegen diese Option entschieden — die
  Glocke allein soll reichen).
- Keine Änderung an der Mitglieder-Settings-Seite (Badge dort bleibt wie ist).
- Kein Web-Push (bleibt bei der bestehenden Nur-iOS-Push-Entscheidung, siehe
  `lib/db/schema/notifications.ts`).
- Kein Backend-/Trigger-Change — `notifyAccessRequest` (Inngest) und
  `notifyUsers` (`lib/notifications/deliver.ts`) funktionieren bereits korrekt.
  Rein eine Sichtbarkeits-/Darstellungs-Korrektur im Frontend.

## Design

### Wo die Glocke erscheint

Genau an den drei Stellen, an denen `AppNavBar brand` sie mobil schon rendert:

- `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx`
- `app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx`
- `app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx`

Jeweils zusätzlich zur bestehenden `hidden md:flex`-Desktop-Tableiste, als
eigenes Icon-Element (Bell + Badge), z. B. rechts neben der Tableiste.

### Panel-Darstellung

Ein Bottom-Sheet (wie auf Mobile) wirkt auf großem Screen falsch. Statt einer
neuen Dependency (Popover) wird die bereits vorhandene shadcn-`Sheet`-Komponente
wiederverwendet, nur mit `side="right"` auf Desktop statt `side="bottom"` auf
Mobile — ein Standard-Off-Canvas-Panel-Muster.

`NotificationsBell` (`components/shared/notifications-bell.tsx`) wird dafür
intern aufgeteilt:

- **Gemeinsame Logik** (unverändert): Fetch von `/api/user/notifications`,
  Badge-Berechnung (`statusItems.length + unread`), „als gelesen markieren"
  beim Öffnen (`markAllNotificationsReadAction`).
- **Gemeinsame Zeilen-Komponenten** (`StatusRow`, `NotifRow`): unverändert,
  in beiden Panel-Varianten genutzt.
- **Panel-Wrapper**: `side` wird abhängig von der Breakpoint-Darstellung
  gewählt (zwei Trigger-Buttons, mobil `md:hidden` / desktop `hidden md:flex`,
  gleiche Fetch-/State-Logik, unterschiedlicher `Sheet side`).

### Verhalten

Identisch zur mobilen Glocke: Klick öffnet das Panel und markiert alle Events
als gelesen; Klick auf einen Eintrag navigiert zum hinterlegten Deep-Link (z. B.
`/verein/<slug>/einstellungen/mitglieder`) und schließt das Panel.

## Betroffene Dateien

- `components/shared/notifications-bell.tsx` (Refactor: Panel-Wrapper je
  Breakpoint, sonst unverändert)
- `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx` (Desktop-Glocke
  ergänzen)
- `app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx`
  (Desktop-Glocke ergänzen)
- `app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx` (Desktop-Glocke
  ergänzen)

## Testing

Kein Vitest nötig (reines UI, keine neue DB-/Trigger-Logik). Verifikation nach
Deploy auf Staging: Zugriffs-Anfrage stellen → prüfen, dass die Desktop-Glocke
den Badge zeigt und der Klick auf den Eintrag zur Mitglieder-Seite springt.
