# Team-Centric Dashboard — Implementation Plan

> Implementiert das Mannschafts-vs-Vereins-Account-Modell mit kompletter Tab-Struktur für Mannschafts-Admins.

**Datum:** 2026-05-25
**Naming-Entscheidung:** "Pacts" für Pledges, "Spiele" für Matches, "Finanzen" für Geld-Übersicht.
**Redirect-Strategie:** Hart — User mit `basic`/`pro` werden vom Club-Dashboard automatisch zur Team-Page umgeleitet.

---

## Problem-Statement (User-Sicht)

> "Ich habe eine Mannschaft (Dossenheim III) erstellt, sehe aber das Vereins-Dashboard mit allen Teams. Ich bin nicht Vereins-Admin, ich verwalte eine Mannschaft. Ich brauche eine Mannschafts-Sicht mit Pacts, Spielen, Finanzen — alles auf MEINE Mannschaft fokussiert."

## Ziel

| Lizenz | Heute | Ziel |
|---|---|---|
| `basic` / `pro` (Mannschafts-Lizenz) | sieht `/verein/[slug]/` Multi-Team-Dashboard | sieht `/verein/[slug]/mannschaft/[teamId]/` Team-Dashboard mit 6 Tabs |
| `verein` (Vereinslizenz) | sieht `/verein/[slug]/` | bleibt unverändert |

## Architektur

### Routing-Entscheidung beim Login

`pickDashboardDestination(identities)` wird erweitert:
- Wenn User in `clubs[0]` ist:
  - Lade den `effectivePlan` für irgendein Team des Clubs
  - Wenn `verein` → `/verein/[slug]/`
  - Wenn `basic`/`pro` → `/verein/[slug]/mannschaft/[teamId]/` (das erste/einzige Team)

### Hart-Redirect im Club-Dashboard

`/verein/[slug]/page.tsx` und alle Club-Sub-Routes prüfen am Anfang:
```typescript
const access = await assertClubAccess(slug, "viewer");
if (access.effectivePlan !== "verein") {
  const firstTeam = await getFirstTeamForClub(access.club.id);
  if (firstTeam) redirect(`/verein/${slug}/mannschaft/${firstTeam.id}`);
}
```

### Tab-Struktur Team-Scope (`/verein/[slug]/mannschaft/[teamId]/`)

| # | Tab | Route | Inhalt |
|---|---|---|---|
| 1 | Übersicht | `` | KPI-Cards (aktive Pacts, Monatsumsatz, nächstes Spiel, pending Approvals) + letzte 5 Spiele |
| 2 | Pacts | `/pacts` | Pact-Liste, Sort + Filter (Sponsor, Trigger, Betrag, Cap, Status) |
| 3 | Spiele | `/spiele` | Match-Liste 2 Saisons, Filter (Saison, Datum, Ergebnis), Click → Match-Detail mit Events + ausgelösten Pacts |
| 4 | Finanzen | `/finanzen` | KPI-Kacheln pro Trigger-Kategorie, Zeitfilter, Top-Sponsoren, Trend-Chart |
| 5 | Abo | `/abo` | Subscription (kann von Club-Page kopiert/angepasst werden) |
| 6 | Einstellungen | `/einstellungen` | Team-Stammdaten, Sponsor-Einladungslinks |

## Parallele Sub-Agenten

| # | Agent | Files | Konflikt-Zone |
|---|---|---|---|
| A | Routing + Permissions | `lib/auth/identity-routing.ts`, `lib/auth/scope.ts`, `lib/db/queries/user-identities.ts`, `app/(verein)/verein/[slug]/page.tsx` + Sub-Routes | `pickDashboardDestination`, `assertClubAccess` Return-Shape |
| B | Tab 1+2: Übersicht + Pacts | `mannschaft/[teamId]/page.tsx` (erweitert), `mannschaft/[teamId]/pacts/page.tsx` (neu), Layout mit TeamSubNav, KPI-Cards | layout.tsx im mannschaft-Folder |
| C | Tab 3: Spiele + Match-Detail | `mannschaft/[teamId]/spiele/page.tsx`, `mannschaft/[teamId]/spiele/[matchId]/page.tsx` (oder Re-Use bestehender `spiel/[matchId]`) | Queries in `lib/db/queries/matches.ts` |
| D | Tab 4: Finanzen | `mannschaft/[teamId]/finanzen/page.tsx`, neue Queries in `lib/db/queries/team-finances.ts` | recharts-Komponenten |

**Gemeinsame Voraussetzung (bereits in main):** `app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx`

## Akzeptanzkriterien

1. ✅ User mit `basic`-Lizenz auf 1 Team landet beim Login direkt auf Team-Page (nicht Club-Page)
2. ✅ Manueller Aufruf von `/verein/[slug]/` mit `basic`-Lizenz redirected zur Team-Page
3. ✅ User mit `verein`-Lizenz sieht weiterhin das Multi-Team-Dashboard
4. ✅ Team-Dashboard hat alle 6 Tabs funktional
5. ✅ Pacts-Tab: sortier- und filterbar
6. ✅ Spiele-Tab: zeigt min. 2 Saisons, Click führt zu Match-Detail mit Events + Pact-Auslösungen + Geldfluss pro Event
7. ✅ Finanzen-Tab: KPI-Kacheln pro Trigger-Kategorie, Zeitfilter funktional
8. ✅ `npm test` Anzahl grüner Tests darf nicht sinken
9. ✅ TypeScript clean
