# Onboarding Rebuild — KickPact

**Status:** Draft, awaiting approval
**Author:** Claude (based on user incident 2026-05-25)
**Trigger:** Production-User (johannes.schartl@gmail.com) durchläuft Onboarding 20× im Kreis. PDF-Upload-Fehler in Step 4 zerstört State, danach „Wie willst du starten?" wieder oben. Mannschaft verschwindet. Login-Page sichtbar trotz Session. Doppelte Navigations-Items. Manuelle Saisonergebnis-Eingabe wo Crawler scrapen sollte.

---

## 1. Problem-Statement (warum bisher kaputt)

| Symptom | Root Cause |
|---|---|
| „Wie willst du starten?" kommt nach abgebrochener Onboarding-Session zurück | `finalizeOnboarding()` in [finalize.ts:38](app/(onboarding)/onboarding/verein/_actions/finalize.ts:38) wird **erst nach Step 5** aufgerufen. Bis dahin lebt aller State in URL-Params. Step 4 (PDF Verifikation) wirft Fehler → User schließt Tab → DB ist leer → `getUserIdentities()` liefert 0 Identities → `pickAuthenticatedSignupDestination()` zeigt `AuthenticatedRoleChooser`. |
| Mannschaft verschwindet | Selbes Problem: kein `teams`-Insert vor finalize. |
| Pricing-Step nervt obwohl Trial sowieso gratis | [team-plan-step.tsx:290–325](app/(onboarding)/onboarding/verein/_components/team-plan-step.tsx:290) erzwingt Plan-Wahl + Billing-Cycle (`monthly`/`season`). Bei 30-Tage-Trial ohne Zahlungsdaten ist die Entscheidung verfrüht und drückt User in Pricing-Vergleichs-Modus → Friction. |
| Doppeltes „Abo" + „Einstellungen" | [verein/[slug]/layout.tsx](app/(verein)/verein/[slug]/layout.tsx) wraped IMMER Mannschaft-Pages → `VereinSubNav` rendert. Darunter `TeamSubNav` mit denselben Tabs. |
| Saisonergebnis manuell | [season-result-form.tsx](app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/season-result-form.tsx) auf der Übersicht erwartet manuelle Eingabe. Fußball.de-Crawler existiert ([lib/crawler/](lib/crawler/)) ist aber nicht angeschlossen. |
| Login-Page trotz Session sichtbar | [login/page.tsx:22–34](app/(auth)/login/page.tsx:22) HAT den Redirect-Check. Aber: irgendwer linkt nach erfolgreicher Auth zurück nach `/login` (Magic-Link-Callback?) ODER better-auth Cookie wird SSR-side intermittent als `null` gelesen. Genauer Trace nötig. |

---

## 2. Architektur-Entscheidungen (user-confirmed 2026-05-25)

1. **Mannschaft-Default → Pro Trial** (nicht Basic).
2. **Saisonergebnis-Form weg, Crawler übernimmt** — Manuell-Override nur in Mannschafts-Einstellungen.
3. **Mannschaft-only (basic/pro): Verein-Nav komplett ausblenden.** Vereins-Plan: Verein-Nav bleibt, aber Team-SubNav verliert `Abo`/`Einstellungen` (sind club-level).
4. **Draft-Persistence ab Step 1.** Sobald Verein gewählt ist, wird Club + Team + Trial-Subscription in DB angelegt mit `onboarding_status = 'draft'`. Resume-Route `/onboarding` springt zur letzten unvollständigen Step.

---

## 3. Neuer Flow (Sollzustand)

### 3.1 Routen & Schritte

```
/onboarding                          → Resume-Dispatcher (entscheidet basierend auf Draft-State)
/onboarding/mannschaft/verein        → Step 1m — Verein-Suche + EINE Mannschaft wählen
/onboarding/mannschaft/stammdaten    → Step 2m — Adresse + IBAN (optional)
/onboarding/mannschaft/sponsoren     → Step 3m — Einladungs-Link teilen → fertig

/onboarding/verein/verein            → Step 1v — Verein-Suche + MEHRERE Mannschaften (Multi-Select)
/onboarding/verein/stammdaten        → Step 2v — Adresse + IBAN
/onboarding/verein/sponsoren         → Step 3v — Einladungs-Links pro Team teilen → fertig

/onboarding/sponsor                  → bleibt wie ist (sponsor flow ist nicht im Scope)
```

