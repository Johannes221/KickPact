# Onboarding- & Identity-Logik — Implementierungsplan

**Datum:** 2026-05-29
**Design-Quelle:** [../specs/2026-05-29-onboarding-identity-logic-design.md](../specs/2026-05-29-onboarding-identity-logic-design.md)
**Status:** A/B/E/F umgesetzt (Tests grün). C/D zurückgestellt — siehe unten.

## Umsetzungsstand (2026-05-29)

- **A** ✓ `clubs.fussballde_verein_id` Unique gedroppt → Index. Migration `0030_drop_club_verein_unique.sql` (handgeschrieben, da ab 0014 alle Migrationen handgeschrieben sind; `db:generate` bricht wegen Snapshot-Kollision). Test-DB manuell migriert. **Neon: noch nicht angewandt — läuft via Coolify-Auto-Migrate beim Deploy.**
- **B** ✓ `lib/db/queries/onboarding-collision.ts` + `tests/lib/onboarding-collision.test.ts` (9 grün).
- **E** ✓ Sponsoren-Gate auf `clubs.verifiedAt` des Team-Containers + `tests/lib/sponsor-invite-gate.test.ts` (3 grün).
- **F** ✓ `clubs.verifiedAt` = einziges Withhold-Gate, team-Banner/Checklist umgestellt (22 grün inkl. withhold-release).
- **C/D** ⏸ ZURÜCKGESTELLT (Nutzer-Entscheidung) bis der parallele **Team-Rollen-Refactor** (Spec 2026-05-29 §5.1, Migrationen 0031/0032) fertig ist, um Doppelschreiben auf `create-draft-club.ts` zu vermeiden.

### ⚠️ Neue Pflicht für C (aus dem Parallel-Refactor)
`resolveTeamAccess` (lib/auth/scope.ts:79-141): autarke Mannschaften (eigene basic/pro-Lizenz, nicht unter Vereinslizenz) beziehen Zugriff **nur** aus `team_memberships`. Daher muss `create-draft-club` beim Anlegen/Adoptieren einer Solo-Mannschaft **zusätzlich eine `teamMemberships`-Admin-Row** für den Owner anlegen (Enum-Wert ist jetzt `admin`, nicht mehr `trainer`) — sonst ist der Owner aus seiner eigenen Mannschaft ausgesperrt. Decision 1 in B ist entsprechend bereits auf `teamMemberships.role='admin'` gebaut.

> ⚠️ Vor Wiederaufnahme von C: aktuellen Stand von `create-draft-club.ts`, `lib/actions/team-lifecycle.ts` und `lib/auth/scope.ts` neu lesen — der Parallel-Refactor kann sie verändert haben.

## Realitäts-Befunde (vor Umsetzung gefunden)

- **Befund 1 — „leicht andocken" ist aktuell unerreichbar:** Es gibt keinen automatischen Crawler/Seed, der unbetreute `teams`-Rows anlegt. Jede Team-Erstellung legt sofort einen Owner an. Der `scraped-unmanaged`-Zweig wird gebaut (zukunftssicher für Operator-Seeds `scripts/operations/onboard-real-club.ts`), feuert aber im Normalfluss heute nicht.
- **Befund 2 — Re-Parent ist nicht trivial:** `subscriptions` (PK `clubId`) und `team_licenses.subscriptionClubId` hängen am Verein. Adoption-TX muss neuen Container + Subscription + License anlegen und dann `teams.clubId` umhängen. `players`/`matches`/`team_memberships`/Crawl-Status/`pledges`/`charges.teamId` folgen via `teamId`. `invoices`/`charges.clubId`/`invoice_counters` bleiben am alten Container — irrelevant, weil adoptierte Teams keine Billing-Historie haben.

## Entscheidungen (gebacken in den Plan)

1. **Aktives Mitglied** = `clubMemberships` Rolle admin/trainer ODER `teamMemberships` Rolle trainer. Viewer zählt nicht.
2. **Re-Parent** = neuer Container + Subscription + teamLicense, dann `UPDATE teams.clubId`. Alter Seed-Container bleibt.
3. **teamVerifications** = deaktivieren/bypassen, Tabelle bleibt.
4. **Migration** = Unique auf `clubs.fussballde_verein_id` droppen → normaler Index.

## Workstreams (Abhängigkeiten & Parallelität)

