# Öffentliches Profil — Redesign (Baustein 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die öffentliche Mannschafts-Profilseite (`/m/{slug}`) auf ein modernes, sport-energetisches Layout (Richtung A, CI-Grün) heben: Cover-Bild + Galerie, optionale Saison-Insights (Default an), Liga aus dem Crawler.

**Architecture:** Datenmodell-Erweiterung an `teams` + neue Tabelle `team_images`. Bild-Uploads laufen über Route-Handler (kein Server-Action-1-MB-Limit) und die bestehende `lib/storage/images.ts`-Pipeline (HEIC→JPEG). Öffentliche Bilder werden über einen auf `teams/`-Keys begrenzten Serve-Endpoint ausgeliefert (frische signierte URLs, kein Doc-Leak). Insights aus einer wiederverwendbaren `computeTeamSeasonStats`-Query + `season_results`. Die Public-Seite ist eine Server Component; Editing wird minimal an die bestehende `…/profil`-Seite geklemmt (volle UI = Baustein 2).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres), Tailwind v3.4 + Brand-Tokens, Vitest, `heic-convert`, Cloudflare R2 / lokales Volume.

**Spec:** [docs/superpowers/specs/2026-06-01-oeffentliches-profil-redesign-design.md](../specs/2026-06-01-oeffentliches-profil-redesign-design.md)

**Voraussetzung:** Test-DB läuft (`docker compose -f docker-compose.test.yml up -d`) und ist migriert. Alle Commits auf einem Feature-Branch, nicht auf `main`.

---

## Task 1: Schema — `teams`-Spalten + Tabelle `team_images` + Migration

**Files:**
- Modify: `lib/db/schema/clubs.ts` (teams-Tabelle, ~Z. 136–218)
- Create: `lib/db/schema/team-images.ts`
- Modify: `lib/db/schema/index.ts` (Re-Export)
- Migration: generiert via `npm run db:generate`

- [ ] **Step 1: Spalten an `teams` ergänzen**

In `lib/db/schema/clubs.ts` innerhalb der `teams`-`pgTable`-Definition (bei den anderen Public-Feldern wie `publicTagline`) ergänzen:

```ts
    coverUrl: text("cover_url"),
    showInsights: boolean("show_insights").notNull().default(true),
    league: text("league"),
```

Sicherstellen, dass `boolean` und `text` aus `drizzle-orm/pg-core` importiert sind (sind in der Datei bereits in Verwendung).

- [ ] **Step 2: Tabelle `team_images` anlegen**

Create `lib/db/schema/team-images.ts`:

```ts
import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";

/**
 * Galerie-Bilder einer Mannschaft (öffentliches Profil). Logo und Cover
 * liegen als Spalten auf `teams` (logo_url / cover_url); hier nur die
 * mehrfach möglichen, sortierbaren Galerie-Bilder.
 */
export const teamImages = pgTable(
  "team_images",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byTeamSort: index("team_images_team_sort_idx").on(t.teamId, t.sortOrder)
  })
);
```

- [ ] **Step 3: Re-Export ergänzen**

In `lib/db/schema/index.ts` die neue Datei re-exportieren (gleiches Muster wie die anderen `export * from "./..."`):

```ts
export * from "./team-images";
```

- [ ] **Step 4: Migration generieren**

Run: `npm run db:generate`
Expected: Neue Migration unter `drizzle/migrations/` mit `ALTER TABLE "teams" ADD COLUMN "cover_url"…`, `"show_insights"`, `"league"` und `CREATE TABLE "team_images"`.

- [ ] **Step 5: Test-DB migrieren + tsc**

Run: `DATABASE_URL="$(rg -o 'DATABASE_URL_TEST="?([^"\n]+)"?' -r '$1' .env.local)" npx tsx -e "(async()=>{const{config}=await import('dotenv');config({path:'.env.local'});const m=await import('./tests/setup/integration-db.ts');await m.getTestDb();await m.closeTestDb();process.exit(0)})()"`
Then: `npx tsc --noEmit`
Expected: Migration ok, 0 Type-Fehler.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema/clubs.ts lib/db/schema/team-images.ts lib/db/schema/index.ts drizzle/
git commit -m "feat(profil): schema für Cover, Galerie, Insights-Toggle, Liga"
```

---

## Task 2: Query-Schicht `team_images` (add/list/delete/getKey)

**Files:**
- Create: `lib/db/queries/team-images.ts`
- Test: `tests/queries/team-images.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/team-images.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  addTeamImage,
  listTeamImages,
  deleteTeamImage,
  countTeamImages
} from "@/lib/db/queries/team-images";

async function makeTeam(): Promise<string> {
  const [club] = await db
    .insert(clubs)
    .values({ slug: `c-${createId().slice(0, 6)}`, name: "C", fussballdeVereinId: createId() })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true })
    .returning({ id: teams.id });
  return team.id;
}

