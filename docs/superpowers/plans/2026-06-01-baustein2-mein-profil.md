# Baustein 2 — „Mein Profil" / „Einstellungen" + Mobile-Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Mein Profil" als eigenen Tab mit WYSIWYG-naher Edit-Ansicht etablieren, sauber getrennt von „Einstellungen", und die Mobile-Nav auf 4 Haupt-Tabs + „Mehr" bringen.

**Architecture:** Reiner UI/IA-Umbau auf der Plumbing von Baustein 1. Die `BottomTabBar` kann Overflow („Mehr") bereits (`slice(0,4)` + Sheet bei >5 Items) — wir ordnen nur die Tabs. „Mein Profil" rekomponiert die bestehenden Edit-Bausteine (Logo/Name aus `TeamStammdatenForm`, Cover/Galerie/Insights aus `MediaManager`, Tagline/Ziele/öffentl. Name/Öffentlich-Schalter aus `PublicProfileForm`) in eine öffentlich-aussehende Edit-Ansicht + Verifikations-Statuszeile. „Einstellungen" verliert Stammdaten + die Profil-/Verifikations-Links.

**Tech Stack:** Next.js 15 App Router, Tailwind v3.4 + Brand-Tokens, lucide-react, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-01-baustein2-mein-profil-design.md](../specs/2026-06-01-baustein2-mein-profil-design.md)

**Voraussetzung:** Branch `feat/profil-baustein2` (verifizieren, nicht wechseln). Baustein 1 ist gemerged/vorhanden.

---

## Task 1: „Profil"-Tab in die Team-Sub-Nav + Reihenfolge für Mobile

**Files:**
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx`
- Test: `tests/lib/team-sub-nav.test.ts` (neu, falls nicht vorhanden) — testet `getTeamSubNavTabs`

- [ ] **Step 1: Failing test schreiben**

Create `tests/lib/team-sub-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTeamSubNavTabs } from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav";