**Was wegfällt:**
- Plan-Wahl (war Step 2 alt)
- Billing-Cycle-Wahl
- Verifikations-Step (PDF-Upload) → wird **asynchron nach Onboarding** angeboten als Banner im Dashboard. Onboarding-Abschluss hängt nicht mehr daran.

### 3.2 Draft-Persistence

**Step 1 (verein):**
- Server-Action `createDraftClub({ vereinId, vereinName, teamIds[] })`:
  - Insert `clubs` mit `onboardingStatus = 'draft'`, `onboardingRole`, minimaler Daten.
  - Insert `clubMemberships` (user als admin).
  - Insert `subscriptions` (status `trialing`, trialEndsAt = +30 Tage, billingCycle = `monthly` als Placeholder, stripeCustomerId = null).
  - Insert `teams` für jede gewählte Mannschaft.
  - Insert `teamLicenses` mit Plan = `pro` (mannschaft) bzw `verein` (verein), Status `trialing`.
  - Insert `invitations` (pro Team eine).
- Redirect → `/onboarding/[role]/stammdaten`

**Step 2 (stammdaten):**
- Server-Action `updateDraftStammdaten({ clubId, contactName, street, zip, city, isSmallBusiness, taxId?, iban? })`:
  - Update `clubs` (address, taxId, isSmallBusiness, iban).
  - Set `onboardingStatus = 'stammdaten_complete'`.
- Redirect → `/onboarding/[role]/sponsoren`

**Step 3 (sponsoren):**
- Zeigt Einladungs-Links + Copy-Buttons + WhatsApp/Email/QR.
- „Fertig"-Button → Server-Action `completeOnboarding({ clubId })`:
  - Set `onboardingStatus = 'completed'`.
- Redirect → Dashboard.

**Resume:**
- `/onboarding`-Page: liest aktiven Draft-Club des Users (`onboardingStatus != 'completed'`).
- Wenn Draft existiert → Redirect zur passenden Step.
- Wenn kein Draft → Redirect zu `/onboarding/[role]/verein` (Role aus Query-Param oder aus letzter Session).
- Wenn `onboardingStatus = 'completed'` → Redirect zu `/verein/[slug]`.

### 3.3 Verifikation-Banner statt Verifikation-Step

- Im `VereinLayout` (existiert bereits) zeigt `VerificationBanner` schon „Verein noch nicht verifiziert".
- User kann anytime durchklicken → eigene Verifikation-Page `/verein/[slug]/verifikation` (existiert noch nicht, neu).
- Banner ist non-blocking. Trial läuft trotzdem.

### 3.4 Saisonergebnis (manuell → scrape)

**Scope dieses Plans (light):**
- Form aus [page.tsx der Mannschafts-Übersicht](app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx) entfernen.
- Form-Komponente nach `_components/season-result-form.tsx` weg, neu mounten in `/verein/[slug]/mannschaft/[teamId]/einstellungen/saison/page.tsx` als „Manueller Override" mit Hinweis „Normalerweise scraped der Crawler".
- Übersicht zeigt stattdessen den aktuellen Tabellenplatz (aus letztem Crawl) read-only.

**Außerhalb dieses Plans:**
- Inngest-Cron-Job der Fußball.de am Saisonende scrapt → eigener Plan `2026-XX-XX-season-result-crawler.md`.

### 3.5 Nav-Cleanup

- **Erweitere [verein/[slug]/layout.tsx](app/(verein)/verein/[slug]/layout.tsx)**: prüfe ob die User-Identity für diesen Club ein basic/pro Team-Only-Plan ist UND ob der Pathname eine Mannschaft enthält. Wenn ja → render NUR `{children}` (kein Verein-Header, keine `VereinSubNav`).
- **Erweitere [team-sub-nav.tsx](app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx)**: TABS-Array wird zur Funktion, die `effectivePlan` als Argument nimmt — bei `verein` werden `Abo`+`Einstellungen` rausgefiltert.

