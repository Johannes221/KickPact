# Baustein 3 — Sponsoren-Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sponsoren finden verifizierte, öffentliche Mannschaften per Suche + Liga/Ort-Filter in reichen Karten — öffentlich (ohne Login) und eingeloggt; nicht-verifizierte sind unsichtbar (Discovery + `/m/{slug}`).

**Architecture:** Query-Schicht (`sponsor-discover.ts`) bekommt das Verifikations-Gate, Liga/Ort-Filter, reiche Felder (Cover/Logo-Serve-URLs, Vorjahres-Platzierung via korrelierter Subquery) und eine Facetten-Query. Geteilte UI-Komponenten (`TeamDiscoverCard`, `DiscoverFilters`) bedienen zwei Seiten: öffentliche `/mannschaften` (Karten → `/m/{slug}`) und eingeloggte `/sponsor/discover` (inline-Anfrage + „Deine Anfragen").

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres), Tailwind + Brand-Tokens, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-02-baustein3-sponsoren-discovery-design.md](../specs/2026-06-02-baustein3-sponsoren-discovery-design.md)

**Voraussetzung:** Worktree-Branch `feat/profil-baustein3` (ab `main`, enthält B1+B2). Test-DB läuft (Port 54329). Alle Befehle im Worktree-Verzeichnis ausführen (cwd = der Worktree).

---

## Task 1: Verifikations-Gate + Query-Erweiterung `listDiscoverableTeams` + Gate für `getPublicTeamProfileBySlug`

