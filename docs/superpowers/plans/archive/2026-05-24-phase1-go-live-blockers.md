# Phase 1 — Go-Live-Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repariere die vier Show-Stopper aus dem Audit (`docs/superpowers/plans/2026-05-24-codebase-audit.md` Phase 1), die einen produktiven Go-Live blockieren: Stripe-Checkout funktioniert wieder nach Onboarding, `/api/squad` leakt keine Spielerdaten mehr, Sponsor-Invitations laufen ab + sind single-use, Impressum/Datenschutz haben rechtswirksame Angaben.

**Architecture:**
- **Datenbank-Schema-Migrationen** via Drizzle: `stripe_customer_id` nullable, `sponsor_invitations.expires_at` hinzu, `players.blocked` für Spätere Opt-out-Mechanik.
- **Bestehendes Auth-Pattern** (`requireUser()` + `findInvitationByToken`) wird in `/api/squad` nachgezogen, statt Anonym-Endpoint.
- **Stripe-Customer wird lazy in `createCheckoutSession` erzeugt**, statt mit Placeholder-String beim Onboarding. Bestehende Placeholder-Daten werden in derselben Migration auf NULL gesetzt.
- **Datenschutz-Anpassungen** sind Content-Edits in den vorhandenen `app/(legal)/…/page.tsx`-Files — keine neuen Routes.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Postgres, Better Auth, Stripe SDK, Vitest (Unit) + Integration-Tests via `tests/setup/integration-db.ts` (Docker-Postgres auf Port 54329).

---

## File Structure

**Wird modifiziert:**
- `lib/db/schema/billing.ts:27` — `stripeCustomerId` von `notNull()` → nullable
- `lib/db/schema/invitations.ts:8-19` — neue Spalte `expiresAt`
- `lib/db/schema/clubs.ts:86-100` — neue Spalte `players.blocked`
- `app/(onboarding)/onboarding/verein/_actions/finalize.ts:128` — Placeholder raus, `null` rein
- `lib/actions/subscriptions.ts:42-65` — `createCheckoutSession` erzeugt Customer immer wenn nicht-real-vorhanden
- `lib/db/queries/invitations.ts:11-43` — `createInvitation` setzt `expiresAt`, `findInvitationByToken` filtert `status=pending` + nicht abgelaufen
- `app/api/squad/route.ts:8-47` — `requireUser()` + nutzt gefilterten Query
- `app/(legal)/impressum/page.tsx` — Anschrift, PLZ, USt-IdNr Platzhalter ersetzen
- `app/(legal)/datenschutz/page.tsx` — Verantwortlicher-Anschrift, Subprocessor-Detailtabelle, neuer Abschnitt für fussball.de-Spielerdaten + Opt-out-Hinweis

**Wird erstellt:**
- `drizzle/migrations/0011_*.sql` — generierter Migration-File für die drei Schema-Änderungen (Inhalt am Ende ergänzt um Backfill-UPDATE)
- `tests/lib/invitations.test.ts` — Tests für `expiresAt`-Verhalten in `createInvitation` und `findInvitationByToken`
- `tests/api/squad-route.test.ts` — Tests für Auth-Guard und Status-Filter
- `tests/actions/subscriptions-checkout.test.ts` — Tests für `createCheckoutSession`-Customer-Create-Pfad

**Bleibt unverändert (aber abhängig):**
- `lib/auth/session.ts` `requireUser()` — Helper-Import
- `lib/db/queries/crawler.ts upsertPlayer` — wird in Phase 4 (DSGVO-Vollständigkeit) erweitert; Schema-Spalte `blocked` kommt vor, Enforcement später

**Manuelle Schritte (Content):** Tasks 8 + 9 brauchen reale Daten vom Operator (Anschrift, USt-IdNr). Diese Tasks listen die zu füllenden Felder explizit, der Engineer holt die Daten vom Operator vor dem Commit.

---

## Task 1: Schema — `subscriptions.stripeCustomerId` nullable + Migration generieren

**Files:**
- Modify: `lib/db/schema/billing.ts:27`
- Create: `drizzle/migrations/0011_<auto>.sql` (Drizzle generiert Namen)

- [ ] **Step 1: Schema ändern**

In `lib/db/schema/billing.ts:23-34`, ändere die `subscriptions`-Tabelle so dass `stripeCustomerId` nullable wird (unique bleibt erhalten — Postgres erlaubt mehrere NULL bei unique):

```ts
export const subscriptions = pgTable("subscriptions", {
  clubId: text("club_id")
    .primaryKey()
    .references(() => clubs.id, { onDelete: "cascade" }),
  // Erlaubt NULL bis zum ersten echten Stripe-Checkout. Beim Onboarding
  // wird nur ein subscriptions-Row angelegt, der echte Customer entsteht
  // lazy in createCheckoutSession (lib/actions/subscriptions.ts).
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: Migration generieren**

Run: `npm run db:generate`
Expected: Neue Datei `drizzle/migrations/0011_<random_name>.sql` mit Inhalt ähnlich:

```sql
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_customer_id" DROP NOT NULL;
```

- [ ] **Step 3: Backfill-Statement in dieselbe Migration einfügen**

Öffne die neu generierte `drizzle/migrations/0011_*.sql` und füge am Ende hinzu (am Schluss der Datei, unterhalb der DROP NOT NULL-Zeile):

```sql
--> statement-breakpoint
-- Backfill: alte Placeholder-Werte aus finalize.ts auf NULL setzen, damit
-- createCheckoutSession beim ersten echten Checkout einen neuen Customer
-- erzeugt statt mit dem Placeholder zu crashen.
UPDATE "subscriptions" SET "stripe_customer_id" = NULL
WHERE "stripe_customer_id" LIKE 'placeholder_%';
```

- [ ] **Step 4: Migration testen (lokale Test-DB)**

Voraussetzung: `docker compose -f docker-compose.test.yml up -d` läuft.

Run: `DATABASE_URL=postgres://test:test@localhost:54329/kickpact_test dotenv -- drizzle-kit migrate`

