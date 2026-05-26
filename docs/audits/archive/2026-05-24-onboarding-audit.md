# Onboarding-Audit · 2026-05-24

**Trigger:** User-Bug-Report: „Dadellio" als Verein eingeloggt → öffnet
`/signup?role=mannschaft` → sieht erneut Signup-Form mit Google/Apple-Buttons.

**Status:** Aktive Codebase Stand commit `b55f786` (Onboarding-Auth-Fix
applied), Phase-A merged.

---

## 1. Entry-Points der Onboarding-Maschine

| Route | Layout-Guard | Page-Guard | Auth-Check vor Fix | Nach Fix |
|---|---|---|---|---|
| `/signup` (kein `?role`) | keiner | keiner | **fehlt** | ✓ redirect eingeloggter User |
| `/signup?role=mannschaft` | keiner | keiner | **fehlt** | ✓ redirect zu Add-Role-Target |
| `/signup?role=verein` | keiner | keiner | **fehlt** | ✓ |
| `/signup?role=sponsor` | keiner | keiner | **fehlt** | ✓ |
| `/login` | keiner | keiner | **fehlt** | ✓ redirect zu /dashboard |
| `/verify` | keiner | keiner | fehlt | ok (Info-Screen) |
| `/onboarding/verein/{1..4}` | `requireUser()` ✓ | keiner | ok | ok |
| `/onboarding/zugriff-anfragen` | (eigene Route) | `requireUser()` ✓ | ok | ok |
| `/sponsor/onboarding` | `requireUser()` ✓ | `requireUser()` ✓ | kein Skip-If-Profile | ✓ Skip-If-Profile |
| `/einladung/[token]` | keiner | keiner — public | ok (public-by-design) | ok |
| `/dashboard` | keiner | `requireUser()` ✓ | dispatcht via `pickDashboardDestination` | ok |
| `/select-role` | keiner | `requireUser()` + dispatcher | ok | ok |
| `/` (Landing) | keiner | keiner | ok (public) | ok |

---

## 2. Pro-Rolle-Flow-Matrix

### A. Verein-Admin

| Zustand → versucht | vor Fix | nach Fix |
|---|---|---|
| unauthenticated → `/signup?role=mannschaft` | Signup-Form (OK) | Signup-Form (OK) |
| unauthenticated → `/login` | Login-Form (OK) | Login-Form (OK) |
| auth, **keine Memberships** → `/signup?role=mannschaft` | **BUG**: Signup-Form | Redirect `/onboarding/verein/1` |
| auth, **Verein vorhanden** → `/signup?role=mannschaft` | **BUG**: Signup-Form | Redirect `/verein/{slug}` |
| auth, **Verein vorhanden** → `/signup?role=sponsor` | **BUG**: Signup-Form | Redirect `/sponsor/onboarding` (Add-Role) |
| auth, **Verein vorhanden** → `/login` | **BUG**: Login-Form | Redirect `/dashboard` |

### B. Sponsor

| Zustand → versucht | vor Fix | nach Fix |
|---|---|---|
| unauth → `/einladung/{token}` | OK | OK |
| auth, kein Sponsor-Profile → `/einladung/{token}` | OK | OK |
| auth, Sponsor-Profile da → `/sponsor/onboarding` | **BUG**: Form erneut | Redirect `/sponsor` (oder Pledge-Wizard mit invitation) |
| auth, Verein-Admin → `/signup?role=sponsor` | **BUG**: Signup-Form | Redirect `/sponsor/onboarding` |
| auth, Sponsor + Verein → `/dashboard` | OK (select-role) | OK |

### C. Trainer (Team-Membership, kein Club-Admin)