### 3.6 Login-Bug (Investigation)

- Reproduzierbare Steps fehlen. Bestes Vorgehen:
  - Bei Magic-Link-Callback ([components/auth/magic-link-form.tsx](components/auth/magic-link-form.tsx)) tracken ob nach Auth ein Bounce nach `/login` passiert.
  - In `getServerSession()` ein temp-debug-log einbauen das in Sentry/Console loggt wenn session.user.id existiert und der Pfad `/login` war.
  - Marketing-Header (`PublicHeader`/`MarketingHeader`?) prüfen: Link „Login" → wenn session existiert → besser auf `/dashboard` umlenken oder als „Dashboard" labeln.

→ **Sub-Task in Phase 5**, nicht-blockierend für Onboarding-Rebuild.

---

## 4. Schema-Migration

### 4.1 Neue Enums + Felder auf `clubs`

```typescript
// lib/db/schema/clubs.ts
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "draft",
  "stammdaten_complete",
  "completed"
]);

export const onboardingRoleEnum = pgEnum("onboarding_role", [
  "mannschaft",
  "verein"
]);

export const clubs = pgTable("clubs", {
  // ...existing fields...
  onboardingStatus: onboardingStatusEnum("onboarding_status")
    .notNull()
    .default("completed"), // bestehende Clubs sind completed
  onboardingRole: onboardingRoleEnum("onboarding_role")
    .notNull()
    .default("verein"), // bestehende Clubs default verein (sicher)
  onboardingStartedAt: timestamp("onboarding_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true })
});
```

### 4.2 Bestehende Felder nullable machen