Expected: Output enthält `0011_<name>` als applied, kein Fehler. Bei bereits angewendeter Migration tut der Befehl nichts.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/billing.ts drizzle/migrations/0011_*.sql drizzle/migrations/meta/
git commit -m "feat(schema): make subscriptions.stripe_customer_id nullable + backfill placeholders"
```

---

## Task 2: Finalize — Placeholder durch NULL ersetzen

**Files:**
- Modify: `app/(onboarding)/onboarding/verein/_actions/finalize.ts:128`

- [ ] **Step 1: Code ändern**

In `app/(onboarding)/onboarding/verein/_actions/finalize.ts:126-132`, ersetze den `subscriptions`-Insert:

```ts
    await tx.insert(subscriptions).values({
      clubId: club.id,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "trialing",
      trialEndsAt: trialEnd
    });
```

- [ ] **Step 2: Build prüfen (TypeScript)**

Run: `npx tsc --noEmit`
Expected: Keine Type-Errors für diese Datei. (Andere Errors im Projekt sind nicht Teil dieses Plans — wenn welche auftauchen, in `git stash` legen und prüfen ob sie vor diesem Plan schon da waren.)

- [ ] **Step 3: Commit**

```bash
git add app/\(onboarding\)/onboarding/verein/_actions/finalize.ts
git commit -m "fix(onboarding): write NULL instead of placeholder for stripe_customer_id"
```

---

## Task 3: createCheckoutSession — Customer immer lazy erzeugen, defensiv auch Placeholder-Strings

**Files:**
- Create: `tests/actions/subscriptions-checkout.test.ts`
- Modify: `lib/actions/subscriptions.ts:42-65`

- [ ] **Step 1: Failing Test schreiben**

Create `tests/actions/subscriptions-checkout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

// Mocks MÜSSEN vor dem Import des SUT stehen, damit der Modul-Cache sie sieht.
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn().mockResolvedValue({
    user: { id: "u1", email: "admin@verein.de" },
    club: { id: "club1", slug: "fc-test", name: "FC Test" },
    role: "admin"
  })
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u1", email: "admin@verein.de" })
}));

const stripeCustomersCreate = vi.fn();
const stripeCheckoutSessionsCreate = vi.fn();
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    customers: { create: stripeCustomersCreate },
    checkout: { sessions: { create: stripeCheckoutSessionsCreate } }
  }),
  isStripeConfigured: () => true
}));

vi.mock("@/lib/stripe/pricing", () => ({
  getStripePriceId: (plan: string) => `price_${plan}_test`,
  TRIAL_DAYS: 30
}));

// Drizzle DB mocking: minimal — wir testen nur die Branch-Logik der Funktion.
const dbSelectFn = vi.fn();
const dbUpdateFn = vi.fn();
const dbInsertFn = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => dbSelectFn() })
      })
    }),
    update: () => ({
      set: () => ({ where: () => dbUpdateFn() })
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => dbInsertFn() })
    })
  }
}));

import { createCheckoutSession } from "@/lib/actions/subscriptions";

beforeEach(() => {
  stripeCustomersCreate.mockReset();
  stripeCheckoutSessionsCreate.mockReset();
  dbSelectFn.mockReset();
  dbUpdateFn.mockReset();
  dbInsertFn.mockReset();
  stripeCheckoutSessionsCreate.mockResolvedValue({ url: "https://stripe/checkout/test" });
});

