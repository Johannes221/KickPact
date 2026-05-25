# Gap-Fix Roadmap — KickPact

**Datum:** 2026-05-25
**Basis:** [`docs/audits/2026-05-25-feature-catalog-gap-analysis.md`](../../audits/2026-05-25-feature-catalog-gap-analysis.md)
**Status:** Roadmap aktiv. Plan 0 teilweise umgesetzt in dieser Session.

> Sammelt die im Feature-Katalog & Gap-Analyse identifizierten P0/P1-Lücken und gruppiert sie nach Implementations-Aufwand & thematischer Kohärenz. Jeder Plan ist eine eigene Session.

---

## Übersicht der Plans

| Plan | Domain | Status | P0-Items | P1-Items |
|---|---|---|---|---|
| **0** | Quick-Wins (Konto, Cookie, DSGVO-UI) | ✅ Diese Session | 3 | – |
| **1** | Filter-Reporting (Verein-weit Charges/Pledges/Sponsoren) | 🟡 Plan vorhanden ([→](#plan-1)) | 2 | 3 |
| **2** | Sponsor-Bilanz & Charge-History | 🟡 Plan vorhanden ([→](#plan-2)) | 2 | 2 |
| **3** | Mannschafts-Lifecycle (Team hinzufügen, Saison-Wechsel, Spieler-Opt-out) | 🟡 Plan vorhanden ([→](#plan-3)) | 2 | 3 |
| **4** | Plattform-KPI-Admin | 🟡 Plan vorhanden ([→](#plan-4)) | 1 | 5 |
| **5** | Pagination-Toolkit (cross-cutting) | 🟡 Plan vorhanden ([→](#plan-5)) | 1 | – |
| **6** | Notifications & Operativer Polish | 🟡 Plan vorhanden ([→](#plan-6)) | – | 8 |

**Bereits existierende Plans, die Lücken decken:**

| Existing Plan | Deckt Lücke aus Gap-Doc |
|---|---|
| [2026-05-25-team-centric-dashboard.md](2026-05-25-team-centric-dashboard.md) | Team-Tabs inkl. Pacts-Filter (3.3.x, 4.3.x teilweise) |
| [2026-05-25-onboarding-rebuild.md](2026-05-25-onboarding-rebuild.md) | Onboarding-State, Draft-Persistence (4.1.8) |
| [2026-05-25-phase-e1-verification-schema-upload.md](2026-05-25-phase-e1-verification-schema-upload.md) | Verifikations-Workflow (4.13) |
| [2026-05-25-phase-e2-admin-tooling-and-banners.md](2026-05-25-phase-e2-admin-tooling-and-banners.md) | Admin-Verifikations- & Konflikt-Queue (8.1–8.10) |
| [2026-05-24-phase1-go-live-blockers.md](2026-05-24-phase1-go-live-blockers.md) | Stripe-Lazy-Customer, Squad-Auth, Invitation-Expiry (4.7.4) |

---

## Plan 0 — Quick-Wins (UMGESETZT in dieser Session, 2026-05-25)

**Ziel:** Server-Actions, die existieren aber UI-unverdrahtet sind, sichtbar machen + DSGVO-Pflichtelemente liefern.

**Geliefert:**

- ✅ `app/konto/page.tsx` — neue „Mein Konto"-Seite mit Profil, Rollen-Übersicht, Sicherheit, Daten & Privatsphäre
- ✅ `app/konto/_components/data-privacy-actions.tsx` — Client-Buttons für `requestDataExport` + `requestAccountDeletion` mit Confirm-Dialog
- ✅ `app/konto/_components/deletion-banner.tsx` — Warn-Banner mit Countdown + `cancelAccountDeletion`-Button
- ✅ `components/auth/header-user-menu.tsx` — Desktop-Header bekommt „Mein Konto"-Eintrag
- ✅ `components/shared/mobile-nav.tsx` — Mobile-Burger bekommt „Mein Konto"-Eintrag
- ✅ `components/shared/cookie-banner.tsx` + Mount in `app/layout.tsx` — Erstbesucher-Hinweis mit Plausible-Erläuterung
- ✅ `lib/actions/dsgvo.ts` — `revalidatePath`-Target von `/sponsor/profil` auf `/konto` korrigiert

**Effekt auf Gap-Doc:**
- P0 #1 (Konto-Seite + DSGVO-UI): **closed**
- P0 #10 (Cookie-Banner): **closed**
- P2 #25 ("Theme/Sprache"): bleibt offen — nicht in Plan 0
- Active-Sessions-Display: rudimentär (Counter) — full „Logout-All" + Login-Historie verbleiben in Plan 6.

---

## Plan 1 — Filter-Reporting

**Adressiert:** Gap-Doc P0 #2, #4 + P1 Filter-Items.

**Scope:**
- `/verein/[slug]/charges` — neue Seite, Tabelle mit Filtern (Team, Sponsor, Trigger-Type, Periode, Status), Sortierung pro Spalte, Pagination
- `/verein/[slug]/pledges` — analog, plus „aktiv/pausiert/beendet"-Filter, Sortierung nach Cap-Auslastung
- `/verein/[slug]/sponsor/[sponsorId]` — Sponsor-Detail-Seite im Verein: welche Teams, wieviel pro Trigger, History
- CSV-Export-Endpoint pro Tabelle (Server-Route `/api/exports/charges`, `/api/exports/pledges`)
- Reuse: Pagination-Toolkit aus Plan 5

**Neue Queries:**
- `lib/db/queries/club-reporting.ts` — `listChargesForClub`, `listPledgesForClub`, `getSponsorOverviewForClub`
- Alle Queries akzeptieren ein `Filter`-Object + `Pagination` (siehe Plan 5)

**Neue Komponenten:**
- `components/shared/filter-bar.tsx` — wiederverwendbare URL-State-Filter-Leiste (`useSearchParams`)
- `components/shared/sortable-table.tsx` — Klick-Header für Sortierung
- `components/shared/csv-export-button.tsx`

**Aufwand:** L (1 Session, ~6–8 Tasks)

---

## Plan 2 — Sponsor-Bilanz & globale Charge-History

**Adressiert:** Gap-Doc P0 #3 + Sponsor-Cross-Cutting (3.8.x).

**Scope:**
- `/sponsor/bilanz` — neue Seite: Monats/Jahr/Saison/All-Time-Stats, pro Verein, pro Team, pro Trigger-Typ
- `/sponsor/charges` — globale Charge-History mit Filter (Verein, Team, Trigger, Periode, Status), Pagination
- Sponsor-Dashboard erweitert: „Cap-Auslastung pro Pledge"-Tile, Jahres-Total-Tile
- CSV-Export für Sponsor-Charges

**Neue Queries:**
- `lib/db/queries/sponsor-reporting.ts` — `getSponsorBalance(sponsorId, range)`, `listChargesForSponsor`
- Aggregationen via Drizzle `sql` mit DATE_TRUNC für Periode-Grouping

**Aufwand:** M (1 Session, ~5 Tasks)

---

## Plan 3 — Mannschafts-Lifecycle

**Adressiert:** Gap-Doc P0 #4 + #5 + Spieler-Roster (4.3.7–4.3.16) + Match-Events editieren (4.4.8, 4.4.11).

**Scope:**
- `/verein/[slug]/mannschaften/neu` — neuer Team-Wizard (Fußball.de-Suche, Saison-Select, optional Plan)
- `/verein/[slug]/mannschaft/[teamId]/spieler` — Spieler-Roster-UI mit Block-Toggle (DSGVO Opt-out)
- Public Spieler-Opt-out unter `/spieler-opt-out` (Token-basiert, ohne Login)
- Server-Action `deactivateTeam`, `reactivateTeam`, `renameTeam`
- Match-Event-Editor erweitert: Edit & Delete per Event (Trainer scope)
- Manuelles Match-Ergebnis-Override pro Match
- Saison-Renewal-Flow für Pledges (am Saisonende: „verlängern auf nächste Saison?")
- Logo-Upload UI (statt URL) — reuse `lib/storage/documents.ts` aus Phase E1

**Neue Schema:**
- Keine neuen Tabellen — bestehende Spalten reichen (`teams.isActive`, `players.blocked`, `clubs.logoUrl`)

**Neue Queries:**
- `lib/db/queries/team-lifecycle.ts` — `createTeamForExistingClub`, `deactivateTeam`, `listPlayersForTeam`, `togglePlayerBlock`
- `lib/db/queries/match-events-edit.ts` — `updateMatchEvent`, `deleteMatchEvent`
- `lib/db/queries/season-renewal.ts` — `findPledgesEligibleForRenewal`, `clonePledgeForNextSeason`

**Inngest-Erweiterung:**
- `season-renewal-prompts` — neue Job, schickt Sponsoren am Saisonende Renewal-Mails

**Aufwand:** XL (2 Sessions, ~12 Tasks)

---

## Plan 4 — Plattform-Admin (KPI + Operations)

**Adressiert:** Gap-Doc P0 #7 + Plattform-Admin-Sektion (8.x).

**Scope:**
- `/admin/dashboard` — Plattform-KPIs: aktive Vereine, MRR, Trial→Paid Conversion, Churn, durchschnittl. €/Pledge, Top-Trigger
- `/admin/vereine` — Vereine-Liste mit Filter (Status, Plan, Region, Verifizierung), Detail-Drill-Down
- `/admin/users` — User-Liste, Detail mit allen Rollen + Pledges + Subscriptions
- `/admin/crawler` — Crawler-Health: letzter Lauf pro Team, Erfolgsrate, Drift-Warnungen, Manual-Re-Crawl-Button
- `/admin/stripe` — Stripe-Status: failed payments, past_due Subs, Webhook-Latenz
- `/admin/mail` — Mail-Bounces (Resend-API), Wiederversand-Button
- Server-Actions: `setClubBlocked`, `triggerCrawl`, `resendInvoice`, `revokeVerification`
- ENV-Allowlist via `KICKPACT_ADMIN_EMAILS` (existiert bereits aus Phase E2)

**Neue Queries:**
- `lib/db/queries/platform-stats.ts` — alle KPI-Aggregationen
- `lib/db/queries/crawler-health.ts` — letzte `crawledAt`-Timestamps, success/fail counts

**Aufwand:** L (1.5 Sessions, ~10 Tasks)

---

## Plan 5 — Pagination-Toolkit (Cross-Cutting)

**Adressiert:** Gap-Doc P0 #6.

**Scope:**
- `components/ui/data-table.tsx` — generische Tabelle mit URL-State-Pagination (page, pageSize), Sortierung, Filtern
- `lib/db/queries/_helpers/paginate.ts` — Helper für Drizzle: `paginate(query, { page, pageSize })`
- `components/ui/pagination.tsx` ist schon da — wird in `data-table.tsx` reused
- Sample-Migration: bestehende Listen migrieren (Sponsor-Rechnungen, Verein-Abrechnungen, Sponsor-Inbox)

**Aufwand:** S (1 Session, ~4 Tasks) — Voraussetzung für Plan 1, 2, 4.

---

## Plan 6 — Notifications & Operativer Polish

**Adressiert:** Gap-Doc P1 #11–25 (Sammelplan kleinerer Items).

**Scope:**
- **Pledge-Verwaltung:** Pledge-Edit-Modal (Beträge/Caps anpassen), „Pledge beenden"-Button mit Confirm
- **Storno-Workflow:** Rechnung stornieren → Storno-Rechnung erzeugen
- **Einladungs-Operationen:** „Einladung erneut senden"-Button, „Einladung widerrufen"-Action mit UI
- **Mitglieder-Rolle ändern:** Trainer ↔ Admin Switch (Last-Admin-Schutz beachten)
- **Notification-Center:** Header-Glocke mit Badge, Liste der pending Approvals + neuer Rechnungen
- **Notification-Preferences:** `/konto/benachrichtigungen` Seite (per-Channel-Toggle: E-Mail, In-App)
- **Logout-All:** Button auf `/konto` (better-auth API)
- **„Anstehende Aufgaben"-Block:** Tile-Stack im Verein-Dashboard (pending Approvals, fehlende IBAN, Verifikation, neue Anfragen)
- **Onboarding-Completion-Checklist:** ähnlicher Block, aber spezifisch für „Verein einrichten" (IBAN setzen, Verifikation hochladen, erste Sponsoren-Einladung)
- **Mobile FAB:** Floating Action Button auf Verein/Sponsor-Dashboards mit Quick-Actions (Event reporten, Sponsor einladen, Pledge anlegen)
- **Kontextuelle Hilfe:** `?`-Icon-Komponente, die zu Hilfe-Artikeln linkt (Frontmatter `related_articles` nutzen)
- **SEO:** `next-sitemap`-Konfiguration, OG-Bilder pro Public-Route

**Aufwand:** XL (2 Sessions, ~15 Tasks) — kann inkrementell als „kleine Iteration nach jedem anderen Plan" abgearbeitet werden.

---

## Reihenfolge-Empfehlung

```
Plan 0  ← UMGESETZT
   ↓
Plan 5 (Pagination — Voraussetzung für 1, 2, 4)
   ↓
Plan 1 (Verein-Reporting) ←─ Plan 2 (Sponsor-Reporting)
   ↓
Plan 3 (Mannschafts-Lifecycle)
   ↓
Plan 4 (Plattform-Admin)
   ↓
Plan 6 (Polish, kann parallel laufen ab Plan 1)
```

Wenn nur eine begrenzte Anzahl Sessions zur Verfügung steht: Plan 5 → Plan 1 → Plan 2 → Plan 3 priorisieren. Plan 4 und 6 sind „inwendige Qualität" und können nach v1-Launch verfeinert werden.

---

## Verbleibende L2-Items (nicht in Plans 1–6)

Diese sind im Gap-Doc als Later markiert und gehören nicht in den v1-Launch-Scope:

- Native Mobile App (Expo)
- Stripe Connect / Auto-Charge / Escrow
- Live-Match-Push-Notifications
- Foto/Video-Beweise für Manual Events
- Conditional/Eskalierende Pledges, Sponsoren-Challenges
- DATEV-Export, API/Webhooks
- Multi-Language, Theme-Switcher (Light/Dark)
- 2FA, Login-Historie
- Public Vereins-/Mannschafts-Profile (SEO)