describe("team-images query", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("fügt Bilder hinzu und listet sie nach sortOrder", async () => {
    const teamId = await makeTeam();
    await addTeamImage(teamId, "teams/x/gallery-1.jpg");
    await addTeamImage(teamId, "teams/x/gallery-2.jpg");
    const imgs = await listTeamImages(teamId);
    expect(imgs.length).toBe(2);
    expect(imgs[0].sortOrder).toBeLessThanOrEqual(imgs[1].sortOrder);
    expect(await countTeamImages(teamId)).toBe(2);
  });

  it("löscht nur Bilder des eigenen Teams", async () => {
    const a = await makeTeam();
    const b = await makeTeam();
    const imgA = await addTeamImage(a, "teams/a/g.jpg");
    // Löschen mit falschem Team → kein Effekt
    const wrong = await deleteTeamImage(b, imgA.id);
    expect(wrong).toBe(false);
    expect(await countTeamImages(a)).toBe(1);
    // Korrektes Team → gelöscht
    const ok = await deleteTeamImage(a, imgA.id);
    expect(ok).toBe(true);
    expect(await countTeamImages(a)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/queries/team-images.test.ts`
Expected: FAIL (`Cannot find module '@/lib/db/queries/team-images'`).

- [ ] **Step 3: Query implementieren**

Create `lib/db/queries/team-images.ts`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teamImages } from "@/lib/db/schema";

export interface TeamImageRow {
  id: string;
  storageKey: string;
  sortOrder: number;
}

/** Galerie-Bilder eines Teams, aufsteigend nach sortOrder (dann createdAt). */
export async function listTeamImages(teamId: string): Promise<TeamImageRow[]> {
  return db
    .select({ id: teamImages.id, storageKey: teamImages.storageKey, sortOrder: teamImages.sortOrder })
    .from(teamImages)
    .where(eq(teamImages.teamId, teamId))
    .orderBy(asc(teamImages.sortOrder), asc(teamImages.createdAt));
}

export async function countTeamImages(teamId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamImages)
    .where(eq(teamImages.teamId, teamId));
  return Number(row?.n ?? 0);
}

/** Fügt ein Galerie-Bild ans Ende an (sortOrder = aktuelle Anzahl). */
export async function addTeamImage(teamId: string, storageKey: string): Promise<TeamImageRow> {
  const next = await countTeamImages(teamId);
  const [row] = await db
    .insert(teamImages)
    .values({ teamId, storageKey, sortOrder: next })
    .returning({ id: teamImages.id, storageKey: teamImages.storageKey, sortOrder: teamImages.sortOrder });
  return row;
}

/** Löscht ein Bild nur, wenn es zum Team gehört. Liefert true bei Treffer. */
export async function deleteTeamImage(teamId: string, imageId: string): Promise<boolean> {
  const deleted = await db
    .delete(teamImages)
    .where(and(eq(teamImages.id, imageId), eq(teamImages.teamId, teamId)))
    .returning({ id: teamImages.id });
  return deleted.length > 0;
}

/** Storage-Key eines Galerie-Bilds (für den Serve-Endpoint), team-scoped. */
export async function getTeamImageKey(teamId: string, imageId: string): Promise<string | null> {
  const [row] = await db
    .select({ storageKey: teamImages.storageKey })
    .from(teamImages)
    .where(and(eq(teamImages.id, imageId), eq(teamImages.teamId, teamId)))
    .limit(1);
  return row?.storageKey ?? null;
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/team-images.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/team-images.ts tests/queries/team-images.test.ts
git commit -m "feat(profil): team_images query layer"
```

---

## Task 3: Upload-Kern für Cover + Galerie (geteilte Funktionen)

Analog zu `uploadTeamLogo`: Auth + `normalizeImageUpload` + `storeDocument` + DB. Als normale Funktionen (Route-Handler ruft sie auf → kein Server-Action-Bodylimit).

**Files:**
- Create: `lib/actions/team-images.ts`
- Test: `tests/actions/team-images.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/actions/team-images.test.ts` (Mocking-Muster wie `tests/actions/team-lifecycle.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "" } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`
  }))
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/documents", () => ({
  storeDocument: vi.fn().mockImplementation(async (key: string) => `local://${key.replace(/\//g, "_")}`)
}));

import { db } from "@/lib/db/client";
import { clubs, clubMemberships, subscriptions, teams, teamLicenses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import { uploadTeamCover, addTeamGalleryImage } from "@/lib/actions/team-images";
import { listTeamImages } from "@/lib/db/queries/team-images";

async function makeClubWithAdmin(slug: string) {
  const userId = createId();
  await db.insert(require("@/lib/db/schema").users).values({
    id: userId, email: `${userId}@kickpact.local`, emailVerified: true, name: "T",
    createdAt: new Date(), updatedAt: new Date()
  });
  mockUserId.current = userId;
  const [club] = await db.insert(clubs)
    .values({ slug, name: `Club ${slug}`, fussballdeVereinId: `V_${slug}`, onboardingStatus: "completed" })
    .returning({ id: clubs.id });
  await db.insert(clubMemberships).values({ userId, clubId: club.id, role: "admin" });
  await db.insert(subscriptions).values({ clubId: club.id, status: "trialing", billingCycle: "monthly" });
  const [team] = await db.insert(teams)
    .values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: `T_${slug}`, isActive: true })
    .returning({ id: teams.id });
  await db.insert(teamLicenses).values({ subscriptionClubId: club.id, teamId: team.id, plan: "pro", status: "trialing" });
  return { teamId: team.id };
}

