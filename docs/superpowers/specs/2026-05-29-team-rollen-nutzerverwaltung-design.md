# Team-Rollen & Nutzerverwaltung — Design Spec

**Date:** 2026-05-29
**Status:** approved-for-implementation
**Author:** Johannes + Claude (brainstorming session)

## 1. Problem Statement

Die Vereins-Ebene hat bereits eine vollständige Nutzerverwaltung (`/verein/{slug}/einstellungen/mitglieder`): Einladen, Anfragen annehmen/ablehnen, Rollen ändern/entziehen, Letzter-Admin-Schutz. Drei Lücken bleiben relativ zum gewünschten Rollenkonzept:

1. **Kein Mannschaftsadministrator.** `teamMemberships` kennt nur `trainer`/`viewer` — keine Admin-Rolle auf Team-Ebene. Eine Mannschaft kann sich nicht selbst verwalten.
2. **Keine team-eigene Verwaltungs-UI.** Mitglieder lassen sich heute *nur* aus den Vereins-Einstellungen verwalten. Ein reiner Mannschafts-Verantwortlicher ohne Club-Admin-Rolle hat keine eigene Mitglieder-Seite.
3. **Kein „autark"-Konzept.** Heute steht jedes Team unter seiner `clubId`, und ein Club-Admin hat per Durchgriff Rechte über *alle* Teams des Clubs — unabhängig davon, ob das Team eine eigene Lizenz hat.

## 2. Goals

- Innerhalb einer Mannschaft gibt es zwei Rollen: **Mannschaftsadmin** (darf alles: Mitglieder verwalten, Sponsoren einladen, Events melden, Einstellungen) und **Viewer** (nur lesen).
- Der **Verein-Admin-Durchgriff** auf eine Mannschaft hängt an der **Lizenz**: vereinsgeführte Teams (unter Vereinslizenz) sind dem Verein-Admin unterstellt, autarke Teams (eigene basic/pro-Lizenz) nicht.
- **Jede Mannschaft** hat mindestens einen direkten Mannschaftsadmin (`teamMemberships.role='admin'`).
- **Volle Delegation:** Bei vereinsgeführten Teams können sowohl Verein-Admin (per Durchgriff) als auch Mannschaftsadmin (per eigener Team-Seite) die Team-Mitglieder verwalten.

## 3. Out of Scope

