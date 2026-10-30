# Zugriffsanfragen im Admin-Panel bearbeiten

**Datum:** 2026-07-20
**Status:** Approved

## Problem

Ein Club-Admin (Operator: `johannes.schartl@gmail.com`, siehe
[[project-operator-account]]) kann eine offene Zugriffs-Anfrage für einen Verein
nicht annehmen, wenn `assertClubAccess(clubSlug, "admin")` — der normale
Club-seitige Auth-Pfad — durch das Subscription-Gate blockiert wird (Abo
`paused`/`past_due` → „Upgrade erforderlich"-Fehler, siehe `lib/auth/scope.ts`).
Auf mobilen Geräten kann der Operator das Abo aktuell nicht selbst wieder
aktivieren, um den Blocker zu umgehen.

Das Admin-Panel (`/admin/vereine/[slug]`) hat bereits einen etablierten
Operator-Aktions-Mechanismus (`assertPlatformAdmin()` + `recordOperatorAction()`,
siehe `app/admin/(panel)/vereine/_actions/club-actions.ts` und
`stripe-actions.ts`) für Stammdaten, manuelle Verifizierung und Abo-Verwaltung
(inkl. `resumeSubscriptionAction`, das den geschilderten Abo-Blocker bereits
löst). Es fehlt nur die Möglichkeit, offene Zugriffs-Anfragen eines Vereins
dort einzusehen und zu bearbeiten.

## Ziel

Operator kann von `/admin/vereine/[slug]` aus offene Zugriffs-Anfragen eines
beliebigen Vereins annehmen oder ablehnen — unabhängig vom Subscription-Status
des Vereins — mit demselben Audit-Log wie alle anderen Operator-Aktionen.
Zusätzlich: schneller Überblick in der Vereins-Liste (`/admin/vereine`), welche
Vereine offene Anfragen haben.

## Nicht Teil dieser Änderung

- Kein „Reaktivierungs-Link per Mail"-Feature — der bestehende
  `resumeSubscriptionAction`-Button („Abo fortsetzen") reicht für den
  Abo-Teil aus; das ist keine neue Arbeit.
- Kein neuer Rechte-/Auth-Mechanismus — reine Erweiterung des bestehenden
  `assertPlatformAdmin` + `recordOperatorAction`-Musters.

## Design

### Vereins-Liste (`/admin/vereine`)

`listVereineForAdmin` (`lib/db/queries/platform-stats.ts`) bekommt ein weiteres
Feld `pendingRequestCount` im selben Correlated-Subquery-Muster wie
`teamCount`/`memberCount`/`sponsorCount`:

```sql
(SELECT COUNT(*)::int FROM club_membership_requests r
 WHERE r.club_id = "clubs"."id" AND r.status = 'pending')
```

`AdminVereinRow` erweitert um `pendingRequestCount: number`. In
`vereine-table.tsx` als kleines Warn-Badge neben dem Vereinsnamen, nur wenn > 0
(gleiche visuelle Sprache wie der Badge auf der Club-seitigen Mitglieder-Seite).

### Vereins-Detail (`/admin/vereine/[slug]`)

Neue Sektion „Offene Anfragen" an derselben Stelle wie Members/Teams/Charges.
Daten kommen aus der bereits vorhandenen
`listPendingRequestsForClub(club.id)` (`lib/db/queries/membership-requests.ts`)
— wird in `getVereinDetail` (`lib/db/queries/platform-stats.ts`) mit
reingezogen, keine neue Query. Pro Zeile: Requester-E-Mail, angefragte Rolle,
Team-Scope (falls gesetzt), Nachricht, Annehmen-/Ablehnen-Buttons (mit Confirm,
siehe UI-Standards).

### Neue Server-Actions

Neue Datei `app/admin/(panel)/vereine/_actions/membership-requests.ts`, nach
dem Muster von `club-actions.ts`:

```
adminApproveRequestAction({ clubSlug, requestId })
adminRejectRequestAction({ clubSlug, requestId, reason? })
```

Jede Action:

1. `assertPlatformAdmin()` — **nicht** `assertClubAccess()`. Das ist die
   bewusste, auditierte Ausnahme: Operator-Aktionen dürfen nicht durch das
   Billing-Gate eines Kunden blockiert werden.
2. Lädt die Anfrage via `getRequestById`, prüft `req.clubId === club.id`
   (gleicher Tenant-Check wie im Club-seitigen Flow).
3. Cross-Tenant-Guard bei `requestedTeamId` wie im bestehenden
   `approveRequestAction` (`getTeamInClub`) — 1:1 übernommen, kein neuer Code.
4. Ruft `approveRequest`/`rejectRequest` aus
   `lib/db/queries/membership-requests.ts` auf — identische Business-Logik wie
   der Club-seitige Flow (Membership-Insert, Status-Flip erst nach
   erfolgreicher Mail).
5. `beforeCommit` verschickt dieselbe Antragsteller-Mail wie der normale Flow
   (approved/rejected) — Requester merkt keinen Unterschied, ob Club-Admin oder
   Operator entschieden hat.
6. `recordOperatorAction()`: `action: "club.membership_request_approve"` bzw.
   `"club.membership_request_reject"`, `targetType: "club"`, Summary mit
   Requester-E-Mail + Rolle.

### Refactor: geteilte Mail-Logik

`sendRequesterMail` lebt aktuell privat in
`app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`.
Wandert nach `lib/mail/access-request-mail.ts` (reine Helper-Funktion, kein
`"use server"`), damit Club-Flow und neuer Admin-Flow exakt denselben Code
nutzen statt ihn zu duplizieren. Die Mail-Template-Builder
(`accessRequestApprovedEmail`/`accessRequestRejectedEmail`) bleiben unverändert
in `lib/mail/templates/`.

## Betroffene Dateien

- `lib/db/queries/platform-stats.ts` (`pendingRequestCount` in
  `listVereineForAdmin`, `pendingRequests` in `getVereinDetail`)
- `app/admin/(panel)/vereine/_components/vereine-table.tsx` (Badge-Spalte)
- `app/admin/(panel)/vereine/[slug]/page.tsx` (neue Sektion)
- `app/admin/(panel)/vereine/[slug]/_components/` (neue
  Requests-Tabellen-Komponente mit Approve/Reject, analog zur Club-seitigen
  `RequestsTable`)
- `app/admin/(panel)/vereine/_actions/membership-requests.ts` (neu)
- `lib/mail/access-request-mail.ts` (neu, extrahiert aus `approve-reject.ts`)
- `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`
  (importiert den extrahierten Helper statt eigener Kopie)

## Testing

Vitest für die extrahierte `sendRequesterMail`-Logik nicht zwingend nötig (reiner
Mail-Versand, bereits implizit über bestehende Tests der Query-Funktionen
abgedeckt). DB-Queries (`listVereineForAdmin`, `getVereinDetail` Erweiterung)
laufen unter bestehende Query-Tests, falls vorhanden — sonst Smoke-Test
ergänzen (Gate 7: bestehendes Projekt ohne Tests im geänderten Bereich).
Verifikation nach Deploy auf Staging: Zugriffs-Anfrage mit pausiertem
Test-Abo stellen → im Admin-Panel annehmen → prüfen, dass Membership entsteht,
Mail rausgeht und der Audit-Log-Eintrag erscheint.
