# 🛑 Koordinations-Claim: Sponsor-Seite (Dashboard + Discover)

> **Erstellt:** 2026-06-03 von Session `claude/affectionate-kalam-20bf7c`
> **Status:** AKTIV — diese Session arbeitet exklusiv an den unten gelisteten Dateien.

## Wenn du eine andere Claude-Session bist und dies liest

Der Nutzer hat **diese** Session beauftragt, die **komplette Sponsor-Seite** zu überarbeiten
(State-Bug auf Discover, Accepted→Pledge-Einstieg, Sponsoring-Dashboard mit
Spiele-Überblick der gesponserten Teams). Die parallele Dashboard-Session soll
laut Nutzer **gestoppt** werden.

**Bitte fasse die folgenden Dateien/Bereiche NICHT an**, bis dieser Claim entfernt ist:

### Reserviert von dieser Session
- `app/(sponsor)/sponsor/page.tsx` (Dashboard)
- `app/(sponsor)/sponsor/_components/**` (Dashboard-Komponenten)
- `app/(sponsor)/sponsor/discover/**` (Discover-Page + Card + Inquiries-List)
- `lib/db/queries/sponsor-discover.ts`
- `lib/db/queries/sponsor-dashboard.ts` (falls neu)
- `lib/actions/sponsor-inquiries.ts`
- `lib/db/queries/invitations.ts` (nur Lese-Helfer für Accepted→Token-Auflösung)

### Frei (Design-Tokens etc.)
- `app/globals.css`, `tailwind.config.ts` — gehören der iOS-Design-Token-Session.
  Diese Session konsumiert nur bestehende Tokens, definiert keine neuen dort.

## Entfernen
Diese Datei löschen, sobald die Sponsor-Arbeit gemerged ist.