describe("team-images actions", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("uploadTeamCover setzt cover_url", async () => {
    const { teamId } = await makeClubWithAdmin("club-cover");
    const res = await uploadTeamCover({ teamId, filename: "c.png", contentType: "image/png", bytes: Buffer.from([0x89, 0x50]) });
    expect(res.coverUrl).toMatch(/^local:\/\//);
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.coverUrl).toBe(res.coverUrl);
  });

  it("addTeamGalleryImage fügt hinzu, lehnt >8 ab", async () => {
    const { teamId } = await makeClubWithAdmin("club-gal");
    for (let i = 0; i < 8; i++) {
      await addTeamGalleryImage({ teamId, filename: `g${i}.png`, contentType: "image/png", bytes: Buffer.from([0x89]) });
    }
    expect((await listTeamImages(teamId)).length).toBe(8);
    await expect(
      addTeamGalleryImage({ teamId, filename: "g9.png", contentType: "image/png", bytes: Buffer.from([0x89]) })
    ).rejects.toThrow(/max|8/i);
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/actions/team-images.test.ts`
Expected: FAIL (`Cannot find module '@/lib/actions/team-images'`).

- [ ] **Step 3: Implementieren**

Create `lib/actions/team-images.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { storeDocument } from "@/lib/storage/documents";
import { normalizeImageUpload } from "@/lib/storage/images";
import { addTeamImage, countTeamImages } from "@/lib/db/queries/team-images";

const MAX_GALLERY_IMAGES = 8;

async function authTeam(teamId: string) {
  const [row] = await db
    .select({ clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");
  await assertClubWriteAccess(row.clubSlug, "admin");
  return row.clubSlug;
}

function revalidateTeam(clubSlug: string, teamId: string) {
  revalidatePath(`/verein/${clubSlug}/mannschaft/${teamId}/profil`);
}

export async function uploadTeamCover(input: {
  teamId: string; filename: string; contentType: string; bytes: Buffer;
}): Promise<{ coverUrl: string }> {
  const clubSlug = await authTeam(input.teamId);
  const norm = await normalizeImageUpload({ bytes: input.bytes, contentType: input.contentType, filename: input.filename });
  const key = `teams/${input.teamId}/cover-${createId()}.${norm.ext}`;
  const storageUrl = await storeDocument(key, norm.bytes, norm.contentType);
  await db.update(teams).set({ coverUrl: storageUrl }).where(eq(teams.id, input.teamId));
  revalidateTeam(clubSlug, input.teamId);
  return { coverUrl: storageUrl };
}

export async function addTeamGalleryImage(input: {
  teamId: string; filename: string; contentType: string; bytes: Buffer;
}): Promise<{ id: string; storageKey: string }> {
  const clubSlug = await authTeam(input.teamId);
  if ((await countTeamImages(input.teamId)) >= MAX_GALLERY_IMAGES) {
    throw new Error(`Maximal ${MAX_GALLERY_IMAGES} Galerie-Bilder erlaubt.`);
  }
  const norm = await normalizeImageUpload({ bytes: input.bytes, contentType: input.contentType, filename: input.filename });
  const key = `teams/${input.teamId}/gallery-${createId()}.${norm.ext}`;
  const storageUrl = await storeDocument(key, norm.bytes, norm.contentType);
  const row = await addTeamImage(input.teamId, storageUrl);
  revalidateTeam(clubSlug, input.teamId);
  return { id: row.id, storageKey: row.storageKey };
}

export async function removeTeamGalleryImage(input: { teamId: string; imageId: string }): Promise<void> {
  const clubSlug = await authTeam(input.teamId);
  const { deleteTeamImage } = await import("@/lib/db/queries/team-images");
  await deleteTeamImage(input.teamId, input.imageId);
  revalidateTeam(clubSlug, input.teamId);
}

export async function setTeamShowInsights(input: { teamId: string; show: boolean }): Promise<void> {
  const clubSlug = await authTeam(input.teamId);
  await db.update(teams).set({ showInsights: input.show }).where(eq(teams.id, input.teamId));
  revalidateTeam(clubSlug, input.teamId);
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/actions/team-images.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/team-images.ts tests/actions/team-images.test.ts
git commit -m "feat(profil): upload-kern für cover + galerie + insights-toggle"
```

---

## Task 4: Route-Handler für Cover & Galerie (Upload/Delete)

**Files:**
- Create: `app/api/teams/[teamId]/cover/route.ts`
- Create: `app/api/teams/[teamId]/images/route.ts`
- Create: `app/api/teams/[teamId]/images/[imageId]/route.ts`
- Test: `tests/api/team-images-route.test.ts`

- [ ] **Step 1: Gemeinsamen Redirect-Helfer wiederverwenden**

Die Handler nutzen denselben `isRedirectError`-Check + `getServerSession`-Gate wie `app/api/teams/[teamId]/logo/route.ts`. Muster 1:1 übernehmen (Auth-Fehler aus `assertClubWriteAccess` → 403).

- [ ] **Step 2: Failing test schreiben**

Create `tests/api/team-images-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, coverMock, addMock, removeMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(), coverMock: vi.fn(), addMock: vi.fn(), removeMock: vi.fn()
}));
vi.mock("@/lib/auth/session", () => ({ getServerSession: sessionMock }));
vi.mock("@/lib/actions/team-images", () => ({
  uploadTeamCover: coverMock, addTeamGalleryImage: addMock, removeTeamGalleryImage: removeMock
}));

import { POST as coverPOST } from "@/app/api/teams/[teamId]/cover/route";
import { POST as imgPOST } from "@/app/api/teams/[teamId]/images/route";
import { DELETE as imgDELETE } from "@/app/api/teams/[teamId]/images/[imageId]/route";

function reqWithFile() {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" }));
  return new Request("http://localhost/x", { method: "POST", body: fd });
}

describe("team-images routes", () => {
  beforeEach(() => {
    sessionMock.mockReset(); coverMock.mockReset(); addMock.mockReset(); removeMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1" } });
  });

  it("cover: 401 ohne Session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await coverPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("cover: 200 bei Erfolg", async () => {
    coverMock.mockResolvedValue({ coverUrl: "local://k" });
    const res = await coverPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(200);
    expect(coverMock).toHaveBeenCalled();
  });

  it("gallery: 400 mit Meldung bei Limit", async () => {
    addMock.mockRejectedValue(new Error("Maximal 8 Galerie-Bilder erlaubt."));
    const res = await imgPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Maximal 8/);
  });

  it("gallery delete: 200", async () => {
    removeMock.mockResolvedValue(undefined);
    const res = await imgDELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ teamId: "t1", imageId: "i1" })
    });
    expect(res.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith({ teamId: "t1", imageId: "i1" });
  });
});
```

- [ ] **Step 3: Run test → fail**

Run: `npx vitest run tests/api/team-images-route.test.ts`
Expected: FAIL (Module nicht gefunden).

- [ ] **Step 4: `cover/route.ts` implementieren**

Create `app/api/teams/[teamId]/cover/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { uploadTeamCover } from "@/lib/actions/team-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized", message: "Bitte zuerst anmelden." }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "bad-request", message: "Upload konnte nicht gelesen werden." }, { status: 400 }); }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no-file", message: "Keine Datei empfangen." }, { status: 400 });
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { coverUrl } = await uploadTeamCover({ teamId, filename: file.name, contentType: file.type, bytes });
    return NextResponse.json({ ok: true, coverUrl });
  } catch (e) {
    if (isRedirectError(e)) return NextResponse.json({ error: "forbidden", message: "Kein Zugriff auf diese Mannschaft." }, { status: 403 });
    return NextResponse.json({ error: "upload-failed", message: e instanceof Error ? e.message : "Upload fehlgeschlagen." }, { status: 400 });
  }
}
```

- [ ] **Step 5: `images/route.ts` (POST) implementieren**

Create `app/api/teams/[teamId]/images/route.ts` — identisch zu `cover/route.ts`, aber `addTeamGalleryImage` statt `uploadTeamCover` und Response `{ ok: true, image }`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { addTeamGalleryImage } from "@/lib/actions/team-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized", message: "Bitte zuerst anmelden." }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "bad-request", message: "Upload konnte nicht gelesen werden." }, { status: 400 }); }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no-file", message: "Keine Datei empfangen." }, { status: 400 });
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = await addTeamGalleryImage({ teamId, filename: file.name, contentType: file.type, bytes });
    return NextResponse.json({ ok: true, image });
  } catch (e) {
    if (isRedirectError(e)) return NextResponse.json({ error: "forbidden", message: "Kein Zugriff auf diese Mannschaft." }, { status: 403 });
    return NextResponse.json({ error: "upload-failed", message: e instanceof Error ? e.message : "Upload fehlgeschlagen." }, { status: 400 });
  }
}
```

- [ ] **Step 6: `images/[imageId]/route.ts` (DELETE) implementieren**