describe("createCheckoutSession", () => {
  it("erzeugt einen Stripe-Customer wenn subscription.stripeCustomerId NULL ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: null, status: "trialing" }
    ]);
    stripeCustomersCreate.mockResolvedValue({ id: "cus_real_123" });

    const { url } = await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).toHaveBeenCalledOnce();
    expect(dbUpdateFn).toHaveBeenCalledOnce();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_real_123" })
    );
    expect(url).toBe("https://stripe/checkout/test");
  });

  it("erzeugt einen Customer wenn stripeCustomerId noch ein legacy 'placeholder_…' ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "placeholder_club1", status: "trialing" }
    ]);
    stripeCustomersCreate.mockResolvedValue({ id: "cus_real_456" });

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).toHaveBeenCalledOnce();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_real_456" })
    );
  });

  it("reuse den existierenden Customer wenn stripeCustomerId schon real ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_existing_789", status: "active" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    expect(dbUpdateFn).not.toHaveBeenCalled();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing_789" })
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen → muss failen**

Run: `npm test -- tests/actions/subscriptions-checkout.test.ts`
Expected: FAIL — der Test mit `placeholder_…` failt, weil der aktuelle Code `placeholder_club1` als truthy interpretiert und keinen neuen Customer erzeugt. Test 1 (NULL) sollte schon grün sein, Test 3 ebenfalls.

- [ ] **Step 3: Code in `createCheckoutSession` reparieren**

In `lib/actions/subscriptions.ts:42-65`, ersetze den Customer-Block durch:

```ts
  // Customer holen oder neu anlegen.
  // Akzeptiert sowohl NULL (neuer Standard) als auch legacy "placeholder_…"
  // (alte Daten aus finalize.ts vor Mai 2026) — beides triggert Lazy-Create.
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);

  let customerId = existing?.stripeCustomerId ?? null;
  const isPlaceholder = customerId !== null && customerId.startsWith("placeholder_");

  if (!customerId || isPlaceholder) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: club.name,
      metadata: { clubId: club.id, clubSlug: club.slug }
    });
    customerId = customer.id;

    if (existing) {
      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(subscriptions.clubId, club.id));
    } else {
      // Fallback: kein subscriptions-Row da (sollte nach Onboarding nicht
      // passieren, aber defensiv für direkte Checkouts ohne Onboarding-Pfad).
      await db
        .insert(subscriptions)
        .values({
          clubId: club.id,
          stripeCustomerId: customerId,
          status: "trialing"
        })
        .onConflictDoNothing();
    }
  }
```

- [ ] **Step 4: Test wieder laufen lassen → muss grün sein**

Run: `npm test -- tests/actions/subscriptions-checkout.test.ts`
Expected: PASS — alle 3 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add tests/actions/subscriptions-checkout.test.ts lib/actions/subscriptions.ts
git commit -m "fix(stripe): lazy-create customer in createCheckoutSession, handle null + legacy placeholders"
```

---

## Task 4: Schema — `sponsor_invitations.expiresAt` hinzufügen + Migration

**Files:**
- Modify: `lib/db/schema/invitations.ts:8-19`
- Create: `drizzle/migrations/0012_*.sql` (Drizzle generiert)

- [ ] **Step 1: Schema ändern**

In `lib/db/schema/invitations.ts:8-19`, füge `expiresAt` hinzu:

```ts
export const sponsorInvitations = pgTable("sponsor_invitations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  token: text("token").notNull().unique(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Optionaler Name, der auf der Einladungsseite als Willkommensgruß angezeigt wird. */
  recipientName: text("recipient_name"),
  status: invitationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Token läuft 30 Tage nach Erzeugung ab. Helper `createInvitation` setzt
   * diesen Wert automatisch. `findInvitationByToken` filtert abgelaufene
   * Tokens raus, damit alte/geleakte Tokens nicht mehr verwendbar sind.
   */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id").references(() => users.id, { onDelete: "set null" })
});
```

- [ ] **Step 2: Migration generieren**

Run: `npm run db:generate`
Expected: Neue Datei `drizzle/migrations/0012_<name>.sql` ähnlich:

```sql
ALTER TABLE "sponsor_invitations" ADD COLUMN "expires_at" timestamp with time zone NOT NULL;
```

- [ ] **Step 3: NOT NULL für bestehende Rows fixen**

Da die Spalte direkt `NOT NULL` ist, schlägt die Migration auf einer Tabelle mit Daten fehl. Öffne `drizzle/migrations/0012_*.sql` und ändere sie zu einem zweistufigen Pattern (Spalte erst nullable, dann backfillen, dann NOT NULL):

```sql
ALTER TABLE "sponsor_invitations" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "sponsor_invitations"
   SET "expires_at" = "created_at" + interval '30 days'
   WHERE "expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "sponsor_invitations" ALTER COLUMN "expires_at" SET NOT NULL;
```

- [ ] **Step 4: Migration testen**

Run: `DATABASE_URL=postgres://test:test@localhost:54329/kickpact_test dotenv -- drizzle-kit migrate`
Expected: Output enthält `0012_<name>` als applied, kein Fehler.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/invitations.ts drizzle/migrations/0012_*.sql drizzle/migrations/meta/
git commit -m "feat(schema): add expires_at to sponsor_invitations + 30d backfill"
```

---

## Task 5: Invitations-Queries — `createInvitation` setzt `expiresAt`, `findInvitationByToken` filtert `pending` + nicht abgelaufen

**Files:**
- Create: `tests/lib/invitations.test.ts`
- Modify: `lib/db/queries/invitations.ts:11-43`

- [ ] **Step 1: Failing Test schreiben**

Create `tests/lib/invitations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsorInvitations } from "@/lib/db/schema";
import {
  createInvitation,
  findInvitationByToken,
  markInvitationUsed
} from "@/lib/db/queries/invitations";
import { resetTestDb } from "../setup/db";

async function seedTeam(): Promise<{ teamId: string; userId: string }> {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `t-${userId}@kickpact.local`,
    emailVerified: true,
    name: "Trainer",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 6)}`,
    name: "FC Test"
  });

  const teamId = createId();
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "Herren 1",
    saison: "2526"
  });

  return { teamId, userId };
}

describe("invitations queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createInvitation setzt expiresAt ~30 Tage in der Zukunft", async () => {
    const { teamId, userId } = await seedTeam();
    const before = Date.now();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    const after = Date.now();

    const lowerBound = before + 29 * 24 * 60 * 60 * 1000;
    const upperBound = after + 31 * 24 * 60 * 60 * 1000;
    expect(inv.expiresAt.getTime()).toBeGreaterThan(lowerBound);
    expect(inv.expiresAt.getTime()).toBeLessThan(upperBound);
  });

  it("findInvitationByToken liefert pending Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    const found = await findInvitationByToken(inv.token);
    expect(found?.id).toBe(inv.id);
  });

  it("findInvitationByToken liefert NULL für used Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    await markInvitationUsed(inv.token, userId);

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });

  it("findInvitationByToken liefert NULL für revoked Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    await db
      .update(sponsorInvitations)
      .set({ status: "revoked" })
      .where(eq(sponsorInvitations.id, inv.id));

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });

  it("findInvitationByToken liefert NULL für abgelaufene Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    // Manuell auf gestern setzen
    await db
      .update(sponsorInvitations)
      .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(sponsorInvitations.id, inv.id));

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Sicherstellen, dass Test-DB läuft**

Run: `docker compose -f docker-compose.test.yml up -d`
Expected: `Container kickpact-test-db ... Started` oder bereits läuft.

- [ ] **Step 3: Test laufen lassen → muss failen**

Run: `npm test -- tests/lib/invitations.test.ts`
Expected: FAIL — die "expiresAt 30 Tage"-Test failt, weil `createInvitation` aktuell kein `expiresAt` setzt (TypeScript-Error oder DB-Constraint-Verletzung). Die Filter-Tests failen, weil `findInvitationByToken` aktuell jeden Status zurückgibt.

- [ ] **Step 4: `createInvitation` ergänzen**

In `lib/db/queries/invitations.ts:11-27`, ersetze `createInvitation`:

```ts
const INVITATION_TTL_DAYS = 30;