| Zustand → versucht | vor Fix | nach Fix |
|---|---|---|
| auth, **noch keine Membership-Anfrage** → `/onboarding/verein/1` | startet Verein-erstellen-Wizard (falsch für Trainer) | unverändert — gehört in eigenen Plan (Bug #8) |
| auth, **Trainer-Membership** → `/login` | **BUG** | Redirect zu Team-Deep-Link via /dashboard |
| auth, **Trainer-Membership** → `/signup` | **BUG** | Redirect zu Team-Deep-Link |

### D. Master-Admin (2+ Identities)

| Zustand | vor Fix | nach Fix |
|---|---|---|
| auth, 2+ Identities → `/login` | **BUG** | Redirect `/dashboard` → `/select-role` |
| auth, 2+ Identities → `/signup?role=X` | **BUG** | Wenn X vorhanden → Deep-Link; sonst Onboarding-Wizard für X |

### E. OAuth-Callbacks

| Kontext | callbackURL vor Fix | callbackURL nach Fix |
|---|---|---|
| Signup ohne Role | `/onboarding/verein/1` | `/onboarding/verein/1` |
| Signup `role=verein` | `/onboarding/verein/1` | `/onboarding/verein/1` |
| Signup `role=mannschaft` | `/onboarding/verein/1` | `/onboarding/verein/1` |
| Signup `role=sponsor` | `/onboarding/verein/1` ❌ | `/sponsor/onboarding` ✓ |
| Signup mit `?invitation=...` | `/sponsor/onboarding?invitation=...` | gleich |
| Login | `/dashboard` | gleich |

---

## 3. Bug-Katalog (Top-10)

### Bug #1 (HIGH) — `/signup` zeigt Signup-Form für eingeloggte User → FIXED

**File:** `app/(auth)/signup/page.tsx`
**Repro:** User loggt sich ein, navigiert zu `/signup?role=X` → bekommt erneut
Magic-Link/OAuth-Buttons. Direkter User-Bug.
**Fix:** `getServerSession()` + `pickAuthenticatedSignupDestination(identities, role)`.

### Bug #2 (HIGH) — `/login` zeigt Login-Form für eingeloggte User → FIXED

**File:** `app/(auth)/login/page.tsx`
**Fix:** redirect zu `/dashboard`.

### Bug #3 (MEDIUM) — `/sponsor/onboarding` zeigt Form auch wenn Profile exists → FIXED

**File:** `app/(sponsor)/sponsor/onboarding/page.tsx`
**Fix:** Skip-Check via Sponsor-Row-Query.

### Bug #4 (MEDIUM) — Potential Endless-Loop wenn `pickDashboardDestination` zu `/signup` redirected → FIXED

`/signup`-Page zeigt jetzt `AuthenticatedRoleChooser` statt zurück zu redirecten.

### Bug #5 (LOW) — OAuthButtons `callbackURL` bei `role=sponsor` → `/onboarding/verein/1` → FIXED

**File:** `components/auth/oauth-buttons.tsx`
**Fix:** neue `role`-Prop, callback bei `sponsor` → `/sponsor/onboarding`.

### Bug #6 (LOW) — MagicLinkForm Sponsor-Callback → `/sponsor` statt `/sponsor/onboarding` → FIXED

**File:** `components/auth/magic-link-form.tsx`
**Fix:** Sponsor-Signup-Callback nun auf `/sponsor/onboarding`.

### Bug #7 (MEDIUM, separate) — `finalizeOnboarding` Idempotenz nur via `fussballdeVereinId`

Audit-Note für Future. Out-of-Scope dieser Iteration.

### Bug #8 (HIGH, separate) — Kein dedicated Trainer-Onboarding-Pfad

Trainer landet im Admin-Wizard, würde neuen Verein anlegen. Eigener Plan
nötig — Out-of-Scope Hot-Fix.

### Bug #9 (LOW) — `/login`-Sub-CTA „Verein anlegen" zu spezifisch → FIXED zu „Account anlegen"

### Bug #10 (LOW) — Magic-Link liest invitation aus `window.location.search` (client-only)

Edge-case, kein Hot-Fix-Item.

---

## 4. Race-Conditions & State-Lecks (Notiz, kein Hot-Fix)

- Better-Auth-Cookie + Server-Component-Cache: in Production gelegentlich
  „Stale Auth"-Effekt nach OAuth-Login.
- Wizard-Schritt-2 fängt fehlende Query-Params aus Step-1 nicht ab.

---

## 5. Top-5-Priorisierung — alle FIXED

1. ✅ Bug #1 — `/signup` Auth-Check
2. ✅ Bug #2 — `/login` Auth-Check
3. ✅ Bug #3 — `/sponsor/onboarding` Skip-If-Exists
4. ✅ Bug #4 — Endless-Loop-Prävention (durch Add-Role-Chooser)
5. ✅ Bug #5 — OAuthButtons `role`-Prop

Bug #7 (Wizard-Race) und Bug #8 (Trainer-Onboarding) sind separate Plans.

---

## 6. Datei-Index der berührten Pfade

```
app/(auth)/login/page.tsx                                      ← Bug #2 #9
app/(auth)/signup/page.tsx                                     ← Bug #1 #4
app/(sponsor)/sponsor/onboarding/page.tsx                      ← Bug #3
components/auth/oauth-buttons.tsx                              ← Bug #5
components/auth/magic-link-form.tsx                            ← Bug #6 #10
lib/auth/signup-destination.ts                                 ← NEW helper
tests/lib/signup-destination.test.ts                           ← NEW unit tests
```

## 7. Akzeptanz-Kriterien (post-fix)

- [x] Eingeloggter User auf `/signup` → niemals Signup-Form.
- [x] Eingeloggter User auf `/login` → Redirect zu `/dashboard`.
- [x] Eingeloggter User auf `/signup?role=X` wo Rolle X bereits vorhanden → Dashboard für X.
- [x] Eingeloggter User auf `/signup?role=X` wo Rolle X NICHT vorhanden → Add-Role-Page.
- [x] Sponsor mit Profile auf `/sponsor/onboarding` → Redirect zu `/sponsor`.
- [x] OAuth-Buttons respektieren `?role=X` (Sponsor → `/sponsor/onboarding`).
- [x] Playwright deckt jeden Fall (Read-Only gegen Live + Unit-Tests).