Create `app/api/teams/[teamId]/images/[imageId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { removeTeamGalleryImage } from "@/lib/actions/team-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string; imageId: string }> }) {
  const { teamId, imageId } = await params;
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await removeTeamGalleryImage({ teamId, imageId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isRedirectError(e)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "delete-failed", message: e instanceof Error ? e.message : "Löschen fehlgeschlagen." }, { status: 400 });
  }
}
```

- [ ] **Step 7: Run test → pass**

Run: `npx vitest run tests/api/team-images-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add app/api/teams/[teamId]/cover app/api/teams/[teamId]/images tests/api/team-images-route.test.ts
git commit -m "feat(profil): route-handler für cover- und galerie-upload"
```

---

## Task 5: Öffentlicher Bild-Serve-Endpoint (auf `teams/`-Keys begrenzt)

Liefert Cover/Logo/Galerie öffentlich aus — R2 → frischer Redirect, lokal → Stream. Nur Keys unter `teams/<teamId>/…`.

**Files:**
- Create: `app/api/teams/[teamId]/image/route.ts`
- Test: `tests/api/team-image-serve.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/api/team-image-serve.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { coverKeyMock, galleryKeyMock, signMock, readMock } = vi.hoisted(() => ({
  coverKeyMock: vi.fn(), galleryKeyMock: vi.fn(), signMock: vi.fn(), readMock: vi.fn()
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => coverKeyMock() }) }) }) }
}));
vi.mock("@/lib/db/queries/team-images", () => ({ getTeamImageKey: galleryKeyMock }));
vi.mock("@/lib/storage/documents", () => ({
  getDocumentSignedUrl: signMock, readLocalDocument: readMock
}));

import { GET } from "@/app/api/teams/[teamId]/image/route";

function req(qs: string) { return new Request(`http://localhost/api/teams/t1/image?${qs}`); }

describe("team image serve", () => {
  beforeEach(() => { coverKeyMock.mockReset(); galleryKeyMock.mockReset(); signMock.mockReset(); readMock.mockReset(); });

  it("404 für unbekannten slot", async () => {
    const res = await GET(req("slot=bogus"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("lehnt Keys außerhalb teams/<teamId>/ ab (kein Doc-Leak)", async () => {
    coverKeyMock.mockResolvedValue([{ coverUrl: "r2://bucket/verifications/secret.pdf" }]);
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(404);
    expect(signMock).not.toHaveBeenCalled();
  });

  it("R2-Cover → 302 Redirect auf signierte URL", async () => {
    coverKeyMock.mockResolvedValue([{ coverUrl: "r2://bucket/teams/t1/cover-x.jpg" }]);
    signMock.mockResolvedValue("https://signed.example/x");
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/x");
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/api/team-image-serve.test.ts`
Expected: FAIL (Module nicht gefunden).

- [ ] **Step 3: Implementieren**

Create `app/api/teams/[teamId]/image/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { getTeamImageKey } from "@/lib/db/queries/team-images";
import { getDocumentSignedUrl, readLocalDocument } from "@/lib/storage/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prüft, dass ein Storage-Key wirklich zu teams/<teamId>/ gehört. */
function isOwnTeamKey(key: string, teamId: string): boolean {
  const rel = key.replace(/^r2:\/\/[^/]+\//, "").replace(/^local:\/\//, "");
  return rel.startsWith(`teams/${teamId}/`);
}

function contentTypeFor(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot");
  const id = searchParams.get("id");

  let key: string | null = null;
  if (slot === "cover" || slot === "logo") {
    const [row] = await db
      .select({ coverUrl: teams.coverUrl, logoUrl: teams.logoUrl })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    key = slot === "cover" ? (row?.coverUrl ?? null) : (row?.logoUrl ?? null);
  } else if (slot === "gallery" && id) {
    key = await getTeamImageKey(teamId, id);
  } else {
    return NextResponse.json({ error: "bad-slot" }, { status: 404 });
  }

  if (!key || !isOwnTeamKey(key, teamId)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (key.startsWith("r2://")) {
    const url = await getDocumentSignedUrl(key, 3600);
    return NextResponse.redirect(url);
  }
  const rel = key.startsWith("local://") ? key.slice("local://".length) : key;
  try {
    const buf = await readLocalDocument(rel);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": contentTypeFor(rel), "Cache-Control": "public, max-age=3600" }
    });
  } catch {
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
  }
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/api/team-image-serve.test.ts`
Expected: PASS (3 tests). (`NextResponse.redirect` ergibt Status 307.)

- [ ] **Step 5: Commit**

```bash
git add "app/api/teams/[teamId]/image" tests/api/team-image-serve.test.ts
git commit -m "feat(profil): öffentlicher bild-serve-endpoint (teams/-scoped)"
```

---

## Task 6: `computeTeamSeasonStats` extrahieren + Dashboard refaktorieren

**Files:**
- Modify: `lib/db/queries/team-dashboard.ts` (Funktion ergänzen)
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx:65-83` (Inline-Logik durch Aufruf ersetzen)
- Test: `tests/queries/team-season-stats.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/team-season-stats.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";

describe("computeTeamSeasonStats", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("zählt S/U/N + Tore korrekt (Heim/Auswärts)", async () => {
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: "FC Test", fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // Heimsieg 3:1
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: "FC Test", gastName: "Gegner A", status: "finished", ergebnisHeim: 3, ergebnisGast: 1 });
    // Auswärtsniederlage 0:2 (Team ist Gast)
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: "Gegner B", gastName: "FC Test", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });

    const s = await computeTeamSeasonStats(team.id, team.name, "FC Test");
    expect(s.games).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.draws).toBe(0);
    expect(s.goalsFor).toBe(3);
    expect(s.goalsAgainst).toBe(3);
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/queries/team-season-stats.test.ts`
Expected: FAIL (`computeTeamSeasonStats` nicht exportiert).

- [ ] **Step 3: Funktion in `team-dashboard.ts` ergänzen**

Am Ende von `lib/db/queries/team-dashboard.ts` einfügen (Import `detectTeamSide` aus derselben Quelle nutzen, die die Seite verwendet — in `page.tsx` nachsehen; i.d.R. `@/lib/crawler/...` oder `@/lib/utils/...`):

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches } from "@/lib/db/schema/matches";
import { detectTeamSide } from "@/lib/crawler/fussballde"; // gleiche Quelle wie page.tsx

export interface TeamSeasonStats {
  games: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number;
}

/** Bilanz/Tore aus abgeschlossenen Matches. Heim/Auswärts robust über
 *  Team- + Vereinsname (vgl. ursprüngliche Inline-Logik der Dashboard-Seite). */
export async function computeTeamSeasonStats(
  teamId: string, teamName: string, clubName: string
): Promise<TeamSeasonStats> {
  const rows = await db.select().from(matches).where(eq(matches.teamId, teamId));
  const finished = rows.filter((m) => m.status === "finished" && m.ergebnisHeim !== null);
  const names = [teamName, clubName];
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of finished) {
    const isHeim = detectTeamSide(names, m.heimName) === "heim";
    const gF = isHeim ? (m.ergebnisHeim ?? 0) : (m.ergebnisGast ?? 0);
    const gA = isHeim ? (m.ergebnisGast ?? 0) : (m.ergebnisHeim ?? 0);
    goalsFor += gF; goalsAgainst += gA;
    if (gF > gA) wins++; else if (gF < gA) losses++; else draws++;
  }
  return { games: finished.length, wins, draws, losses, goalsFor, goalsAgainst };
}
```

**Hinweis:** Vor dem Schreiben in `page.tsx:1-30` prüfen, woher `detectTeamSide` importiert wird, und denselben Pfad verwenden. Falls `team-dashboard.ts` bereits `matches`/`db` importiert, Doppelimporte vermeiden.

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/team-season-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Dashboard-Seite refaktorieren**

In `app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx` die Inline-Berechnung (Z. 65–83) durch einen Aufruf ersetzen und `finishedMatches`/`wins`/… aus dem Ergebnis lesen:

```ts
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";
// ...
const { games, wins, draws, losses, goalsFor, goalsAgainst } =
  await computeTeamSeasonStats(team.id, team.name, club.name);
```

Die Verwendungen weiter unten (`{ label: "S/U/N", value: `${wins}/${draws}/${losses}` }` etc.) bleiben gleich. Nicht mehr benötigte lokale Variablen/`detectTeamSide`-Import in der Seite entfernen.

- [ ] **Step 6: Verifizieren + Commit**

Run: `npx tsc --noEmit` (0 Fehler) und `npx vitest run tests/queries/team-season-stats.test.ts`
```bash
git add lib/db/queries/team-dashboard.ts "app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx" tests/queries/team-season-stats.test.ts
git commit -m "refactor(stats): computeTeamSeasonStats in query-schicht, dashboard nutzt sie"
```

---

## Task 7: `getPublicTeamInsights` (laufende + letzte Saison)

**Files:**
- Create: `lib/db/queries/team-public-insights.ts`
- Test: `tests/queries/team-public-insights.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/team-public-insights.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, seasonResults } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { getPublicTeamInsights } from "@/lib/db/queries/team-public-insights";

async function seed(showInsights: boolean) {
  const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: "FC Test", fussballdeVereinId: createId() }).returning({ id: clubs.id });
  const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true, showInsights }).returning({ id: teams.id, name: teams.name, saison: teams.saison });
  await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: "FC Test", gastName: "G", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });
  await db.insert(seasonResults).values({ teamId: team.id, saison: "2024/25", finalPosition: 2, promoted: true });
  return { teamId: team.id, teamName: team.name, clubName: "FC Test" };
}