export async function createInvitation(args: {
  teamId: string;
  createdByUserId: string;
  recipientName?: string;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(sponsorInvitations)
    .values({
      teamId: args.teamId,
      createdByUserId: args.createdByUserId,
      token,
      recipientName: args.recipientName ?? null,
      expiresAt
    })
    .returning();
  return row;
}
```

- [ ] **Step 5: `findInvitationByToken` filtern**

In `lib/db/queries/invitations.ts:29-36`, ersetze:

```ts
import { and, eq, gt, sql } from "drizzle-orm";

// ... bestehende Imports oberhalb bleiben ...

export async function findInvitationByToken(token: string) {
  const now = new Date();
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(
      and(
        eq(sponsorInvitations.token, token),
        eq(sponsorInvitations.status, "pending"),
        gt(sponsorInvitations.expiresAt, now)
      )
    )
    .limit(1);
  return row ?? null;
}
```

Achtung: oberhalb der Datei (Zeile 2) muss der Import `and` und `gt` enthalten. Aktueller Import-State `import { eq, sql } from "drizzle-orm";` → ändern zu:

```ts
import { and, eq, gt, sql } from "drizzle-orm";
```

- [ ] **Step 6: Tests wieder laufen lassen → muss grün sein**

Run: `npm test -- tests/lib/invitations.test.ts`
Expected: PASS — alle 5 Tests grün.

- [ ] **Step 7: Commit**

```bash
git add tests/lib/invitations.test.ts lib/db/queries/invitations.ts
git commit -m "feat(invitations): 30d TTL via expiresAt + filter pending in findByToken"
```

---

## Task 6: `/api/squad` — Auth-Guard + nutzt gefilterten Query (CRITICAL-Fix)

**Files:**
- Create: `tests/api/squad-route.test.ts`
- Modify: `app/api/squad/route.ts:1-47`

- [ ] **Step 1: Failing Test schreiben**

Create `tests/api/squad-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Auth + Crawler bevor SUT importiert wird
const requireUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));

const findInvitationByTokenMock = vi.fn();
vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationByTokenMock
}));

vi.mock("@/lib/crawler/fussballde", () => ({
  getKader: vi.fn().mockResolvedValue([{ name: "Max Mustermann" }, { name: "Erika Beispiel" }])
}));

// db.select(...).from(teams).where(...).limit() liefert minimal-Team
const dbLimitFn = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => dbLimitFn() })
      })
    })
  }
}));

import { GET } from "@/app/api/squad/route";

function makeReq(token?: string): NextRequest {
  const url = token
    ? `http://localhost/api/squad?invitationToken=${token}`
    : `http://localhost/api/squad`;
  return new NextRequest(url);
}

beforeEach(() => {
  requireUserMock.mockReset();
  findInvitationByTokenMock.mockReset();
  dbLimitFn.mockReset();
});