**Files:**
- Modify: `lib/db/queries/sponsor-discover.ts`
- Test: `tests/queries/discover-filters.test.ts` (neu)

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/discover-filters.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, seasonResults } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { listDiscoverableTeams, getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";

async function makeTeam(opts: {
  clubName: string; ort: string; league: string | null; verified: boolean;
  discoverable?: boolean; slug?: string;
}) {
  const [club] = await db.insert(clubs).values({
    slug: `c-${createId().slice(0,6)}`, name: opts.clubName, ort: opts.ort, fussballdeVereinId: createId()
  }).returning({ id: clubs.id });
  const [team] = await db.insert(teams).values({
    clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true,
    discoverable: opts.discoverable ?? true, verifiedAt: opts.verified ? new Date() : null,
    league: opts.league, publicSlug: opts.slug ?? null
  }).returning({ id: teams.id });
  return { teamId: team.id, clubId: club.id };
}

describe("listDiscoverableTeams — gate + filters", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("zeigt nur verifizierte Teams (Gate)", async () => {
    await makeTeam({ clubName: "Verein A", ort: "Dossenheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "Verein B", ort: "Dossenheim", league: "Kreisliga", verified: false });
    const rows = await listDiscoverableTeams({});
    expect(rows.length).toBe(1);
    expect(rows[0].clubName).toBe("Verein A");
  });

  it("filtert nach Liga und Ort", async () => {
    await makeTeam({ clubName: "A", ort: "Dossenheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "B", ort: "Mannheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "C", ort: "Dossenheim", league: "Bezirksliga", verified: true });
    expect((await listDiscoverableTeams({ league: "Kreisliga" })).length).toBe(2);
    expect((await listDiscoverableTeams({ ort: "Dossenheim" })).length).toBe(2);
    expect((await listDiscoverableTeams({ league: "Kreisliga", ort: "Dossenheim" })).length).toBe(1);
  });

  it("liefert Vorjahres-Platzierung aus der jüngsten Vorsaison", async () => {
    const { teamId } = await makeTeam({ clubName: "A", ort: "X", league: "Kreisliga", verified: true });
    await db.insert(seasonResults).values({ teamId, saison: "2024/25", finalPosition: 2, promoted: true });
    const [row] = await listDiscoverableTeams({});
    expect(row.lastSeasonPosition).toBe(2);
    expect(row.lastSeasonPromoted).toBe(true);
  });
});

describe("getPublicTeamProfileBySlug — verif gate", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert null für unverifiziertes, aber discoverable Team", async () => {
    await makeTeam({ clubName: "Unverif", ort: "X", league: "Kreisliga", verified: false, slug: "unverif-team-x" });
    expect(await getPublicTeamProfileBySlug("unverif-team-x")).toBeNull();
  });

  it("liefert Profil für verifiziertes Team", async () => {
    await makeTeam({ clubName: "Verif", ort: "X", league: "Kreisliga", verified: true, slug: "verif-team-x" });
    const p = await getPublicTeamProfileBySlug("verif-team-x");
    expect(p).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test → fail**

Run (cwd = worktree): `npx vitest run tests/queries/discover-filters.test.ts`
Expected: FAIL (unverified team still listed; `lastSeasonPosition` undefined; getPublicTeamProfileBySlug returns profile for unverified).

- [ ] **Step 3: `sponsor-discover.ts` anpassen**

Imports ergänzen: `isNotNull` aus `drizzle-orm`. `seasonResults` ist nicht nötig (Subquery via `sql`).

a) `DiscoverableTeam`-Interface erweitern:
```ts
  league: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  lastSeasonPosition: number | null;
  lastSeasonPromoted: boolean;
```

b) `listDiscoverableTeams` — Signatur + Bedingungen + Select:
```ts
export async function listDiscoverableTeams(opts: {
  search?: string;
  league?: string;
  ort?: string;
  sponsorUserId?: string;
  limit?: number;
}): Promise<DiscoverableTeam[]> {
  const search = opts.search?.trim();
  const conditions = [
    eq(teams.discoverable, true),
    eq(teams.isActive, true),
    isNotNull(teams.verifiedAt) // Gate: nur verifizierte sind auffindbar
  ];
  if (search && search.length >= 2) {
    const like = `%${search}%`;
    const orClause = or(ilike(teams.name, like), ilike(clubs.name, like), ilike(clubs.ort, like));
    if (orClause) conditions.push(orClause);
  }
  if (opts.league?.trim()) conditions.push(eq(teams.league, opts.league.trim()));
  if (opts.ort?.trim()) conditions.push(eq(clubs.ort, opts.ort.trim()));

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      league: teams.league,
      clubId: clubs.id,
      clubName: clubs.name,
      clubOrt: clubs.ort,
      clubVerifiedAt: clubs.verifiedAt,
      publicSlug: teams.publicSlug,
      publicTagline: teams.publicTagline,
      coverUrlRaw: teams.coverUrl,
      logoUrlRaw: teams.logoUrl,
      lastSeasonPosition: sql<number | null>`(
        SELECT sr.final_position FROM ${seasonResults} sr
        WHERE sr.team_id = ${teams.id} AND sr.saison <> ${teams.saison}
        ORDER BY sr.saison DESC LIMIT 1)`,
      lastSeasonPromoted: sql<boolean>`COALESCE((
        SELECT sr.promoted FROM ${seasonResults} sr
        WHERE sr.team_id = ${teams.id} AND sr.saison <> ${teams.saison}
        ORDER BY sr.saison DESC LIMIT 1), false)`,
      hasInquiry: opts.sponsorUserId
        ? sql<boolean>`EXISTS (SELECT 1 FROM ${sponsorInquiries}
            WHERE ${sponsorInquiries.teamId} = ${teams.id}
              AND ${sponsorInquiries.sponsorUserId} = ${opts.sponsorUserId}
              AND ${sponsorInquiries.status} IN ('pending','accepted'))`
        : sql<boolean>`false`
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(...conditions))
    .orderBy(desc(teams.createdAt))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    saison: r.saison,
    league: r.league,
    clubId: r.clubId,
    clubName: r.clubName,
    clubOrt: r.clubOrt,
    publicTagline: r.publicTagline,
    coverUrl: r.coverUrlRaw ? `/api/teams/${r.teamId}/image?slot=cover` : null,
    logoUrl: r.logoUrlRaw ? `/api/teams/${r.teamId}/image?slot=logo` : null,
    lastSeasonPosition: r.lastSeasonPosition ?? null,
    lastSeasonPromoted: Boolean(r.lastSeasonPromoted),
    hasOpenInquiry: Boolean(r.hasInquiry),
    clubVerifiedAt: r.clubVerifiedAt
  }));
}
```
`seasonResults` muss importiert sein (aus `@/lib/db/schema`). `sql` ist bereits importiert.

c) `getPublicTeamProfileBySlug` — Gate ergänzen: in der Select `verifiedAt: teams.verifiedAt` mitnehmen (falls nicht vorhanden) und nach der `discoverable`/`isActive`-Prüfung ergänzen:
```ts
  if (!row.verifiedAt) return null; // nur verifizierte sind öffentlich sichtbar
```
(direkt nach `if (!row.discoverable || !row.isActive) return null;`).

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/discover-filters.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Bestehende Public-Profile-Tests prüfen**