describe("getPublicTeamInsights", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert null wenn show_insights=false", async () => {
    const s = await seed(false);
    expect(await getPublicTeamInsights(s.teamId, s.teamName, s.clubName)).toBeNull();
  });

  it("kombiniert laufende + letzte Saison", async () => {
    const s = await seed(true);
    const ins = await getPublicTeamInsights(s.teamId, s.teamName, s.clubName);
    expect(ins).not.toBeNull();
    expect(ins!.current.games).toBe(1);
    expect(ins!.current.wins).toBe(1);
    expect(ins!.lastSeason?.finalPosition).toBe(2);
    expect(ins!.lastSeason?.promoted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/queries/team-public-insights.test.ts`
Expected: FAIL (Module nicht gefunden).

- [ ] **Step 3: Implementieren**

Create `lib/db/queries/team-public-insights.ts`:

```ts
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, seasonResults } from "@/lib/db/schema";
import { computeTeamSeasonStats, type TeamSeasonStats } from "./team-dashboard";

export interface PublicTeamInsights {
  current: TeamSeasonStats;
  lastSeason: {
    saison: string;
    finalPosition: number | null;
    teamsInLeague: number | null;
    promoted: boolean;
    relegated: boolean;
  } | null;
}

/**
 * Insights fürs öffentliche Profil. `null`, wenn die Mannschaft Insights
 * ausgeblendet hat (`teams.show_insights=false`).
 *
 * „Letzte Saison": jüngste season_results-Zeile ≠ aktuelle Saison. Das
 * saison-Format weicht zwischen Tabellen ab ("2526" vs. "2024/25"), daher
 * NICHT per Gleichheit, sondern per ORDER BY saison DESC + Ausschluss der
 * aktuellen Team-Saison.
 */
export async function getPublicTeamInsights(
  teamId: string, teamName: string, clubName: string
): Promise<PublicTeamInsights | null> {
  const [t] = await db
    .select({ showInsights: teams.showInsights, saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!t || !t.showInsights) return null;

  const current = await computeTeamSeasonStats(teamId, teamName, clubName);

  const [last] = await db
    .select({
      saison: seasonResults.saison,
      finalPosition: seasonResults.finalPosition,
      teamsInLeague: seasonResults.teamsInLeague,
      promoted: seasonResults.promoted,
      relegated: seasonResults.relegated
    })
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, teamId), ne(seasonResults.saison, t.saison)))
    .orderBy(desc(seasonResults.saison))
    .limit(1);

  return { current, lastSeason: last ?? null };
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/team-public-insights.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/team-public-insights.ts tests/queries/team-public-insights.test.ts
git commit -m "feat(profil): getPublicTeamInsights (laufende + letzte saison)"
```

---

## Task 8: `getPublicTeamProfileBySlug` erweitern (Cover, Galerie, Liga, Insights)

**Files:**
- Modify: `lib/db/queries/sponsor-discover.ts:81-158`
- Test: `tests/queries/public-profile.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `tests/queries/public-profile.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, teamImages } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";

describe("getPublicTeamProfileBySlug (erweitert)", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert Cover-/Galerie-/Liga-Felder + Insights-Flag", async () => {
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: "FC Test", ort: "Dossenheim", fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({
      clubId: club.id, name: "2. Herren", saison: "2526", fussballdeTeamId: createId(),
      isActive: true, discoverable: true, publicSlug: "fc-test-2-herren-ab12",
      coverUrl: "r2://b/teams/x/cover.jpg", league: "Kreisliga", showInsights: true
    }).returning({ id: teams.id });
    await db.insert(teamImages).values({ teamId: team.id, storageKey: "r2://b/teams/x/gallery-1.jpg", sortOrder: 0 });

    const p = await getPublicTeamProfileBySlug("fc-test-2-herren-ab12");
    expect(p).not.toBeNull();
    expect(p!.league).toBe("Kreisliga");
    expect(p!.clubOrt).toBe("Dossenheim");
    expect(p!.showInsights).toBe(true);
    expect(p!.gallery.length).toBe(1);
    expect(p!.coverUrl).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run tests/queries/public-profile.test.ts`
Expected: FAIL (Felder `league`/`gallery`/`showInsights`/`coverUrl` fehlen am Typ).

- [ ] **Step 3: Interface + Query erweitern**

In `lib/db/queries/sponsor-discover.ts` das `PublicTeamProfile`-Interface ergänzen:

```ts
  league: string | null;
  showInsights: boolean;
  /** Anzeigbare Cover-URL (über den Serve-Endpoint) oder null. */
  coverUrl: string | null;
  gallery: { id: string; url: string }[];
```

Die Select-Spalten um `teams.league`, `teams.showInsights`, `teams.coverUrl` erweitern. Statt direkter signierter URLs die **Serve-Endpoint-URLs** bauen (stabil, kein Ablauf):

```ts
import { listTeamImages } from "./team-images";
// ...
  const gallery = (await listTeamImages(row.teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${row.teamId}/image?slot=gallery&id=${g.id}`
  }));

  const coverUrl = row.coverUrl ? `/api/teams/${row.teamId}/image?slot=cover` : null;
  const logoUrl = row.logoUrl ? `/api/teams/${row.teamId}/image?slot=logo` : null;