| WS | Dateien | Hängt ab von | Parallel mit |
|---|---|---|---|
| **A** Schema | `lib/db/schema/clubs.ts` + Migration | — (Wurzel) | — (muss zuerst) |
| **B** Kollisions-Queries | NEU `lib/db/queries/onboarding-collision.ts` + Test | A | E, F |
| **C** create-draft Rewrite | `app/(onboarding)/onboarding/_actions/create-draft-club.ts` + Test | A, B | E, F |
| **D** Onboarding-UI | `verein-search-step.tsx`, `verein/_actions/search.ts`, neuer Action-Wrapper | B, C | E, F |
| **E** Sponsoren-Gate | `verein/[slug]/sponsoren/{page.tsx,_components/sponsors-manager.tsx,_actions/invitations.ts}` + Test | — | alle |
| **F** teamVerif-Deaktivierung | `lib/inngest/functions/generate-invoices.ts`, `lib/db/queries/verifications.ts`, team `layout.tsx`+`page.tsx` + Test | — | alle |

**Ausführung:** A zuerst (blockt B/C). E + F parallel als Agenten (schema-unabhängig, disjunkte Dateien). B→C→D sequenziell (Typen-Kette) selbst. Final: voller Typecheck + `npm test`.

## Detail

### A — Schema + Migration
- `clubs.ts:82`: `.unique()` entfernen, `index("clubs_fussballde_verein_idx").on(t.fussballdeVereinId)` ergänzen.
- `npm run db:generate`, generiertes SQL prüfen (Drop-Constraint-Name kontrollieren), `npm run db:migrate`.

### B — `lib/db/queries/onboarding-collision.ts` (NEU)
- `findLicensedVereinByFussballdeId(vereinId)` → `{clubId,clubSlug,clubName}|null` (clubs⋈teams⋈teamLicenses WHERE plan='verein', onboardingStatus='completed').
- `checkTeamCollision(fussballdeTeamId, saison)` → `{kind:"none"} | {kind:"scraped-unmanaged",teamId,clubId} | {kind:"actively-managed",teamId,clubId,clubSlug}` (aktives Mitglied per Entscheidung 1).
- `evaluateOnboardingTarget({...})` → `{license, collision}` (Promise.all).
- Test `tests/lib/onboarding-collision.test.ts`: inkl. „zwei Clubs gleicher vereinId" (beweist A), Viewer-Ausschluss.

### C — `create-draft-club.ts` Rewrite
- Verein-Dedup + Throw (`:78-104`) raus. Immer eigenen Container. Idempotenz per (user, vereinId) über clubMemberships.
- Branch je `checkTeamCollision`: none→bestehender Insert-Pfad; scraped-unmanaged→Adoption-TX (Befund 2); actively-managed→`{status:"requires-access-request"}`.
- `CreateDraftResult` als discriminated union.
- Test `tests/actions/onboarding-draft-actions.test.ts`: Foreign-Club-Throw-Assertion umschreiben, Adoption-, actively-managed-, Idempotenz-Fälle.

### D — Onboarding-UI
- `verein-search-step.tsx`: vor `createDraftClub` `evaluateOnboardingTarget` (Server-Action-Wrapper). license→Offer-Panel (anfragen vs. eigenständig). actively-managed→`/onboarding/zugriff-anfragen`. else→createDraftClub.
- `verein/_actions/search.ts:64-72`: „claimed"-Badge auf „hat aktive Vereinslizenz" umstellen (vereinId nun nicht mehr unique).

### E — Sponsoren-Gate
- `sponsoren/_actions/invitations.ts:14`: nach `assertClubWriteAccess` `clubs.verifiedAt` des Team-Containers prüfen; null→Fehler.
- `sponsoren/page.tsx`: `verifiedAt`/`canInvite` pro Team durchreichen.
- `sponsors-manager.tsx:152`: Button ausgegraut + CTA „Erst Verein verifizieren" (Link `/verein/{slug}/verifikation`) + Copy „Schützt deine Sponsoren — kein Geld an unverifizierte Vereine."
- Withhold-Netz unangetastet. Test `tests/lib/sponsor-invite-gate.test.ts`.

### F — teamVerifications deaktivieren (clubs.verifiedAt = einziges Gate)
- `generate-invoices.ts:236-252`: `verified = clubVerified` (allTeamsVerified-Klausel + involvedTeams-Query raus).
- team `layout.tsx:46`, `page.tsx:95`: Banner/Checklist auf Container-`clubs.verifiedAt` umstellen, Link→`/verein/{slug}/verifikation`.
- `verifications.ts`: `releaseWithheldInvoicesForTeam`/`approveTeamVerification` bleiben, aber nicht mehr als Gate aufgerufen. Test `tests/lib/verifications.test.ts` anpassen.

## Tests, die angepasst werden müssen
`tests/actions/onboarding-draft-actions.test.ts`, `tests/lib/verifications.test.ts`, `tests/lib/identity-routing.test.ts` (Mehrfach-Container je vereinId), neu: `onboarding-collision.test.ts`, `sponsor-invite-gate.test.ts`. E2E `tests/e2e/*onboarding*` als Follow-up.