describe("getTeamSubNavTabs", () => {
  it("enthält einen Profil-Tab und stellt die ersten 4 fürs Mobile-Primärset", () => {
    const tabs = getTeamSubNavTabs("pro");
    const labels = tabs.map((t) => t.label);
    expect(labels).toContain("Profil");
    // Erste 4 = Mobile-Primärset (BottomTabBar slice(0,4)).
    expect(labels.slice(0, 4)).toEqual(["Übersicht", "Pacts", "Spiele", "Profil"]);
  });

  it("verein-Plan entfernt Abo + Einstellungen (im Overflow), Profil bleibt", () => {
    const labels = getTeamSubNavTabs("verein").map((t) => t.label);
    expect(labels).toContain("Profil");
    expect(labels).not.toContain("Abo");
    expect(labels).not.toContain("Einstellungen");
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/lib/team-sub-nav.test.ts`
Expected: FAIL (kein „Profil"-Label; Reihenfolge stimmt nicht).

- [ ] **Step 3: `ALL_TABS` umbauen**

In `team-sub-nav.tsx` den Import um `UserRound` erweitern und `ALL_TABS` neu ordnen, sodass die ersten 4 das Mobile-Primärset sind:

```ts
import {
  LayoutDashboard,
  Handshake,
  Heart,
  Goal,
  Wallet,
  Gem,
  Settings,
  UserRound,
  type LucideIcon
} from "lucide-react";

// Reihenfolge ist bewusst: die ersten 4 sind das Mobile-Primärset
// (BottomTabBar zeigt slice(0,4) + "Mehr" bei >5 Items). Der Rest landet
// im "Mehr"-Sheet. Desktop zeigt alle horizontal in dieser Reihenfolge.
const ALL_TABS: readonly TeamSubNavTab[] = [
  { label: "Übersicht", href: "", icon: LayoutDashboard },
  { label: "Pacts", href: "/pacts", icon: Handshake },
  { label: "Spiele", href: "/spiele", icon: Goal },
  { label: "Profil", href: "/profil", icon: UserRound },
  { label: "Sponsoren", href: "/sponsoren", icon: Heart },
  { label: "Finanzen", href: "/finanzen", icon: Wallet },
  { label: "Abo", href: "/abo", icon: Gem },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings }
] as const;
```

`getTeamSubNavTabs` bleibt inhaltlich gleich (filtert bei `verein` weiter `/abo` + `/einstellungen`). Nichts weiter ändern — `BottomTabBar` übernimmt den Overflow automatisch.

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/lib/team-sub-nav.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx" tests/lib/team-sub-nav.test.ts
git commit -m "feat(profil): Profil-Tab in Team-Sub-Nav, Mobile-Primärset = erste 4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: „Einstellungen"-Seite verschlanken

**Files:**
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/einstellungen/page.tsx`

- [ ] **Step 1: Stammdaten-Sektion entfernen**

Die komplette `{/* Stammdaten */}`-`<section>` (im aktuellen Code Zeilen 92–107) löschen — Name/Logo lebt ab jetzt in „Mein Profil". Den jetzt unbenutzten Import `TeamStammdatenForm` (Zeile 7) und die nicht mehr genutzte `logoDisplayUrl`-Berechnung (Zeilen 49–57) sowie `getDocumentSignedUrl`-Import (Zeile 6) entfernen, falls dadurch unbenutzt. (Vor dem Entfernen prüfen, dass `logoUrl`/`getDocumentSignedUrl` nirgends sonst in der Datei verwendet werden.)

- [ ] **Step 2: Profil- und Verifikations-Link aus „Weitere Bereiche" entfernen**

In der `<ul>` unter „Weitere Bereiche" die beiden `<li>` löschen:
- den Link „Mannschaft verifizieren" (`href={`${base}/verifikation`}`, aktuell Zeilen 159–180)
- den Link „Öffentliches Profil" (`href={`…/profil`}`, aktuell Zeilen 181–201)

Behalten: „Mitglieder & Zugriff" und „Spieler & DSGVO-Opt-out". Billing-Sektion + Lifecycle-Sektion bleiben unverändert.

- [ ] **Step 3: Verifizieren — tsc + keine toten Imports**

Run: `npx tsc --noEmit`
Expected: 0 Fehler (keine unbenutzten Imports → falls TS/ESLint meckert, Import entfernen).

- [ ] **Step 4: Commit**

```bash
git add "app/(verein)/verein/[slug]/mannschaft/[teamId]/einstellungen/page.tsx"
git commit -m "feat(profil): Einstellungen verschlankt — Stammdaten/Profil/Verifikation raus

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: „Mein Profil" — WYSIWYG-Edit-Ansicht

Rekomponiert die bestehenden Edit-Bausteine in eine Ansicht, die der öffentlichen Seite ähnelt. **Wiederverwendung statt Neuschreiben:** die Server-Actions/Upload-Routes existieren bereits.

**Files:**
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/profil/page.tsx`
- Create: `app/(verein)/verein/[slug]/mannschaft/[teamId]/profil/_components/mein-profil-editor.tsx`
- Reuse (lesen für echte Props/Action-Aufrufe, nicht neu erfinden):
  - `./_components/media-manager.tsx` (Cover/Galerie/Insights-Toggle → `/api/teams/[teamId]/cover|images`, `setTeamShowInsights`)
  - `./_components/public-profile-form.tsx` (Öffentlich-Schalter, publicName/Tagline/Ziele → `saveTeamPublicProfile`)
  - `./_components/team-stammdaten-form.tsx` (Name → `renameTeam`, Logo-Upload → `/api/teams/[teamId]/logo`)

- [ ] **Step 1: Bestehende Edit-Komponenten lesen**

Öffne die drei `_components`-Dateien oben und notiere die exakten Action-Importe + Props. Der Editor ruft **dieselben** Actions/Routes auf — nichts duplizieren oder neue Actions erfinden.

- [ ] **Step 2: `page.tsx` neu aufbauen (Server Component, Datenladen)**

Ersetze den Inhalt von `profil/page.tsx`. Lade zusätzlich `teams.verifiedAt` (für die Verifikations-Zeile) und Club-Infos (Liga/Ort/clubName) für die Hero-Meta. Baue die Serve-Endpoint-URLs wie bisher. Übergib alles an `<MeinProfilEditor>`:

```tsx
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listTeamImages } from "@/lib/db/queries/team-images";
import { MeinProfilEditor } from "./_components/mein-profil-editor";

export const metadata = { title: "Mein Profil · Mannschaft · KickPact" };

export default async function MeinProfilPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "admin");

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      league: teams.league,
      discoverable: teams.discoverable,
      publicSlug: teams.publicSlug,
      publicName: teams.publicName,
      publicTagline: teams.publicTagline,
      publicGoals: teams.publicGoals,
      logoUrl: teams.logoUrl,
      coverUrl: teams.coverUrl,
      showInsights: teams.showInsights,
      verifiedAt: teams.verifiedAt
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const [clubRow] = await db
    .select({ name: clubs.name, ort: clubs.ort })
    .from(clubs)
    .where(eq(clubs.id, club.id))
    .limit(1);

  const gallery = (await listTeamImages(teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${teamId}/image?slot=gallery&id=${g.id}`
  }));
  const coverUrl = team.coverUrl ? `/api/teams/${teamId}/image?slot=cover` : null;
  const logoUrl = team.logoUrl ? `/api/teams/${teamId}/image?slot=logo` : null;

  return (
    <MeinProfilEditor
      slug={slug}
      teamId={team.id}
      teamName={team.name}
      saison={team.saison}
      league={team.league}
      clubName={clubRow?.name ?? ""}
      clubOrt={clubRow?.ort ?? null}
      isVerified={Boolean(team.verifiedAt)}
      coverUrl={coverUrl}
      logoUrl={logoUrl}
      gallery={gallery}
      showInsights={team.showInsights}
      discoverable={team.discoverable}
      publicSlug={team.publicSlug}
      publicName={team.publicName ?? ""}
      publicTagline={team.publicTagline ?? ""}
      publicGoals={team.publicGoals ?? ""}
    />
  );
}
```

- [ ] **Step 3: `MeinProfilEditor` (Client Component) bauen**

Create `…/profil/_components/mein-profil-editor.tsx` — `"use client"`. Layout im öffentlichen Look (dunkler Hero, CI-Grün-Akzent, `max-w-screen-sm`, mobil), aber mit Edit-Bedienelementen. Struktur (von oben):

1. **Sticky Edit-Toolbar:** Titel „Mein Profil"; rechts der **Öffentlich-Schalter** (ruft `saveTeamPublicProfile` mit `isPublic` — exakte Signatur aus `public-profile-form.tsx` übernehmen) und, falls `publicSlug` gesetzt, ein `Link` „Vorschau ↗" → `/m/{publicSlug}` (`target="_blank"`).
2. **Hero (dunkel):** Cover-`<img>` (oder grüner Platzhalter-Verlauf wie auf der öffentlichen Seite, vgl. `app/m/[slug]/_components/profile-hero.tsx`), Overlay „📷 Cover ändern" → `POST /api/teams/${teamId}/cover` (Upload-Logik aus `media-manager.tsx` übernehmen: 10 MB, `ACCEPT`, toast, `router.refresh()`). Logo-Badge mit „ändern" → `POST /api/teams/${teamId}/logo`. **Name** inline editierbar (Input + Speichern → `renameTeam`, Logik aus `team-stammdaten-form.tsx`). Meta-Zeile „{clubName} · {league} · {clubOrt}" (read-only).
3. **Verifikations-Zeile:** wenn `isVerified` → „✔ Verifiziert" + `Link` „Status ansehen" → `/verein/${slug}/mannschaft/${teamId}/verifikation`; sonst CTA „Mannschaft verifizieren →" zur selben Route.
4. **Insights:** `Label` + Schalter „anzeigen" → `setTeamShowInsights({ teamId, show })`. (Reine Vorschau der Insights ist optional; der Schalter ist Pflicht.)
5. **Galerie:** Thumbnails mit ✕ (→ `DELETE /api/teams/${teamId}/images/${id}`) + „＋ Bild" (→ `POST /api/teams/${teamId}/images`), max. 8 (Logik aus `media-manager.tsx`).
6. **Über uns:** editierbare Felder publicName (optional), Tagline (Textarea, max 280), Ziele (Textarea, max 600) → ein „Speichern" ruft `saveTeamPublicProfile` (Signatur aus `public-profile-form.tsx`).

Alle Schreibpfade nutzen die **bestehenden** Actions/Routes. Nach jeder Aktion `router.refresh()` + `toast`. Verwende `sonner`-`toast`, `useTransition`, und die Brand-Tokens (`bg-brand-night-navy`, `text-accent`, `bg-accent`, etc.) wie in `profile-hero.tsx`.

**Wichtig:** Übernimm die exakten Action-Signaturen aus den drei bestehenden Komponenten (Schritt 1). Erfinde keine neuen Server-Actions. Wenn eine Action eine andere Form erwartet als hier skizziert, gilt die echte Signatur.

- [ ] **Step 4: Alte Profil-Bausteine aufräumen**

`PublicProfileForm` und `MediaManager` werden von der neuen Seite nicht mehr eingebunden. Wenn sie sonst nirgends importiert werden (`rg -n "PublicProfileForm|MediaManager" app`), die Dateien entfernen; andernfalls belassen. `TeamStammdatenForm` ggf. entfernen, falls nach Task 2 (Einstellungen) und Task 3 nirgends mehr importiert.

- [ ] **Step 5: Verifizieren**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 6: Commit**

```bash
git add "app/(verein)/verein/[slug]/mannschaft/[teamId]/profil"
git commit -m "feat(profil): Mein Profil als WYSIWYG-Edit-Ansicht (Hero/Insights/Galerie/Über uns + Verifikation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Gesamt-Verifikation