```

Im Return-Objekt `logoUrl` auf den Serve-Endpoint umstellen und `league`, `showInsights`, `coverUrl`, `gallery` ergänzen. (Der bisherige `getDocumentSignedUrl`-Aufruf fürs Logo entfällt — die Auslieferung übernimmt der Serve-Endpoint.)

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run tests/queries/public-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + Commit**

Run: `npx tsc --noEmit` (auf neue Pflichtfelder im Return achten).
```bash
git add lib/db/queries/sponsor-discover.ts tests/queries/public-profile.test.ts
git commit -m "feat(profil): public-profile-query um cover/galerie/liga/insights erweitert"
```

---

## Task 9: Öffentliche Seite neu aufbauen (Hero/Insights/Galerie/About/How/CTA + OG)

**Files:**
- Modify: `app/m/[slug]/page.tsx`
- Create: `app/m/[slug]/_components/profile-hero.tsx`
- Create: `app/m/[slug]/_components/insights-strip.tsx`
- Create: `app/m/[slug]/_components/gallery-strip.tsx`
- (bestehend) `app/m/[slug]/_components/sponsor-inquiry-form.tsx` bleibt

- [ ] **Step 1: Hero-Komponente**

Create `app/m/[slug]/_components/profile-hero.tsx` (Server Component, Richtung A / CI-Grün; Platzhalter wenn kein Cover):

```tsx
interface HeroProps {
  displayName: string;
  clubName: string;
  league: string | null;
  clubOrt: string | null;
  saison: string;
  verified: boolean;
  coverUrl: string | null;
  logoUrl: string | null;
}

