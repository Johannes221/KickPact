# Plan · Onboarding-Auth-Leak-Fix · 2026-05-24

**Audit:** [docs/audits/2026-05-24-onboarding-audit.md](../../audits/2026-05-24-onboarding-audit.md)
**Status:** IMPLEMENTIERT (commits `3ecbe0a`, `b55f786`, `8d52243`)
**Hot-Fix-Scope:** Bugs #1, #2, #3, #4, #5, #6, #9 aus dem Audit.

---

## 1. Ziel

Eingeloggte User bekommen niemals die Signup- oder Login-Form zu sehen. Sie
landen rolle-aware entweder auf ihrem Dashboard oder im **Add-Role-Flow**.

## 2. Decision-Trees pro Page

### `/login`

```
GET /login
├── getServerSession()
│    ├── session.user vorhanden
│    │    ├── ?invitation=... → /sponsor/pledge/new?invitation=...
│    │    └── sonst            → /dashboard (Smart-Dispatcher)
│    └── null → render Login-Form
```

### `/signup` (kein ?role)

```
GET /signup
├── getServerSession()
│    ├── kein User → 3-Wege-Role-Chooser (Sign-up wie heute, Links → /signup?role=X)
│    └── User vorhanden
│         └── pickAuthenticatedSignupDestination(identities, null)
│              ├── 0 Identities  → AuthenticatedRoleChooser (Tiles → Onboarding-Wizard direkt)
│              ├── 1 Identity    → Deep-Link
│              └── 2+ Identities → /select-role
```

### `/signup?role=X`

```
GET /signup?role=X
├── getServerSession()
│    ├── kein User → Magic-Link/OAuth-Form
│    └── User vorhanden
│         └── pickAuthenticatedSignupDestination(identities, X)
│              ├── X === sponsor → ids.sponsor ? /sponsor : /sponsor/onboarding
│              └── X ∈ {mannschaft, verein} →
│                       ids.clubs[0]    → /verein/{slug}
│                       ids.teamOnly[0] → /verein/{clubSlug}/mannschaft/{teamId}
│                       sonst           → /onboarding/verein/1
```

### `/sponsor/onboarding`

```
GET /sponsor/onboarding
├── requireUser()
├── sponsors-Row für user.id?
│    ├── ja → ?invitation=token ? /sponsor/pledge/new?invitation=token : /sponsor
│    └── nein → render SponsorTypeForm
```

### `/einladung/[token]` (Public, bleibt)

Keine Änderung. CTA-Logik: auth → `/sponsor/pledge/new?invitation=...`,
unauth → `/login?invitation=...`. Login redirected dann (siehe oben) direkt
zum Pledge-Wizard.

---

## 3. Helper: `lib/auth/signup-destination.ts`

Pure Funktion, ohne DB-Zugriff. Spiegelt `pickDashboardDestination`-Logik mit
optionalem `role`-Param. Vollständig unit-getestet
(`tests/lib/signup-destination.test.ts` → 13 Test-Cases).

```ts
export type AddRoleTarget = "mannschaft" | "verein" | "sponsor";

export function pickAuthenticatedSignupDestination(
  ids: UserIdentities,
  role: AddRoleTarget | null
): string;
```

## 4. File-by-File-Edits (implementiert)

| Datei | Änderung |
|---|---|
| `lib/auth/signup-destination.ts` | NEW: Helper |
| `tests/lib/signup-destination.test.ts` | NEW: 13 Unit-Tests |
| `app/(auth)/signup/page.tsx` | Auth-Check + Add-Role-Chooser für 0-Identities |
| `app/(auth)/login/page.tsx` | Auth-Check + Invitation-Forwarding + Copy-Fix |
| `app/(sponsor)/sponsor/onboarding/page.tsx` | Skip-If-Profile-Exists |
| `components/auth/oauth-buttons.tsx` | `role`-Prop, Sponsor-Callback → /sponsor/onboarding |
| `components/auth/magic-link-form.tsx` | Sponsor-Callback → /sponsor/onboarding |
| `tests/e2e/onboarding-flows.spec.ts` | NEW: 8 E2E-Suites |

## 5. Test-Plan

### Vitest (Unit)

`tests/lib/signup-destination.test.ts` (13 Cases):
- kein Role + 0/1/2+ Identities
- role=sponsor mit/ohne Sponsor-Profile
- role=verein/mannschaft mit Club / Team-Only / nichts

### Playwright (E2E) — `tests/e2e/onboarding-flows.spec.ts`

8 Test-Suites, alle Read-Only-Tests gegen Live:

| Suite | Coverage |
|---|---|
| A — /signup unauth | Role-Chooser + 3 Per-Role-Forms |
| B — /login unauth | Form + Account-anlegen-CTA |
| C — Auth-Guards | /onboarding/verein/*, /sponsor/*, /dashboard, /select-role |
| D — /einladung public | Invalid-Token-Errorpage |
| E — Wizard-Step-1 Smoke | Rendert, kein 500 |
| F — Auth-Leak-Bug | Invalid-Cookie-Behavior, Baseline-Unauth |
| G — Sponsor-Pfade | /discover, /pledge/new |
| H — Realistic-Data | FC Dossenheim, TSG Schriesheim, SG Neuenheim (skipped) |

**Backlog für vollen Flow:** Test-Auth-Bypass per Header oder Test-Magic-Link-
Endpoint. Wird in separatem Plan adressiert.

## 6. Manuelle Live-Verifikation nach Deploy

User-gewünschte Mannschaften: **FC Dossenheim**, **TSG Schriesheim**,
**SG Neuenheim** (echte DFB-Heidelberg-Land-Vereine).

1. Logout, `/signup?role=verein` → Form sichtbar.
2. Magic-Link mit Mailtrap-Inbox, Wizard durchlaufen mit "Dossenheim".
3. Same Session: `/signup?role=mannschaft` → muss redirecten zu `/verein/{slug}` ← **Bug-Fix-Verifikation**.
4. `/signup?role=sponsor` → muss redirecten zu `/sponsor/onboarding` (Add-Role).
5. `/login` → muss redirecten zu `/dashboard`.

## 7. Commit-Reihenfolge (umgesetzt)

1. `feat(auth): pickAuthenticatedSignupDestination helper + tests` — 3ecbe0a
2. `fix(auth): redirect authenticated users from /signup, /login + sponsor onboarding` — b55f786
3. `test(e2e): onboarding flows + auth-redirect verification` — 8d52243

## 8. Risiken & bekannte Restprobleme

- **Identity-Snapshot kostet eine DB-Query pro Signup-Page-Render.** Akzeptabel —
  niedriger Traffic.
- **Endless-Loop bei broken `pickDashboardDestination`** durch Add-Role-Chooser
  abgefangen.
- **Bug #7 (Wizard-Idempotenz):** separate Plan.
- **Bug #8 (Trainer-Onboarding-Pfad):** separater Plan, eigene Route nötig.
- **Bug #10 (Magic-Link liest `window.location.search`):** Edge-Case, nicht fixed.