- [ ] **Step 1: tsc + Nav-Test**

Run: `npx tsc --noEmit` (0 Fehler) und `npx vitest run tests/lib/team-sub-nav.test.ts` (grün).

- [ ] **Step 2: Visuelle Smoke (Orchestrator)**

Dev-Server gegen die Test-DB (wie bei Baustein 1), als Team-Admin einloggen (Test-Auth-Bypass), `/verein/{slug}/mannschaft/{teamId}/profil` aufrufen: Hero/Cover/Logo/Name-Edit, Insights-Schalter, Galerie ＋/✕, Über-uns-Speichern, Öffentlich-Schalter, „Vorschau ↗", Verifikations-Zeile. Bottom-Bar zeigt 4 + „Mehr". `/einstellungen` zeigt keine Stammdaten/Profil/Verifikations-Einträge mehr. Screenshot mobil.

- [ ] **Step 3: Commit (falls Fixes nötig)**

```bash
git add -A && git commit -m "fix(profil): Baustein-2 Smoke-Fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Nav/Profil-Tab + Mobile-Overflow (T1, nutzt vorhandenen BottomTabBar-Overflow), Einstellungen verschlankt (T2), WYSIWYG „Mein Profil" inkl. Verifikations-Zeile + alle Edit-Pfade (T3), Verifikation (T3 verlinkt bestehende Seite), Tests (T1) + Smoke (T4). Alle Erfolgskriterien abgedeckt.
- **Wiederverwendung:** Keine neuen Server-Actions/Routes — alles aus Baustein 1 + bestehenden Team-Actions. Editor rekomponiert vorhandene Logik.
- **Am Code zu verifizieren beim Umsetzen:** exakte Signaturen von `saveTeamPublicProfile`/`renameTeam`/`setTeamShowInsights` und die `ACCEPT`/Upload-Logik (aus den drei bestehenden `_components`).