Run: `npx vitest run tests/queries/public-profile.test.ts`
Expected: Falls dieser Test ein discoverable-aber-unverifiziertes Team seedet, schlägt er jetzt fehl (Gate). Den Test so anpassen, dass das Team `verifiedAt: new Date()` gesetzt bekommt (das Gate ist gewollt). PASS danach.

- [ ] **Step 6: tsc + Commit**

Run: `npx tsc --noEmit` (0 Fehler).
```bash
git add lib/db/queries/sponsor-discover.ts tests/queries/discover-filters.test.ts tests/queries/public-profile.test.ts
git commit -m "feat(discovery): verif-gate + liga/ort-filter + reiche felder in listDiscoverableTeams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Facetten-Query `listDiscoveryFacets`

**Files:**
- Modify: `lib/db/queries/sponsor-discover.ts`
- Test: `tests/queries/discover-facets.test.ts` (neu)

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/discover-facets.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { listDiscoveryFacets } from "@/lib/db/queries/sponsor-discover";

async function seed(clubName: string, ort: string, league: string | null, verified: boolean) {
  const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, ort, fussballdeVereinId: createId() }).returning({ id: clubs.id });
  await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true, discoverable: true, verifiedAt: verified ? new Date() : null, league });
}

describe("listDiscoveryFacets", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert distinkte, sortierte Ligen/Orte nur aus auffindbaren Teams", async () => {
    await seed("A", "Mannheim", "Kreisliga", true);
    await seed("B", "Dossenheim", "Bezirksliga", true);
    await seed("C", "Dossenheim", "Kreisliga", true);
    await seed("D", "Heidelberg", "Landesliga", false); // unverifiziert → ignoriert
    const f = await listDiscoveryFacets();
    expect(f.leagues).toEqual(["Bezirksliga", "Kreisliga"]);
    expect(f.orte).toEqual(["Dossenheim", "Mannheim"]);
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/queries/discover-facets.test.ts`
Expected: FAIL (Funktion fehlt).

- [ ] **Step 3: Implementieren** (in `sponsor-discover.ts` anhängen)

```ts
export async function listDiscoveryFacets(): Promise<{ leagues: string[]; orte: string[] }> {
  const base = and(
    eq(teams.discoverable, true),
    eq(teams.isActive, true),
    isNotNull(teams.verifiedAt)
  );
  const leagueRows = await db
    .selectDistinct({ v: teams.league })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(base, isNotNull(teams.league)));
  const orteRows = await db
    .selectDistinct({ v: clubs.ort })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(base, isNotNull(clubs.ort)));
  const clean = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 0))).sort((a, b) =>
      a.localeCompare(b, "de")
    );
  return { leagues: clean(leagueRows.map((r) => r.v)), orte: clean(orteRows.map((r) => r.v)) };
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/discover-facets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/sponsor-discover.ts tests/queries/discover-facets.test.ts
git commit -m "feat(discovery): listDiscoveryFacets (distinkte ligen/orte)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Geteilte Komponenten `TeamDiscoverCard` + `DiscoverFilters`

**Files:**
- Create: `app/(sponsor)/sponsor/discover/_components/team-discover-card.tsx`
- Create: `app/(sponsor)/sponsor/discover/_components/discover-filters.tsx`
- Reuse: `app/(sponsor)/sponsor/discover/_components/discover-list.tsx` (für das bestehende Inline-Anfrage-Modal-Muster mit `createSponsorInquiry({ teamId, message })`)

> Hinweis: Beide Seiten (öffentlich + Sponsor) importieren diese Komponenten. Da sie auch von der öffentlichen Marketing-Seite genutzt werden, ist ein neutralerer Ort (`components/shared/`) ebenfalls vertretbar — wenn dort platziert, Importpfade entsprechend anpassen. Default: unter dem discover-Ordner.

- [ ] **Step 1: `DiscoverFilters` (Client)**

Suchfeld + zwei `<select>` (Liga, Ort), die `?q=&league=&ort=` in die URL schreiben (via `useRouter` + `URLSearchParams`, `router.push`). Props: `{ basePath: string; facets: { leagues: string[]; orte: string[] }; current: { q: string; league: string; ort: string } }`. „Zurücksetzen"-Link wenn Filter aktiv. Styling wie das bestehende Suchfeld in `discover/page.tsx` (Brand-Tokens). Auf Mobile untereinander, ab `sm` nebeneinander.

```tsx
"use client";
import { useRouter } from "next/navigation";