export function ProfileHero({ displayName, clubName, league, clubOrt, saison, verified, coverUrl, logoUrl }: HeroProps) {
  const meta = [clubName, league, clubOrt].filter(Boolean).join(" · ");
  return (
    <header className="relative h-64 overflow-hidden bg-brand-night-navy">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
      ) : (
        <div className="absolute inset-0 opacity-[0.12]"
             style={{ backgroundImage: "repeating-linear-gradient(45deg,#84cc16 0 2px,transparent 2px 20px)" }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/40 to-transparent" />
      <span className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
        Saison {saison}
      </span>
      <div className="absolute inset-x-4 bottom-4">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent text-xl font-black text-brand-night-navy shadow-lg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
          ) : displayName.charAt(0)}
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{displayName}</h1>
        <p className="text-xs text-brand-neutral">
          {meta}{verified && <> · <span className="font-semibold text-accent">✔ Verifiziert</span></>}
        </p>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Insights-Strip**

Create `app/m/[slug]/_components/insights-strip.tsx`:

```tsx
import type { PublicTeamInsights } from "@/lib/db/queries/team-public-insights";

export function InsightsStrip({ insights }: { insights: PublicTeamInsights }) {
  const c = insights.current;
  const tiles = [
    { n: insights.lastSeason?.finalPosition ? `${insights.lastSeason.finalPosition}.` : "–", l: "Platz (Vorj.)" },
    { n: `${c.wins}/${c.draws}/${c.losses}`, l: "Bilanz" },
    { n: `${c.goalsFor}:${c.goalsAgainst}`, l: "Tore" },
    { n: String(c.games), l: "Spiele" }
  ];
  return (
    <section className="px-4 pt-4">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">Saison-Insights</div>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-xl bg-brand-night-navy/[0.04] p-2.5 text-center">
            <div className="text-lg font-extrabold leading-none text-brand-night-navy">{t.n}</div>
            <div className="mt-1 text-[8.5px] uppercase tracking-wide text-brand-night-navy/60">{t.l}</div>
          </div>
        ))}
      </div>
      {insights.lastSeason && (insights.lastSeason.promoted || insights.lastSeason.relegated) && (
        <div className="mt-2 rounded-lg bg-brand-night-navy/[0.04] px-3 py-2 text-xs text-brand-night-navy/80">
          Letzte Saison: {insights.lastSeason.promoted ? "Aufstieg ↑" : "Abstieg ↓"}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Galerie-Strip**

Create `app/m/[slug]/_components/gallery-strip.tsx`:

```tsx
export function GalleryStrip({ images }: { images: { id: string; url: string }[] }) {
  if (images.length === 0) return null;
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">Galerie</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={img.id} src={img.url} alt="" className="h-24 w-36 flex-none rounded-xl object-cover" />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `page.tsx` neu zusammensetzen + OG**

`app/m/[slug]/page.tsx` so umbauen, dass es das erweiterte Profil lädt, `getPublicTeamInsights` aufruft und die Komponenten rendert. `generateMetadata` setzt das Cover als OG-Image. Gerüst:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";
import { getPublicTeamInsights } from "@/lib/db/queries/team-public-insights";
import { ProfileHero } from "./_components/profile-hero";
import { InsightsStrip } from "./_components/insights-strip";
import { GalleryStrip } from "./_components/gallery-strip";
import { SponsorInquiryForm } from "./_components/sponsor-inquiry-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicTeamProfileBySlug(slug);
  if (!p) return { title: "Mannschaft nicht gefunden" };
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return {
    title: `${p.displayName} — Sponsoring auf KickPact`,
    description: p.tagline ?? `${p.displayName} sucht Sponsoren auf KickPact.`,
    openGraph: { images: p.coverUrl ? [`${base}${p.coverUrl}`] : undefined }
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicTeamProfileBySlug(slug);
  if (!p) notFound();

  const insights = p.showInsights ? await getPublicTeamInsights(p.teamId, p.teamName, p.clubName) : null;
  const verified = Boolean(p.teamVerifiedAt || p.clubVerifiedAt);

  return (
    <main className="mx-auto max-w-screen-sm bg-white pb-12">
      <ProfileHero
        displayName={p.displayName} clubName={p.clubName} league={p.league} clubOrt={p.clubOrt}
        saison={p.saison} verified={verified} coverUrl={p.coverUrl} logoUrl={p.logoUrl}
      />
      {insights && <InsightsStrip insights={insights} />}
      <GalleryStrip images={p.gallery} />

      {(p.tagline || p.goals) && (
        <section className="px-4 pt-5">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">Über uns</div>
          {p.tagline && <p className="text-sm leading-relaxed text-brand-night-navy/90">{p.tagline}</p>}
          {p.goals && <p className="mt-1 text-sm text-brand-night-navy/70">🎯 <span className="font-semibold">Unsere Ziele:</span> {p.goals}</p>}
        </section>
      )}

      <section className="px-4 pt-5">
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <h2 className="mb-1 text-sm font-bold text-brand-night-navy">So funktioniert Sponsoring auf KickPact</h2>
          <p className="text-xs leading-relaxed text-brand-night-navy/70">
            Du versprichst einen Betrag pro Ereignis — z. B. 5 € pro Tor. Am Monatsende kommt eine faire Rechnung. Kein Aufwand für die Mannschaft.
          </p>
        </div>
      </section>

      <section className="px-4 pt-5">
        <div className="rounded-2xl bg-brand-night-navy/[0.04] p-4">
          <h2 className="mb-2 text-sm font-bold text-brand-night-navy">Sponsoring anfragen</h2>
          <SponsorInquiryForm teamSlug={p.publicSlug} teamName={p.displayName} />
        </div>
      </section>
    </main>
  );
}
```

**Hinweis:** Die bestehenden Props von `SponsorInquiryForm` in der aktuellen `page.tsx` prüfen und 1:1 übernehmen (Namen ggf. anpassen). Brand-Tokens (`bg-accent`, `text-brand-night-navy`, `text-brand-neutral`) gegen `tailwind.config` abgleichen; fehlt ein Token, passendes vorhandenes verwenden.

- [ ] **Step 5: Verifizieren (Dev-Server + Screenshot)**

`npm run dev` starten, ein discoverable Team mit Cover/Galerie/Insights aufrufen (`/m/{slug}`), per Preview-Tools Screenshot machen (mobil + desktop). Privates Team → 404 prüfen.

- [ ] **Step 6: tsc + Commit**

```bash
git add "app/m/[slug]" && npx tsc --noEmit
git commit -m "feat(profil): öffentliche seite neu aufgebaut (richtung A / grün) + OG"
```

---

## Task 10: Minimales Editing in der bestehenden `…/profil`-Seite

Cover-Upload, Galerie hinzufügen/löschen, Insights-Toggle. Volle „Mein Profil"-UI = Baustein 2.

**Files:**
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/profil/page.tsx`
- Create: `app/(verein)/verein/[slug]/mannschaft/[teamId]/profil/_components/media-manager.tsx`

- [ ] **Step 1: `MediaManager` (Client-Komponente)**

Create `…/profil/_components/media-manager.tsx` — analog zu `team-stammdaten-form.tsx`, aber gegen die neuen Endpoints. Cover via `POST /api/teams/{teamId}/cover`, Galerie-Bild via `POST /api/teams/{teamId}/images`, Löschen via `DELETE /api/teams/{teamId}/images/{id}`. Insights-Toggle ruft die Server-Action `setTeamShowInsights`. Gleiche `accept`/Größen-/HEIC-Logik wie im Stammdaten-Form (10 MB, `ACCEPT_ATTR`). Nach jeder Aktion `router.refresh()` + Toast.

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setTeamShowInsights } from "@/lib/actions/team-images";

const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif";

export function MediaManager({
  teamId, coverUrl, gallery, showInsights
}: { teamId: string; coverUrl: string | null; gallery: { id: string; url: string }[]; showInsights: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function upload(path: string, file: File) {
    if (file.size > 10_000_000) { toast.error("Bild zu groß (max. 10 MB)."); return; }
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(path, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.message ?? "Upload fehlgeschlagen."); }
  }

  function onCover(file: File) {
    start(async () => {
      try { await upload(`/api/teams/${teamId}/cover`, file); toast.success("Cover aktualisiert."); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Fehler."); }
    });
  }
  function onGallery(file: File) {
    start(async () => {
      try { await upload(`/api/teams/${teamId}/images`, file); toast.success("Bild hinzugefügt."); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Fehler."); }
    });
  }
  function onDelete(id: string) {
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/images/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Bild entfernt."); router.refresh(); } else { toast.error("Löschen fehlgeschlagen."); }
    });
  }
  function onToggle(next: boolean) {
    start(async () => { await setTeamShowInsights({ teamId, show: next }); router.refresh(); });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold">Cover-Bild</label>
        <input type="file" accept={ACCEPT} disabled={pending}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onCover(f); e.currentTarget.value = ""; }} />
        {coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={coverUrl} alt="Cover" className="mt-2 h-28 w-full rounded-lg object-cover" />}
      </div>
      <div>
        <label className="text-sm font-semibold">Galerie ({gallery.length}/8)</label>
        <input type="file" accept={ACCEPT} disabled={pending || gallery.length >= 8}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onGallery(f); e.currentTarget.value = ""; }} />
        <div className="mt-2 flex flex-wrap gap-2">
          {gallery.map((g) => (
            <div key={g.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" className="h-20 w-28 rounded-lg object-cover" />
              <button onClick={() => onDelete(g.id)} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">✕</button>
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked={showInsights} disabled={pending}
               onChange={(e) => onToggle(e.target.checked)} />
        Saison-Insights auf dem öffentlichen Profil anzeigen
      </label>
    </div>
  );
}
```

- [ ] **Step 2: In die `profil/page.tsx` einbinden**

In `…/profil/page.tsx` die Daten laden (Team: `coverUrl`, `showInsights`; Galerie via `listTeamImages` → Serve-URLs bauen wie in Task 8) und `<MediaManager …/>` unter dem bestehenden Public-Profile-Form rendern.

- [ ] **Step 3: Verifizieren (Dev) + Commit**

Dev-Server: Cover hochladen (inkl. HEIC), 2 Galerie-Bilder, eines löschen, Insights aus → auf `/m/{slug}` prüfen.
```bash
git add "app/(verein)/verein/[slug]/mannschaft/[teamId]/profil" && npx tsc --noEmit
git commit -m "feat(profil): minimales media-editing (cover/galerie/insights) im editor"
```

---

## Task 11: Liga aus dem Crawler in `teams.league` schreiben

**Files:**
- Modify: `lib/crawler/fussballde.ts` (Parse: `row-competition`-Zeile, ~Z. 416)
- Modify: Crawl-Persistenz (wo Team-/Match-Ergebnisse gespeichert werden — via `lib/db/queries/crawler.ts` ermitteln)
- Test: `tests/crawler/league-extract.test.ts`

- [ ] **Step 1: Parse-Stelle lokalisieren**

In `lib/crawler/fussballde.ts` die Funktion lesen, die über die Spielplan-Tabelle iteriert (enthält `tr.classList.contains("row-competition")`, ~Z. 416). Aktuell werden `row-competition`/`row-headline` übersprungen. Die `row-competition`-Zeile enthält den Liga-/Spielklassen-Text — diesen als „aktuelle Liga" mitführen und im Ergebnis-Objekt der Funktion zurückgeben (z. B. neues Feld `league?: string`).

- [ ] **Step 2: Failing test schreiben**

Create `tests/crawler/league-extract.test.ts` — testet die reine Extraktions-Hilfsfunktion (kein Netzwerk). Falls die Extraktion inline ist, eine kleine exportierte Hilfsfunktion `extractLeagueFromRows(htmlOrRows)` herauslösen und gegen ein Mini-Fixture testen:

```ts
import { describe, expect, it } from "vitest";
import { extractLeagueFromCompetitionText } from "@/lib/crawler/fussballde";

describe("extractLeagueFromCompetitionText", () => {
  it("liefert sauberen Liga-Namen", () => {
    expect(extractLeagueFromCompetitionText("Kreisliga Mannheim, Herren")).toBe("Kreisliga Mannheim");
    expect(extractLeagueFromCompetitionText("  Kreisklasse A  ")).toBe("Kreisklasse A");
  });
  it("liefert null bei Leerwert", () => {
    expect(extractLeagueFromCompetitionText("")).toBeNull();
  });
});
```

- [ ] **Step 3: Hilfsfunktion implementieren**

In `lib/crawler/fussballde.ts` exportieren:

```ts
/** Normalisiert den Text einer row-competition-Zeile zu einem Liga-Namen.
 *  Schneidet alles ab dem ersten Komma ab (z. B. ", Herren") und trimmt. */
export function extractLeagueFromCompetitionText(raw: string): string | null {
  const cleaned = raw.split(",")[0]?.trim() ?? "";
  return cleaned.length ? cleaned : null;
}
```

Im Parse-Loop bei `row-competition` `extractLeagueFromCompetitionText(zeilentext)` aufrufen und das Ergebnis als Liga des Crawls merken.

- [ ] **Step 4: Persistenz**

In der Crawl-Speicherfunktion (über `lib/db/queries/crawler.ts` finden — dort, wo nach dem Crawl der Team-/Status aktualisiert wird) ergänzen: wenn eine Liga extrahiert wurde, `db.update(teams).set({ league }).where(eq(teams.id, teamId))`. Nur überschreiben, wenn ein nicht-leerer Wert vorliegt (alten Wert nicht mit `null` plätten).

- [ ] **Step 5: Run test → pass**

Run: `npx vitest run tests/crawler/league-extract.test.ts`
Expected: PASS.

- [ ] **Step 6: tsc + Commit**

```bash
git add lib/crawler/fussballde.ts lib/db/queries/crawler.ts tests/crawler/league-extract.test.ts && npx tsc --noEmit
git commit -m "feat(profil): liga aus crawler in teams.league übernehmen"
```

---

## Abschluss

- [ ] **Volllauf:** `npm test` (gesamte Suite grün), `npx tsc --noEmit` (0 Fehler).
- [ ] **Manuelle Verifikation** auf `/m/{slug}`: Cover + Platzhalter, Galerie add/delete, Insights an/aus, Liga im Hero (nach Crawl), 404 für privat.
- [ ] **Branch pushen** und PR erstellen (Reviewer-Hinweis: Bild-Serve-Endpoint ist absichtlich öffentlich, aber auf `teams/`-Keys begrenzt — kein Doc-Leak).

---

## Self-Review-Notiz (für Umsetzende)

- **Spec-Abdeckung:** Schema (T1), Galerie-Model+Query (T2), Upload-Kern (T3), Upload-Routes (T4), öffentliche Auslieferung/Security (T5), Insights-Extraktion (T6) + Aggregation (T7), Public-Query (T8), neue Seite+OG (T9), Editing-Minimal (T10), Liga/Crawler (T11). Alle Erfolgskriterien des Specs sind abgedeckt.
- **Typen-Konsistenz:** `TeamSeasonStats` (T6) wird in T7 importiert; `PublicTeamInsights` (T7) in T9; `getTeamImageKey`/`deleteTeamImage` (T2) in T3/T5; `coverUrl`/`gallery`/`league`/`showInsights` (T8) in T9/T10.
- **Offene Implementierungs-Details, die beim Umsetzen am Code zu verifizieren sind:** Import-Pfad von `detectTeamSide`; exakte Props von `SponsorInquiryForm`; genaue Crawl-Speicherfunktion in `crawler.ts`; vorhandene Brand-Tokens in `tailwind.config`.
```