- Änderungen an den Club-Ebene-Rollen (`admin`/`trainer`/`viewer` bleiben). „Trainer" am Club bleibt eine eigenständige Rolle.
- Mehrstufige Team-Rollen jenseits von Admin/Viewer (kein separates „Mitglied/Trainer" auf Team-Ebene).
- Neue Capability-Abstraktion über alle Team-Pages hinweg. Nur **ein** Helper (`canManageTeamMembers`) wird eingeführt; andere Team-Pages bleiben unangetastet.

## 4. Datenmodell & Zugriff

### 4.1 Rollen-Enums

- **Club-Ebene unverändert:** `memberRoleEnum = [admin, trainer, viewer]`.
- **Team-Ebene:** `teamMemberRoleEnum` per Migration `trainer → admin` umbenennen. Postgres `ALTER TYPE "team_member_role" RENAME VALUE 'trainer' TO 'admin'` (atomar, Daten wandern automatisch; PG 15+ auf Neon). Ergebnis: `teamMemberRoleEnum = [admin, viewer]`. Der `default` der Spalte wird von `viewer` auf `viewer` belassen (unverändert), das Schema-`default` bleibt `viewer`.
- **Einladungs-Enum:** `invitationRoleEnum` von `[trainer, viewer]` → `[admin, trainer, viewer]` (Postgres `ALTER TYPE ... ADD VALUE 'admin'`). Validierung pro Scope:
  - Team-Invite (`teamId` gesetzt): role ∈ `{admin, viewer}`.
  - Club-Invite (`clubId` gesetzt): role ∈ `{trainer, viewer}` (Club-Admin weiterhin nur per Promotion, nicht per Invite).

### 4.2 Lizenz-gekoppelter Durchgriff

Ein Team ist **vereinsgeführt**, wenn seine `teamLicenses`-Zeile `plan='verein'` hat **oder** `parentClubLicenseId IS NOT NULL`. Sonst **autark**.

`resolveTeamAccess` (Club-Scope-Zweig) gewährt Club-Admin/-Trainer den Durchgriff **nur** bei vereinsgeführten Teams. Bei autarken Teams wird der Club-Scope-Zweig übersprungen; Zugriff kommt dann ausschließlich aus `teamMemberships`.

Neuer interner Helper `isTeamUnderClubLicense(teamId): Promise<boolean>` kapselt diese Lizenz-Prüfung; er wird von `resolveTeamAccess` und `canManageTeamMembers` geteilt.

### 4.3 Jede Mannschaft hat einen direkten Mannschaftsadmin

Folgekonsequenz aus 4.2: Würde der Durchgriff auf vereinsgeführte Teams beschränkt, sperrt sich der Owner einer autarken Mannschaft aus (er hängt heute am Club-Admin-Durchgriff seines 1-Team-Containers). Lösung:

- **Onboarding-Anpassung:** Beim Anlegen einer Mannschaft wird der Ersteller direkt als `teamMemberships`-Admin eingetragen (zusätzlich zur bestehenden Club-Membership).
- **Backfill-Migration:** Für jedes bestehende Team einen `teamMemberships`-Admin-Eintrag für den/die Club-Admin(s) des zugehörigen Clubs sicherstellen (`INSERT ... ON CONFLICT DO NOTHING`). Damit verlieren bestehende autarke Teams keinen Zugriff.

## 5. Capability-Helper & Server-Actions

### 5.1 Helper in `lib/auth/scope.ts`

```ts
canManageTeamMembers(userId: string, teamId: string): Promise<boolean>
```

True, wenn der User entweder
- direkter `teamMemberships`-Admin dieses Teams ist, **oder**
- Club-Admin eines Clubs ist, unter dessen Vereinslizenz dieses Team läuft (`isTeamUnderClubLicense`).

### 5.2 `countTeamAdmins(teamId)` + Letzter-Admin-Schutz

Neuer Query-Helper `countTeamAdmins(teamId)` analog `countClubAdmins`. Den letzten Team-Admin kann man nicht demoten/entfernen — sonst wäre eine autarke Mannschaft führungslos und (mangels Durchgriff) für niemanden mehr verwaltbar.

### 5.3 Team-scoped Actions

Neuer Ordner `app/(verein)/verein/[slug]/mannschaft/[teamId]/einstellungen/mitglieder/_actions/`:

- `invite.ts` — Team-Invite (`kind='team-member'`, `teamId` gesetzt, role ∈ `{admin, viewer}`), geguardet mit `canManageTeamMembers`.
- `manage.ts` — Rolle ändern / entziehen, nur für `teamMemberships` dieses Teams. Letzter-Admin-Guard. Geguardet mit `canManageTeamMembers`.
- `approve-reject.ts` — Zugriffs-Anfragen mit `requestedTeamId = dieses Team` annehmen/ablehnen. Geguardet mit `canManageTeamMembers`.

Die Actions verwenden die bestehenden Query-Helper (`changeTeamMembershipRole`, `revokeTeamMembership`, `createTeamMemberInvitation`, `approveRequest`/`rejectRequest`) wieder.

### 5.4 Query-Anpassungen für den Rename

- `membership-requests.ts`: `TeamRole` → `"admin" | "viewer"`; `approveRequest` team-scope-Mapping: `requestedRole === "viewer" ? "viewer" : "admin"`.
- `invitations.ts`: `InvitationRole` → `"admin" | "trainer" | "viewer"`; `createTeamMemberInvitation`/`acceptTeamMemberInvitation`/`PendingTeamMemberInvitation` entsprechend.
- `user-identities.ts`: `teamOnly[].role` → `"admin" | "viewer"`.
- `scope.ts`: `TeamRole` → `"admin" | "viewer"`; `TEAM_RANK = { viewer: 1, admin: 2 }`.
- `submit-verification.ts`: `assertTeamAccess(teamId, "trainer")` → `"admin"`.

## 6. UI

### 6.1 Neue Seite `mannschaft/[teamId]/einstellungen/mitglieder`

Server Component, geguardet mit `assertTeamPageAccess(slug, teamId)` + `canManageTeamMembers` (sonst redirect/404). Sektionen analog zur Vereins-Seite, aber team-scoped:

1. **Mannschaftsadmin oder Viewer einladen** — Invite-Form (role ∈ `{admin, viewer}`, kein Team-Dropdown).
2. **Offene Einladungen** — Pending-Invites dieses Teams (kopieren/erneuern/widerrufen).
3. **Offene Anfragen** — Zugriffs-Anfragen mit `requestedTeamId = dieses Team`.
4. **Aktive Mitglieder** — Team-Mitglieder dieses Teams (Rolle ändern / entfernen, Letzter-Admin-Schutz).

### 6.2 Komponenten generalisieren statt duplizieren

- `invite-form` → `scope: "club" | "team"`-Prop. Team-Modus blendet Team-Dropdown aus, fixiert Rollen auf `{admin, viewer}`.
- `members-table` → team-only-Variante (nur Team-Mitglieder, Team-Rollen). Akzeptiert eine `teamAdminCount`-Prop für den Letzter-Admin-Guard.
- `requests-table` / `pending-invitations-table` → scope-agnostisch über Props (basePath statt fix `clubSlug`-Einstellungen-Pfad).

### 6.3 Einstiegspunkt

In `mannschaft/[teamId]/einstellungen/page.tsx` (Sektion „Weitere Bereiche") eine Kachel **„Mitglieder & Zugriff"** — sichtbar nur, wenn `canManageTeamMembers` true ist.

## 7. Tests

Projekt-Konvention: DB-Queries + Auth-Logik müssen Tests haben.

- `canManageTeamMembers` (Matrix: Team-Admin / Club-Admin-vereinsgeführt / Club-Admin-autark / Viewer / Fremder).
- `resolveTeamAccess` mit Lizenz-Gating (vereinsgeführt → Club-Durchgriff greift; autark → nur Team-Membership).
- `countTeamAdmins` + Letzter-Admin-Guard.
- `approveRequest` team-scope-Mapping (admin/viewer statt trainer).

## 8. Migration-Sicherheit

- `team_member_role` RENAME VALUE: atomar, keine Datenmigration nötig.
- `invitation_role` ADD VALUE `'admin'`: additiv, keine bestehenden Rows betroffen.
- Backfill `teamMemberships`-Admin: `INSERT ... ON CONFLICT DO NOTHING` — idempotent, zerstörungsfrei.
- Reihenfolge: (1) ADD/RENAME enum values, (2) Backfill teamMemberships. RENAME VALUE und nachfolgende Inserts müssen in getrennten Statements laufen (PG erlaubt neue Enum-Werte erst nach Commit der ADD-Operation zu nutzen — RENAME ist davon nicht betroffen, ADD VALUE schon).

## 9. Risiken & offene Punkte

- **`invitation_role` ADD VALUE in Transaktion:** Postgres erlaubt das Verwenden eines per `ADD VALUE` hinzugefügten Enum-Werts nicht in derselben Transaktion. Drizzle-Migrationen laufen in einer Transaktion → der neue `'admin'`-Wert darf erst in einer *späteren* Migration/Statement genutzt werden. Da der Backfill nur `teamMemberships` (eigenes Enum, via RENAME bereits `admin`) schreibt, ist das unkritisch. Team-Invites mit `admin` entstehen erst zur Laufzeit, lange nach der Migration.
- **Bestehende `team-member`-Invites mit role=`trainer`:** Da `team_member_role` umbenannt wird, aber `invitation_role` ein separates Enum ist, bleiben offene Team-Invites mit `role='trainer'` gültig. Beim Einlösen mappt `acceptTeamMemberInvitation` `trainer`→ (nicht mehr existenter Team-Wert). **Mitigation:** Einmalige Datenmigration `UPDATE sponsor_invitations SET role='admin' WHERE kind='team-member' AND team_id IS NOT NULL AND role='trainer'`. Club-Invites (`club_id` gesetzt) bleiben `trainer`.
- **Pages mit `role === "trainer"`-Checks** (spieler/charges/spiel): prüfen `role === "admin" || role === "trainer"` für canEdit. Team-Admin hat jetzt `role='admin'` → canEdit greift weiterhin korrekt; der `trainer`-Zweig bleibt für Club-Scope relevant. Keine Änderung nötig.