export function DiscoverFilters({ basePath, facets, current }: {
  basePath: string;
  facets: { leagues: string[]; orte: string[] };
  current: { q: string; league: string; ort: string };
}) {
  const router = useRouter();
  function update(next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    const sp = new URLSearchParams();
    if (merged.q) sp.set("q", merged.q);
    if (merged.league) sp.set("league", merged.league);
    if (merged.ort) sp.set("ort", merged.ort);
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }
  const hasFilter = current.q || current.league || current.ort;
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row">
      <form className="flex-1" onSubmit={(e) => { e.preventDefault(); }} action={basePath} method="GET">
        <input type="search" name="q" defaultValue={current.q}
          onBlur={(e) => update({ q: e.target.value })}
          placeholder="Mannschaft, Verein oder Ort …"
          className="w-full rounded-lg border border-brand-neutral/40 bg-white px-4 py-3 text-base text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </form>
      <select value={current.league} onChange={(e) => update({ league: e.target.value })}
        className="rounded-lg border border-brand-neutral/40 bg-white px-3 py-3 text-sm text-brand-night-navy">
        <option value="">Alle Ligen</option>
        {facets.leagues.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <select value={current.ort} onChange={(e) => update({ ort: e.target.value })}
        className="rounded-lg border border-brand-neutral/40 bg-white px-3 py-3 text-sm text-brand-night-navy">
        <option value="">Alle Orte</option>
        {facets.orte.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hasFilter && (
        <button type="button" onClick={() => router.push(basePath)}
          className="rounded-lg px-3 py-3 text-sm font-semibold text-brand-night-navy/60 hover:text-brand-night-navy">
          Zurücksetzen
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `TeamDiscoverCard`**

Reiche Karte. Props: `{ team: DiscoverableTeam; mode: "public" | "sponsor" }`. Cover (`team.coverUrl` als `<img>` oder grüner Platzhalter wie `app/m/[slug]/_components/profile-hero.tsx`), Logo-Badge, Name, `clubName · league · ort`, ✔, Tagline (gekürzt), Vorjahres-Teaser (`team.lastSeasonPosition ? "Vorjahr: {n}. Platz" + (promoted ? " · Aufstieg" : "")`).
- `mode="public"`: zwei Links → `/m/{publicSlug}` („Profil ansehen" + „Anfragen"). (Falls `publicSlug` null — kommt bei discoverable+verified praktisch nicht vor — nur „Profil"-Button ausblenden.)
- `mode="sponsor"`: „Profil ansehen" → `/m/{slug}`; „Anfragen" als Client-Inline-Aktion. Das Inline-Anfrage-Modal aus `discover-list.tsx` (State + `createSponsorInquiry({ teamId, message })` + Toast) hierher übernehmen/wiederverwenden; bei `team.hasOpenInquiry` stattdessen „✓ Bereits angefragt" (disabled) zeigen.

Da der Karten-Inhalt für beide Modi identisch ist und nur der Footer/Button-Bereich differiert, eine gemeinsame Karte mit modusabhängigem Footer bauen. `<img>` mit `eslint-disable-next-line @next/next/no-img-element` (wie etabliert).

`DiscoverableTeam` braucht `publicSlug` — sicherstellen, dass Task 1 `publicSlug` mit ausgibt (im Select ist `publicSlug: teams.publicSlug` enthalten; im Rückgabe-Objekt ergänzen, falls noch nicht). Falls nicht vorhanden, in Task-1-Interface + Mapping nachziehen.

- [ ] **Step 3: tsc + Commit**

Run: `npx tsc --noEmit` (0 Fehler).
```bash
git add "app/(sponsor)/sponsor/discover/_components/team-discover-card.tsx" "app/(sponsor)/sponsor/discover/_components/discover-filters.tsx"
git commit -m "feat(discovery): geteilte komponenten TeamDiscoverCard + DiscoverFilters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Hinweis für Task 1:** `DiscoverableTeam` muss `publicSlug: string | null` enthalten (für die Karten-Links). Wenn in Task 1 noch nicht ergänzt, hier nachziehen und Task 1 anpassen.

---

## Task 4: Öffentliche Discovery-Seite `/mannschaften`

**Files:**
- Create: `app/(marketing)/mannschaften/page.tsx` (Route-Group der öffentlichen Seiten — vorhandene Marketing-Group nutzen; prüfen wie `/hilfe` o.ä. liegen)

- [ ] **Step 1: Seite bauen (Server Component, kein Auth)**

```tsx
import { listDiscoverableTeams, listDiscoveryFacets } from "@/lib/db/queries/sponsor-discover";
import { DiscoverFilters } from "@/app/(sponsor)/sponsor/discover/_components/discover-filters";
import { TeamDiscoverCard } from "@/app/(sponsor)/sponsor/discover/_components/team-discover-card";

export const metadata = {
  title: "Mannschaften entdecken · KickPact",
  description: "Finde Amateur-Mannschaften zum Sponsern — nach Liga und Ort filtern und direkt anfragen."
};

export default async function MannschaftenPage({
  searchParams
}: { searchParams: Promise<{ q?: string; league?: string; ort?: string }> }) {
  const sp = await searchParams;
  const current = { q: sp.q ?? "", league: sp.league ?? "", ort: sp.ort ?? "" };
  const [teamsList, facets] = await Promise.all([
    listDiscoverableTeams({ search: current.q, league: current.league, ort: current.ort, limit: 60 }),
    listDiscoveryFacets()
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <h1 className="font-display font-black text-3xl md:text-5xl tracking-tight text-brand-night-navy">Mannschaften entdecken</h1>
      <p className="mt-2 text-brand-night-navy/60">Finde Mannschaften zum Sponsern — filtere nach Liga und Ort und frag direkt an.</p>
      <div className="mt-6">
        <DiscoverFilters basePath="/mannschaften" facets={facets} current={current} />
      </div>
      {teamsList.length === 0 ? (
        <p className="mt-10 text-center text-brand-night-navy/60">Keine Mannschaften gefunden. Passe Suche oder Filter an.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamsList.map((t) => <TeamDiscoverCard key={t.teamId} team={t} mode="public" />)}
        </div>
      )}
    </div>
  );
}
```

> Vor dem Schreiben prüfen: wo liegen öffentliche Seiten (Route-Group `(marketing)`?), ob ein Layout/Header automatisch greift, und dass `/mannschaften` ohne Login erreichbar ist (keine Auth-Middleware-Sperre für diesen Pfad). Falls eine Middleware Pfade schützt, `/mannschaften` freigeben.

- [ ] **Step 2: tsc + manueller Aufruf**

Run: `npx tsc --noEmit` (0 Fehler). (Visuelle Prüfung macht der Orchestrator.)

- [ ] **Step 3: Commit**

```bash
git add "app/(marketing)/mannschaften/page.tsx"
git commit -m "feat(discovery): öffentliche /mannschaften-seite (filter + karten)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Eingeloggte `/sponsor/discover` auf Filter + Karten umstellen

**Files:**
- Modify: `app/(sponsor)/sponsor/discover/page.tsx`
- Modify/Replace: `app/(sponsor)/sponsor/discover/_components/discover-list.tsx` (Karten-Grid statt alter Liste; Inline-Anfrage-Logik in `TeamDiscoverCard` mode="sponsor" verlagert)

- [ ] **Step 1: `page.tsx` erweitern**

`searchParams` um `league`/`ort` erweitern; `listDiscoveryFacets()` laden; `listDiscoverableTeams({ search, league, ort, sponsorUserId, limit })` aufrufen; `<DiscoverFilters basePath="/sponsor/discover" .../>` rendern; Treffer als `TeamDiscoverCard mode="sponsor"`-Grid; „Deine Anfragen"-Sektion bleibt.

```tsx
const current = { q: sp.q ?? "", league: sp.league ?? "", ort: sp.ort ?? "" };
const [teamsList, facets, myInquiries] = await Promise.all([
  listDiscoverableTeams({ search: current.q, league: current.league, ort: current.ort, sponsorUserId: user.id, limit: 60 }),
  listDiscoveryFacets(),
  listInquiriesForSponsor(user.id)
]);
```
Das alte `<form>`-Suchfeld durch `<DiscoverFilters>` ersetzen; `<DiscoverList>` durch das Karten-Grid ersetzen (oder `DiscoverList` intern auf das Grid umstellen).

- [ ] **Step 2: Inline-Anfrage in `TeamDiscoverCard` (sponsor) verifizieren**

Sicherstellen, dass die aus `discover-list.tsx` übernommene Modal-/`createSponsorInquiry`-Logik in der Karte funktioniert und `hasOpenInquiry` den „Bereits angefragt"-Zustand zeigt. Nicht mehr benötigte Teile von `discover-list.tsx` entfernen (oder die Datei auflösen), wenn nichts mehr darauf verweist (`rg -n "DiscoverList" app`).

- [ ] **Step 3: tsc + Commit**

Run: `npx tsc --noEmit` (0 Fehler).
```bash
git add "app/(sponsor)/sponsor/discover"
git commit -m "feat(discovery): /sponsor/discover mit filtern + reichen karten

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Gesamt-Verifikation

- [ ] **Step 1: Tests + tsc**

Run: `npx vitest run tests/queries/discover-filters.test.ts tests/queries/discover-facets.test.ts tests/queries/public-profile.test.ts` (grün) und `npx tsc --noEmit` (0 Fehler).

- [ ] **Step 2: Visuelle Smoke (Orchestrator)**

Dev-Server gegen Test-DB, seed mit ≥2 verifizierten discoverable Teams (versch. Liga/Ort) + 1 unverifiziertem. Prüfen: öffentliche `/mannschaften` (ohne Login) zeigt nur die 2, Liga/Ort-Filter + Suche grenzen ein, Karten → `/m/{slug}`; unverifiziertes erscheint nicht und sein `/m/{slug}` → 404; `/sponsor/discover` (eingeloggt) zeigt Filter + Karten + „Anfragen" + „Deine Anfragen". Screenshot.

---

## Self-Review-Notiz
- **Spec-Abdeckung:** Verif-Gate (T1, beide Stellen), Liga/Ort-Filter + reiche Felder + Vorjahres-Teaser (T1), Facetten (T2), geteilte Karte/Filter (T3), öffentliche Seite (T4), eingeloggte Seite (T5), Verifikation (T6). Alle Erfolgskriterien abgedeckt.
- **Typen-Konsistenz:** `DiscoverableTeam` wird in T1 erweitert (inkl. `publicSlug`, `league`, `coverUrl`, `logoUrl`, `lastSeasonPosition`, `lastSeasonPromoted`) und in T3/T4/T5 genutzt. `createSponsorInquiry({ teamId, message })` aus `@/lib/actions/sponsor-inquiries` (bestätigt in discover-list.tsx).
- **Am Code zu verifizieren:** Route-Group/Layout der öffentlichen Seiten + evtl. Auth-Middleware für `/mannschaften`; genaue Felder/Props beim Umbau von `discover-list.tsx`.
```