Damit Step 1 mit nur Verein-Daten reichen kann, müssen folgende Felder nullable sein:
- `clubs.ort` (ist's vermutlich schon)
- `clubs.addressJson` (vermutlich nullable)
- `clubs.taxId`, `clubs.iban` (nullable)

→ vor Migration: `lib/db/schema/clubs.ts` lesen und confirmen.

### 4.3 `subscriptions.billingCycle` Placeholder

`billingCycle = 'monthly'` als Default für Draft. Wird beim ersten echten Stripe-Checkout später überschrieben. Kein Schema-Change nötig.

### 4.4 Migration-Generierung

```bash
npm run db:generate    # generiert SQL-Migration
# Review der Migration in drizzle/
npm run db:migrate     # auf DB anwenden
```

### 4.5 Backfill (für bestehende Production-Daten)

Migration enthält automatisch `DEFAULT 'completed'` und `DEFAULT 'verein'` → bestehende Clubs sind out-of-the-box im richtigen Zustand.

---

## 5. Konkrete Code-Changes (File-Liste)

### 5.1 NEU

```
app/(onboarding)/onboarding/page.tsx                                  Resume-Dispatcher
app/(onboarding)/onboarding/mannschaft/layout.tsx                     Wizard-Shell (3 Steps)
app/(onboarding)/onboarding/mannschaft/verein/page.tsx                Step 1m
app/(onboarding)/onboarding/mannschaft/verein/_components/...         Suche + 1-Team-Select
app/(onboarding)/onboarding/mannschaft/stammdaten/page.tsx            Step 2m
app/(onboarding)/onboarding/mannschaft/sponsoren/page.tsx             Step 3m
app/(onboarding)/onboarding/verein/verein/page.tsx                    Step 1v (Multi-Team-Select)
app/(onboarding)/onboarding/verein/stammdaten/page.tsx                Step 2v
app/(onboarding)/onboarding/verein/sponsoren/page.tsx                 Step 3v
app/(onboarding)/onboarding/_actions/create-draft-club.ts             Server-Action Step 1
app/(onboarding)/onboarding/_actions/update-draft-stammdaten.ts       Server-Action Step 2
app/(onboarding)/onboarding/_actions/complete-onboarding.ts           Server-Action Step 3
app/(onboarding)/onboarding/_components/wizard-shell.tsx              Gemeinsame Shell (Progress, Header)
app/(verein)/verein/[slug]/mannschaft/[teamId]/einstellungen/saison/page.tsx   Manual Override
app/(verein)/verein/[slug]/verifikation/page.tsx                      Async-Verifikation
lib/db/queries/onboarding-draft.ts                                    Draft-Query-Layer
```

### 5.2 GELÖSCHT (oder Inhalt komplett ersetzt)

```
app/(onboarding)/onboarding/verein/1/                                 alte Step 1
app/(onboarding)/onboarding/verein/2/                                 alte Step 2 (Plan+Cycle weg)
app/(onboarding)/onboarding/verein/3/                                 alte Step 3 (Stammdaten ersetzt)
app/(onboarding)/onboarding/verein/4/                                 alte Step 4 (PDF-Verifikation weg aus Wizard)
app/(onboarding)/onboarding/verein/5/                                 alte Step 5 (Sponsoren — Logik wandert in neuen Step)
app/(onboarding)/onboarding/verein/_components/team-plan-step.tsx     komplett weg
app/(onboarding)/onboarding/verein/_actions/finalize.ts               ersetzt durch 3 Actions
app/(onboarding)/onboarding/verein/_components/verification-form.tsx  raus aus Wizard, evtl. reuse in /verifikation
app/(onboarding)/onboarding/verein/_components/invite-step.tsx        Logik wandert in neue Step 3 (mit Anpassungen)
app/(onboarding)/onboarding/verein/_components/stammdaten-step.tsx    Logik wandert in neue Step 2
```

### 5.3 GEÄNDERT

```
lib/db/schema/clubs.ts                                                onboarding_status/role/timestamps
lib/db/schema/index.ts                                                Re-Export der neuen Enums
lib/auth/identity-routing.ts                                          Skip Clubs with onboardingStatus != 'completed' (oder leite die zum Draft)
lib/db/queries/user-identities.ts                                     Filter Draft-Clubs raus (oder als separate Liste)
app/(auth)/signup/page.tsx                                            ADD_ROLE_HREF: mannschaft → /onboarding/mannschaft/verein, verein → /onboarding/verein/verein
app/(auth)/login/page.tsx                                             Sicherstellen dass session.user redirect nicht failt (Log einbauen)
components/auth/magic-link-form.tsx                                   Wenn role gesetzt → callback-URL → /onboarding/[role]/verein
app/(verein)/verein/[slug]/layout.tsx                                 Bedingtes Rendering bei basic/pro auf Mannschaft-Pfad
app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx   Tabs-Funktion mit Plan-Filter
app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx               season-result-form raus, read-only Tabellen-Status rein
```

### 5.4 TESTS

```
tests/onboarding/draft-persistence.test.ts                            Schritte 1+2 separat persistieren, Resume funktioniert
tests/onboarding/role-routing.test.ts                                 mannschaft vs verein flow Routing
tests/db/queries/onboarding-draft.test.ts                             Draft-Queries
tests/auth/identity-routing.test.ts                                   Draft-Clubs werden nicht als Identities aufgelistet
```

---

## 6. Implementation-Phasen (Reihenfolge)

| Phase | Inhalt | Sicherheit |
|---|---|---|
| **P1: Schema + Queries** | Migration, neue Felder, `lib/db/queries/onboarding-draft.ts`, Tests | Backwards-compatible (Defaults) |
| **P2: Server-Actions** | 3 neue Actions (create-draft / update-stammdaten / complete), Tests | Noch keine Route ändert sich |
| **P3: Neue Wizard-Routes** | Komplette neuen Routen unter `/onboarding/mannschaft/*` und `/onboarding/verein/*` | Alte `/onboarding/verein/1..5/` bleibt vorerst parallel — wir vergleichen Verhalten |
| **P4: Cutover** | Alte Routen löschen, `signup/page.tsx` ADD_ROLE_HREF umstellen, magic-link callback URL anpassen, Resume-Dispatcher live | Klare Atomic-Commit-Grenze |
| **P5: Nav-Cleanup** | Verein-Layout-Bedingtes-Render, Team-SubNav-Filter | Unabhängig vom Onboarding |
| **P6: Saisonergebnis** | Form aus Übersicht entfernen, in Einstellungen verschieben, read-only Tabelle in Übersicht | Unabhängig |
| **P7: Login-Bug** | Tracing/Log, Marketing-Header fix | Investigation-Phase, Output kann zweiter Plan sein |

Jede Phase ist commit-bar und in CI testbar.

---

## 7. Acceptance Criteria

**Funktional:**
- [ ] Neuer User registriert sich als Mannschaft → durchläuft 3 Steps → landet auf `/verein/[slug]/mannschaft/[teamId]`.
- [ ] Neuer User registriert sich als Verein → wählt 3 Mannschaften aus → durchläuft 3 Steps → landet auf `/verein/[slug]` mit 3 Teams sichtbar.
- [ ] User schließt Tab mitten in Step 2 → kommt mit neuem Login zurück → wird durch `/onboarding` zu Step 2 mit vorbefüllten Daten weitergeleitet.
- [ ] User sieht KEINE Plan-Auswahl, KEINE Billing-Cycle-Frage, KEIN PDF-Upload während Onboarding.
- [ ] User mit basic/pro Plan sieht auf `/verein/[slug]/mannschaft/[teamId]` NUR die Team-SubNav (keine Verein-Nav).
- [ ] User mit Vereinslizenz sieht auf `/verein/[slug]/mannschaft/[teamId]` BEIDE Navs, aber Team-SubNav ohne `Abo`+`Einstellungen`.
- [ ] Mannschafts-Übersicht zeigt KEIN „Saison-Ergebnis eintragen"-Formular mehr. Manual-Override ist nur unter Einstellungen → Saison erreichbar.
- [ ] Bestehende Production-Clubs sind nach Migration im Status `completed` und ohne Verhaltens-Änderung sichtbar.

**Technisch:**
- [ ] Vitest-Suite grün.
- [ ] E2E-Tests für die zwei neuen Wizards (mannschaft + verein) bestehen.
- [ ] Schema-Migration ist reversibel (mit Down-Migration).

---

## 8. Risiken / Offene Fragen

| Risiko | Mitigation |
|---|---|
| Bestehende Production-User mitten im alten Flow | Beim Cutover: Alle Clubs mit `onboardingStatus = 'completed'` Default. Wer im alten Flow war hat den ohnehin fast immer abgeschlossen (sonst keinen Club). |
| `getUserIdentities()` listet Draft-Clubs als Identities → User landet im halb-fertigen Dashboard | `getUserIdentities()` filtert `onboardingStatus = 'completed'`. Draft-Clubs leben separat, nur über `/onboarding` resume-bar. |
| Multi-Team Step 1v: User wählt 5 Mannschaften → 5 `teamLicenses` mit `pro`-Plan-Slots blow up Stripe-Pricing | Vereinslizenz = ein einziger `teamLicenses`-Plan = `verein`. Mehrere Teams aber EINE License-Slot. Klären beim Implementieren. Vermutlich: 1 subscription pro Verein, N `teamLicenses` mit plan=`verein`. |
| Login-Bug bleibt unfixiert | Phase 7 als separater Plan akzeptabel, weil orthogonal. |
| User-Identity-Cache | Beim Resume-Dispatcher nach completeOnboarding sicherstellen dass `revalidatePath('/dashboard')` aufgerufen wird. |

---

## 9. Was NICHT in diesem Plan ist

- Inngest-Crawler für Saisonergebnis (separater Plan).
- FOMO-Email-Reminders bei Trial-Ende (separater Plan, vom User erwähnt).
- Pricing-Page-Redesign (nicht angefasst).
- Sponsor-Onboarding (out of scope).
- Login-Bug-Fix (Phase 7 als Investigation, evtl. eigener Plan danach).

---

## 10. Ablauf nach Approval

1. User approved diesen Plan.
2. Phase 1 (Schema) — Plan, Migration, Code, Tests, Commit.
3. Phase 2 (Actions) — Code, Tests, Commit.
4. Phase 3 (neue Routes parallel) — Code, manuell smoke-tested via Dev-Server, Commit.
5. Phase 4 (Cutover) — Lösch-Commits, ROllout-Test, Commit.
6. Phase 5+6 — kleinere Commits.
7. Phase 7 — separater Investigation-Commit oder Plan.

Jeder Commit grün durch Test-Suite, jeder Phase-Abschluss durch User-Review.