describe("GET /api/squad", () => {
  it("erfordert einen authentifizierten User", async () => {
    requireUserMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET(makeReq("tok-1"))).rejects.toThrow();
  });

  it("liefert 400 wenn invitationToken fehlt", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("liefert 410 wenn Invitation nicht (mehr) pending ist", async () => {
    // findInvitationByToken returnt NULL für used/expired/revoked
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    findInvitationByTokenMock.mockResolvedValue(null);

    const res = await GET(makeReq("expired-or-used-token"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/invitation/i);
  });

  it("liefert Spielerliste bei gültiger pending Invitation", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    findInvitationByTokenMock.mockResolvedValue({
      id: "inv1",
      teamId: "team1",
      status: "pending"
    });
    dbLimitFn.mockResolvedValue([
      { fussballdeTeamId: "ft1", fussballdeSlug: "fc-test" }
    ]);

    const res = await GET(makeReq("valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.players).toEqual(["Max Mustermann", "Erika Beispiel"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen → muss failen**

Run: `npm test -- tests/api/squad-route.test.ts`
Expected: FAIL — der Auth-Test failt (`requireUser` wird nicht aufgerufen), 410-Test failt (aktueller Code returnt 404 wenn `findInvitationByToken` null returnt — aber er ruft `requireUser` gar nicht).

- [ ] **Step 3: Route reparieren**

Ersetze `app/api/squad/route.ts` komplett:

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getKader } from "@/lib/crawler/fussballde";
import { requireUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  // Auth-Gate: nur eingeloggte User dürfen Spielerlisten ziehen.
  // Vorher war das öffentlich (nur Token-Check) → Spielerdaten-Leak via
  // geleakter Mail/Browser-History (Audit 2026-05-24).
  await requireUser();

  const token = req.nextUrl.searchParams.get("invitationToken");
  if (!token) {
    return NextResponse.json({ error: "invitationToken required" }, { status: 400 });
  }

  // findInvitationByToken filtert intern auf status='pending' + expiresAt > now,
  // d.h. used/revoked/expired Tokens → null → 410 Gone.
  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation expired or already used" },
      { status: 410 }
    );
  }

  const [team] = await db
    .select({
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug
    })
    .from(teams)
    .where(eq(teams.id, invitation.teamId))
    .limit(1);

  if (!team?.fussballdeTeamId || !team?.fussballdeSlug) {
    return NextResponse.json({ players: [] });
  }

  // Determine current season: e.g. today=May 2026 → saison "2526"
  const now = new Date();
  const saison =
    now.getMonth() >= 6
      ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
      : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;

  try {
    const kader = await getKader(team.fussballdeTeamId, team.fussballdeSlug, saison);
    const players = kader.map((p) => p.name).filter(Boolean);
    return NextResponse.json({ players });
  } catch {
    // Scraping failed — fall back to empty list (player picker shows text input)
    return NextResponse.json({ players: [] });
  }
}
```

- [ ] **Step 4: Tests wieder laufen lassen → muss grün sein**

Run: `npm test -- tests/api/squad-route.test.ts`
Expected: PASS — alle 4 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add tests/api/squad-route.test.ts app/api/squad/route.ts
git commit -m "fix(api/squad): require auth + reject used/expired invitation tokens"
```

---

## Task 7: Schema — `players.blocked` Spalte für DSGVO-Opt-out (Vorbereitung, Enforcement folgt Phase 4)

**Files:**
- Modify: `lib/db/schema/clubs.ts:86-100`
- Create: `drizzle/migrations/0013_*.sql`

- [ ] **Step 1: Schema ändern**

In `lib/db/schema/clubs.ts:86-100`, ergänze die `players`-Tabelle:

```ts
export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    fussballdePlayerId: text("fussballde_player_id"),
    name: text("name").notNull(),
    /**
     * DSGVO-Opt-out: wenn true, ignoriert der Crawler diesen Spieler bei
     * Name-Updates (Spalte bleibt auf "Anonymisiert"). Wird in Phase 4 vom
     * Support manuell per Datenschutz-Mail gesetzt. Spalte existiert ab
     * Phase 1, damit die DSE-Versprechen (Opt-out via Mail) sofort technisch
     * umsetzbar sind — ein simples `UPDATE players SET blocked=true,
     * name='Anonymisiert' WHERE id=…` reicht aus.
     */
    blocked: boolean("blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamFussballdeIdx: uniqueIndex("players_team_fussballde_idx")
      .on(t.teamId, t.fussballdePlayerId)
      .where(sql`${t.fussballdePlayerId} IS NOT NULL`)
  })
);
```

- [ ] **Step 2: Migration generieren**

Run: `npm run db:generate`
Expected: Neue Datei `drizzle/migrations/0013_<name>.sql` mit:

```sql
ALTER TABLE "players" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;
```

- [ ] **Step 3: Migration testen**

Run: `DATABASE_URL=postgres://test:test@localhost:54329/kickpact_test dotenv -- drizzle-kit migrate`
Expected: `0013_<name>` als applied.

- [ ] **Step 4: `upsertPlayer` ignoriert Name-Updates für blocked players**

In `lib/db/queries/crawler.ts:258-277`, ersetze `upsertPlayer`:

```ts
async function upsertPlayer(
  teamId: string,
  fussballdeId: string,
  name: string
): Promise<string | null> {
  // Leere IDs überspringen (passiert wenn fussball.de kein Player-Profil hat)
  if (!fussballdeId) return null;

  const [existing] = await db
    .select({ id: players.id, blocked: players.blocked })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.fussballdePlayerId, fussballdeId)))
    .limit(1);
  if (existing) {
    // Bei blocked players Namen NIE überschreiben (Support hat den auf
    // "Anonymisiert" gesetzt). Den existierenden Row weiter benutzen.
    return existing.id;
  }
  const [created] = await db
    .insert(players)
    .values({ teamId, fussballdePlayerId: fussballdeId, name })
    .returning({ id: players.id });
  return created.id;
}
```

(Hinweis: der existierende Code überschrieb auch heute schon keinen Namen — er macht nur INSERT bei neuen Playern. Die Änderung ist trotzdem sinnvoll: sie selektiert `blocked` mit, damit Future-Code z.B. `writeMatchEvents` darauf reagieren kann. Volles Match-Event-Anonymisieren kommt in Phase 4.)

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/clubs.ts lib/db/queries/crawler.ts drizzle/migrations/0013_*.sql drizzle/migrations/meta/
git commit -m "feat(schema): add players.blocked column for DSGVO opt-out (manual support process)"
```

---

## Task 8: Impressum — Anschrift, USt-IdNr ausfüllen (MANUELL — Daten vom Operator holen)

**Files:**
- Modify: `app/(legal)/impressum/page.tsx:27-65`

> **Engineer-Hinweis:** Diese Task hat keinen Test, weil sie reine Content-Änderung ist. Du brauchst echte Daten vom Operator (Johannes Schartl). Frag explizit nach folgendem, BEVOR du den Edit machst:

- [ ] **Step 1: Daten vom Operator einholen**

Frag den Operator in seiner präferierten Sprache (Deutsch, Du-Form) nach den folgenden Werten. Notiere die Antworten:

```
1. Vollständige Straße + Hausnummer für das Impressum?
   (z.B. "Musterstraße 12")
2. PLZ + Ort?
   (z.B. "69123 Heidelberg")
3. USt-IdNr falls vorhanden — oder Hinweis "Kleinunternehmer §19 UStG, keine USt-IdNr"?
4. Ist eine separate "Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)"-Person
   vorgesehen oder ist das identisch zum Anbieter (Johannes Schartl, Anschrift wie oben)?
5. Soll die E-Mail-Adresse "hello@kickpact.com" so bleiben, oder eine andere
   (z.B. johannes.schartl@gmail.com) ?
```

- [ ] **Step 2: Impressum-Anbieter-Block ersetzen**

In `app/(legal)/impressum/page.tsx:23-34`, ersetze (Werte aus Step 1 einsetzen):

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Anbieter
      </h2>
      <p className="mt-2">
        KickPact — Johannes Schartl
        <br />
        <STRASSE_AUS_STEP_1>
        <br />
        <PLZ_ORT_AUS_STEP_1>
        <br />
        Deutschland
      </p>
```

- [ ] **Step 3: USt-IdNr-Block ersetzen**

In `app/(legal)/impressum/page.tsx:46-54`, ersetze.

Variante A (falls USt-IdNr vorhanden):

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Umsatzsteuer-ID
      </h2>
      <p className="mt-2">
        Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:
        <br />
        <USt-IdNr_AUS_STEP_1>
      </p>
```

Variante B (falls Kleinunternehmer):

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Umsatzsteuer
      </h2>
      <p className="mt-2">
        Aufgrund der Kleinunternehmerregelung nach § 19 UStG wird keine
        Umsatzsteuer ausgewiesen und keine USt-Identifikationsnummer geführt.
      </p>
```

- [ ] **Step 4: Verantwortlich-für-Inhalte-Block ersetzen**

In `app/(legal)/impressum/page.tsx:56-66`, ersetze (Hinweis: § 55 Abs. 2 RStV ist veraltet, korrekt ist heute § 18 Abs. 2 MStV):

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Verantwortlich für den Inhalt
      </h2>
      <p className="mt-2">
        Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:
        <br />
        Johannes Schartl
        <br />
        <STRASSE_AUS_STEP_1>
        <br />
        <PLZ_ORT_AUS_STEP_1>
      </p>
```

- [ ] **Step 5: Sichtbar-Check im Browser**

Run: `npm run dev` und öffne `http://localhost:3000/impressum`. Prüfe visuell: keine `[…]`-Platzhalter mehr sichtbar, keine TODO-Kommentare im rendered HTML.

- [ ] **Step 6: Commit**

```bash
git add app/\(legal\)/impressum/page.tsx
git commit -m "fix(legal): fill in Impressum Anschrift + USt-IdNr per § 5 TMG"
```

---

## Task 9: Datenschutzerklärung — Verantwortlicher-Anschrift + Subprocessor-Tabelle (MANUELL)

**Files:**
- Modify: `app/(legal)/datenschutz/page.tsx:24-36`
- Modify: `app/(legal)/datenschutz/page.tsx:93-127`

- [ ] **Step 1: Verantwortlicher-Block aktualisieren**

In `app/(legal)/datenschutz/page.tsx:22-36`, ersetze (Anschrift aus Task 8 Step 1 wiederverwenden):

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        1. Verantwortlicher
      </h2>
      <p className="mt-2">
        Verantwortlich im Sinne der DSGVO ist:
        <br />
        Johannes Schartl — KickPact
        <br />
        <STRASSE_AUS_TASK_8>
        <br />
        <PLZ_ORT_AUS_TASK_8>
        <br />
        Deutschland
        <br />
        E-Mail:{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
      </p>
```

- [ ] **Step 2: Subprocessor-Block (Abschnitt 4) durch konkrete Tabelle ersetzen**

In `app/(legal)/datenschutz/page.tsx:92-127`, ersetze den gesamten Abschnitt „4. Drittanbieter (Auftragsverarbeiter)" durch:

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        4. Auftragsverarbeiter
      </h2>
      <p className="mt-2">
        Für den Betrieb arbeiten wir mit folgenden Dienstleistern zusammen. Mit
        allen Auftragsverarbeitern bestehen Auftragsverarbeitungsverträge gemäß
        Art. 28 DSGVO. Für Drittlandtransfers außerhalb der EU/EWR werden
        Standardvertragsklauseln (SCC) gemäß Durchführungsbeschluss (EU) 2021/914
        und ergänzende Schutzmaßnahmen eingesetzt.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead className="bg-brand-off-white text-brand-night-navy">
            <tr>
              <th className="text-left p-2 border border-brand-neutral/40">Anbieter</th>
              <th className="text-left p-2 border border-brand-neutral/40">Sitz / Rechenzentrum</th>
              <th className="text-left p-2 border border-brand-neutral/40">Zweck</th>
              <th className="text-left p-2 border border-brand-neutral/40">Rechtsgrundlage Drittland</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Neon Inc.</td>
              <td className="p-2 border border-brand-neutral/40">Hosting EU-Region (Frankfurt)</td>
              <td className="p-2 border border-brand-neutral/40">Postgres-Datenbank (alle Anwendungsdaten)</td>
              <td className="p-2 border border-brand-neutral/40">EU-Hosting, kein Drittlandtransfer</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Hetzner Online GmbH</td>
              <td className="p-2 border border-brand-neutral/40">Deutschland (Nürnberg / Falkenstein)</td>
              <td className="p-2 border border-brand-neutral/40">Server-Hosting der Anwendung</td>
              <td className="p-2 border border-brand-neutral/40">EU-Hosting, kein Drittlandtransfer</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Resend (Drop, Inc.)</td>
              <td className="p-2 border border-brand-neutral/40">USA</td>
              <td className="p-2 border border-brand-neutral/40">Transaktions-E-Mail-Versand (Magic-Link, Rechnungen, Benachrichtigungen)</td>
              <td className="p-2 border border-brand-neutral/40">SCC + Data Privacy Framework (DPF)</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Stripe Payments Europe Ltd.</td>
              <td className="p-2 border border-brand-neutral/40">Irland (Konzern-Mutter USA)</td>
              <td className="p-2 border border-brand-neutral/40">Zahlungsabwicklung Plattform-Abo</td>
              <td className="p-2 border border-brand-neutral/40">EU-Vertragspartner; konzernintern SCC + DPF</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Inngest, Inc.</td>
              <td className="p-2 border border-brand-neutral/40">USA</td>
              <td className="p-2 border border-brand-neutral/40">Asynchrone Job-Orchestrierung (Crawler-Runs, Rechnungserstellung)</td>
              <td className="p-2 border border-brand-neutral/40">SCC + DPF</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Cloudflare, Inc.</td>
              <td className="p-2 border border-brand-neutral/40">USA (Edge weltweit)</td>
              <td className="p-2 border border-brand-neutral/40">CDN für statische Assets, R2-Object-Storage für PDF-Rechnungen</td>
              <td className="p-2 border border-brand-neutral/40">SCC + DPF</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-night-navy/60">
        Eine aktuelle Liste der Auftragsverarbeiter und Subprocessoren stellen wir
        auf Anfrage per E-Mail an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>{" "}
        bereit.
      </p>
```

- [ ] **Step 3: Sichtbar-Check**

Run: `npm run dev` und öffne `http://localhost:3000/datenschutz`. Prüfe Mobile + Desktop, dass die Tabelle scrollt und lesbar bleibt.

- [ ] **Step 4: Commit**

```bash
git add app/\(legal\)/datenschutz/page.tsx
git commit -m "fix(legal): fill Verantwortlicher Anschrift + add Subprocessor table with SCC/DPF status"
```

---

## Task 10: Datenschutzerklärung — Neuer Abschnitt für fussball.de-Spielerdaten + Opt-out

**Files:**
- Modify: `app/(legal)/datenschutz/page.tsx` (neuer Abschnitt zwischen aktuellen Abschnitten 4 und 5 → wird neuer Abschnitt 5, alle folgenden um 1 hochzählen)
- Modify: `app/(legal)/datenschutz/page.tsx:13` — „Letzte Aktualisierung" auf heutiges Datum

- [ ] **Step 1: „Letzte Aktualisierung" auf heutiges Datum setzen**

In `app/(legal)/datenschutz/page.tsx:11-14`, ersetze das Datum auf heute (Format wie bestehend):

```tsx
      <p className="mt-2 text-xs md:text-sm text-brand-night-navy/60">
        Letzte Aktualisierung: 24. Mai 2026
      </p>
```

- [ ] **Step 2: Neuer Abschnitt „5. Verarbeitung von Spielerdaten aus fussball.de" einfügen**

In `app/(legal)/datenschutz/page.tsx` — direkt NACH dem Subprocessor-Block (nach dem schließenden `</p>` der Subprocessor-Liste, vor dem aktuellen Abschnitt „5. Cookies") einfügen:

```tsx
      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        5. Verarbeitung von Spielerdaten aus fussball.de
      </h2>
      <p className="mt-2">
        Damit Sponsor-Wetten („Pledge pro Tor", „Pledge pro Hattrick" etc.)
        korrekt ausgewertet werden können, ruft KickPact öffentlich zugängliche
        Spielergebnisse, Spielereignisse (Tore, Karten, Auswechslungen) und
        Spielernamen von <a className="text-accent hover:underline" href="https://www.fussball.de" target="_blank" rel="noreferrer">fussball.de</a> ab
        und speichert sie verknüpft mit der jeweiligen Mannschaft.
      </p>
      <p className="mt-3">
        <strong>Rechtsgrundlage</strong> ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse). Unser berechtigtes Interesse besteht in der
        Bereitstellung des Kernzwecks von KickPact — Pledge-Auswertung anhand
        überprüfbarer, öffentlich publizierter Spielresultate. Ohne diese
        Verarbeitung wäre die Dienstleistung nicht erbringbar. Wir verarbeiten
        ausschließlich Daten, die der DFB-Landesverband über fussball.de bereits
        öffentlich publiziert hat, und keine über die Spielberichte
        hinausgehenden personenbezogenen Daten (insbesondere keine Adressen,
        Geburtsdaten oder Kontaktdaten der Spieler).
      </p>
      <p className="mt-3">
        <strong>Interessenabwägung:</strong> Die Spielernamen sind bereits
        öffentlich auf fussball.de einsehbar; KickPact reichert sie nicht mit
        zusätzlichen Daten an und gibt sie ausschließlich an die mit der
        Mannschaft verknüpften Sponsoren weiter (geschlossener Empfängerkreis,
        eingeloggt + Pledge an die Mannschaft aktiv). Eine darüber hinausgehende
        öffentliche Veröffentlichung findet nicht statt. Bei Jugendmannschaften
        (Spieler unter 18 Jahren) erfolgt die Verarbeitung nur, solange der
        zuständige Landesverband die Daten auch auf fussball.de öffentlich zeigt.
      </p>
      <p className="mt-3">
        <strong>Widerspruchsrecht (Opt-out):</strong> Spieler oder
        Erziehungsberechtigte können der Verarbeitung jederzeit formlos
        widersprechen. Bitte schreibe eine E-Mail mit dem vollständigen Namen
        und der betroffenen Mannschaft an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        . Wir anonymisieren den Spielernamen in unserem System innerhalb von
        14 Tagen nach Eingang und schließen ihn von zukünftigen Crawler-Updates
        aus.
      </p>
      <p className="mt-3">
        <strong>Speicherdauer:</strong> Spielereignisse und damit verbundene
        Spielernamen werden gelöscht, sobald die zugehörige Mannschaft auf
        KickPact deaktiviert wird, spätestens jedoch nach Ablauf der gesetzlichen
        Aufbewahrungspflichten für die zugehörigen Rechnungsdaten (§ 147 AO,
        10 Jahre).
      </p>
```

- [ ] **Step 3: Bestehende Abschnitte 5–8 in der Nummerierung um 1 hochzählen**

Suche im File nach allen `>5. Cookies<`, `>6. Deine Rechte<`, `>7. Speicherdauer<`, `>8. Änderungen dieser Erklärung<` und ersetze jeweils:

- `5. Cookies` → `6. Cookies`
- `6. Deine Rechte` → `7. Deine Rechte`
- `7. Speicherdauer` → `8. Speicherdauer`
- `8. Änderungen dieser Erklärung` → `9. Änderungen dieser Erklärung`

- [ ] **Step 4: Auch die Spielerdaten in Abschnitt 2 „Welche Daten wir verarbeiten" erweitern**

In `app/(legal)/datenschutz/page.tsx:58-65`, ersetze den `<li>`-Eintrag für Crawler-Daten durch:

```tsx
        <li>
          <strong>Fußball.de-Crawler-Daten:</strong> öffentliche Spielergebnisse,
          Spielereignisse (Tore, Karten, Auswechslungen) und Spielernamen
          deiner Mannschaft, die wir von fussball.de abrufen — Details und
          Widerspruchsrecht siehe Abschnitt 5.
        </li>
```

- [ ] **Step 5: Sichtbar-Check**

Run: `npm run dev` und öffne `http://localhost:3000/datenschutz`. Prüfe: durchnummerierte Überschriften 1–9 sind korrekt, neuer Abschnitt 5 ist vollständig, Mail-Link für Opt-out funktioniert.

- [ ] **Step 6: Commit**

```bash
git add app/\(legal\)/datenschutz/page.tsx
git commit -m "feat(legal): add fussball.de player data section with Art. 6 1f basis + opt-out process"
```

---

## Task 11: Smoke-Test der gesamten Phase — Build + alle Tests grün

**Files:** —

- [ ] **Step 1: TypeScript-Build laufen lassen**

Run: `npm run build`
Expected: `✓ Compiled successfully` (Build dauert 1–2 min). Wenn ein Type-Error fliegt, der NICHT von einer Phase-1-Änderung kommt, prüfe `git log --oneline -10` und entscheide, ob er vorher schon da war (dann ist es nicht Aufgabe dieser Phase, ihn zu fixen — separater Bug-Report).

- [ ] **Step 2: Vollständige Test-Suite laufen lassen**

Run: `docker compose -f docker-compose.test.yml up -d` (sicherstellen Test-DB läuft)
Run: `DATABASE_URL_TEST=postgres://test:test@localhost:54329/kickpact_test npm test`
Expected: alle Tests grün — insbesondere `tests/lib/invitations.test.ts`, `tests/api/squad-route.test.ts`, `tests/actions/subscriptions-checkout.test.ts`.

- [ ] **Step 3: Migrationen auf Production-Schema-Drift prüfen**

Run: `npm run db:generate`
Expected: Output `No schema changes, nothing to migrate 😴` — wenn doch eine Migration generiert wird, hast du im Schema noch nicht-committete Drift; Datei prüfen, ggf. löschen oder als 0014 committen.

- [ ] **Step 4: Manueller Smoke-Test im Dev-Server**

Run: `npm run dev`

Manuelle Klick-Pfade:
1. `http://localhost:3000/impressum` → keine `[…]`-Platzhalter
2. `http://localhost:3000/datenschutz` → 9 Abschnitte sichtbar, Subprocessor-Tabelle gerendert
3. `http://localhost:3000/api/squad?invitationToken=any` ohne Login → Redirect zu `/login` (oder 401)
4. Mit Login + ungültigem Token: 410-Response
5. (Optional, nur wenn Stripe-Sandbox-Keys gesetzt) Onboarding-Flow → `/verein/<slug>/abo` → „Plan wählen" → Stripe-Checkout-URL sollte einen `cus_*`-Customer zeigen, nicht crashen.

- [ ] **Step 5: Final-Commit-Sweep**

Run: `git status` — sollte clean sein. Falls noch Dateien offen sind (z.B. weil Tasks unfertig), entweder als separater Commit oder explizit als „WIP" markieren.

Run: `git log --oneline | head -12` — sollte ~10 saubere Commits dieser Phase zeigen.

- [ ] **Step 6: Push + Deploy auf Staging**

```bash
git push origin main
```

Coolify-Deploy via:
```bash
~/.config/schartl-assistant/coolify.sh raw POST "/deploy" '{"uuid":"cvlukn6i68ukylule84nohqn","force":true}'
```

Status-Polling:
```bash
~/.config/schartl-assistant/coolify.sh raw GET "/deployments/<UUID_FROM_POST_RESPONSE>" \
  | python3 -c "import sys,json,re;c=sys.stdin.read();print(list(re.finditer(r'\"status\":\"([^\"]+)\"',c))[-1].group(1))"
```

Expected: nach ~2 min `finished`. Bei `failed`: Logs ziehen (Recipe in `docs/superpowers/plans/2026-05-24-codebase-audit.md` Phase 5 / oder direkt im Coolify-UI).

---

## Self-Review (durchgeführt vor Speicherung)

**1. Spec coverage:** Phase-1-Items aus dem Audit:
- 1.1 Stripe-Placeholder-Bug → Tasks 1, 2, 3 ✓
- 1.2 `/api/squad` absichern + Invitations expiresAt → Tasks 4, 5, 6 ✓
- 1.3 Impressum + DSE Anschriften → Tasks 8, 9 ✓
- 1.4 fussball.de-Spielerdaten-Block + `players.blocked` → Tasks 7, 10 ✓
- Smoke-Test/Deploy → Task 11 ✓

**2. Placeholder scan:** Suche nach „TBD", „TODO", „implement later", „fill in details" in diesem Plan: alle Vorkommen sind entweder
- in Code-Snippets als Bestandteil bestehender Codebase-Konstanten (z.B. `[TODO: …]`-Erinnerungen, die durch echte Werte ersetzt werden), oder
- als bewusster Hinweis „Diese Daten muss der Operator liefern" in Tasks 8 + 9, dort mit klar definiertem Step 1 zum Einholen der Daten.
Keine echten Plan-Failures.

**3. Type consistency:** Drei Querverbindungen geprüft:
- `subscriptions.stripeCustomerId` ist in Task 1 nullable, in Task 3 wird `existing?.stripeCustomerId ?? null` mit korrektem Null-Coalesce gelesen → konsistent.
- `sponsorInvitations.expiresAt` ist in Task 4 `notNull()`, in Task 5 nutzt `gt(sponsorInvitations.expiresAt, now)` → konsistent.
- `players.blocked` ist in Task 7 als `boolean("blocked").notNull().default(false)` definiert, `upsertPlayer` selektiert `blocked: players.blocked` → konsistent.

**Aufwand:** ~1–2 Tage, wie im Audit geschätzt. Tasks 8 + 9 hängen von Operator-Daten ab (Anschrift, USt-IdNr) — die müssen vorab geholt werden.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-24-phase1-go-live-blockers.md`. Two execution options:**

**1. Subagent-Driven (empfohlen)** — Ich dispatche pro Task einen frischen Subagenten, reviewe zwischen den Tasks, schnelle Iteration. Bei den DB-Schema-Tasks bekommt jeder Agent eine saubere DB-Connection.

**2. Inline Execution** — Tasks 1–11 inline in dieser Session, mit Checkpoints nach Task 3, 6, 10 für deine Review.

**Welcher Ansatz?**
