# KickPact Plan 2 — Auth + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Better Auth wire-up + komplettes Onboarding (Verein, Sponsor, Pledge), sodass Vereine und Sponsoren sich registrieren und Pledges anlegen können — auf realer UI mit Magic-Link- und Google-Login.

**Architecture:** Better Auth als Drop-in für Authentifizierung mit Drizzle-Adapter auf bestehendem Schema. Magic-Link-Mails via Resend. App-Router mit Route-Groups `(auth)` / `(onboarding)` / `(verein)` / `(sponsor)`. Server-Actions für DB-mutierende Form-Submits. Shadcn-Form (React Hook Form + Zod) für alle Wizards. Tenant-Isolation per `assertClubAccess()`-Helper.

**Tech Stack:** Better Auth 1.x, React Hook Form, Zod, Resend, Cloudflare R2 (für Vereins-Logos), shadcn/ui (Card/Form/Input/RadioGroup/Select/Dialog/Toast), Tailwind, Drizzle (bestehendes Schema).

**Spec:** [../specs/2026-05-19-kickpact-v1-design.md](../specs/2026-05-19-kickpact-v1-design.md) — Sections 6.1, 6.2, 6.3, 7, 8.1

**Prerequisites:** Plan 1 ist komplett gemerged (Foundation + Schema + Trigger-Engine + Crawler + Inngest-Pipeline). Neon DB hat 19 Tabellen. Schema-Tabellen für Better Auth (users, sessions, accounts, verifications) existieren bereits.

---

## File Structure

```
/Users/johan/kickpact/
├── app/
│   ├── layout.tsx                      # MOD: AuthProvider-Wrapping + Header
│   ├── page.tsx                        # MOD: Landing wird "echte" Landing
│   ├── (auth)/
│   │   ├── login/page.tsx              # NEW: Magic-Link-Form
│   │   ├── signup/page.tsx             # NEW: Magic-Link-Form (gleicher Flow)
│   │   └── verify/page.tsx             # NEW: "Check your email" Status
│   ├── (onboarding)/
│   │   └── onboarding/
│   │       └── verein/
│   │           ├── layout.tsx          # NEW: Wizard-Shell mit Progress-Steps
│   │           ├── [step]/page.tsx     # NEW: dynamische Step-Routes
│   │           └── _components/        # NEW: Step-1..4-Components
│   ├── einladung/
│   │   └── [token]/page.tsx            # NEW: Sponsor-Einladungslanding
│   ├── (verein)/
│   │   └── verein/[slug]/
│   │       ├── layout.tsx              # NEW: Vereins-Layout mit Nav
│   │       └── page.tsx                # NEW: Stub-Dashboard
│   ├── (sponsor)/
│   │   └── sponsor/
│   │       ├── layout.tsx              # NEW
│   │       ├── page.tsx                # NEW: Stub-Dashboard
│   │       ├── pledge/new/page.tsx     # NEW: Pledge-Setup-Wizard
│   │       └── pledge/[id]/page.tsx    # NEW: Pledge-Detail (stub)
│   └── api/
│       └── auth/[...all]/route.ts      # NEW: Better Auth handler
├── lib/
│   ├── auth/
│   │   ├── server.ts                   # NEW: betterAuth() instance
│   │   ├── client.ts                   # NEW: authClient (React)
│   │   ├── scope.ts                    # NEW: assertClubAccess + helpers
│   │   └── session.ts                  # NEW: getServerSession()
│   ├── actions/
│   │   ├── club-onboarding.ts          # NEW: Server Actions für Wizard
│   │   ├── sponsor-onboarding.ts       # NEW
│   │   ├── pledge.ts                   # NEW
│   │   └── invitations.ts              # NEW: token gen + lookup
│   ├── db/
│   │   ├── queries/
│   │   │   ├── clubs.ts                # NEW: club-domain queries
│   │   │   ├── sponsors.ts             # NEW
│   │   │   ├── pledges.ts              # NEW
│   │   │   └── invitations.ts          # NEW
│   │   └── schema/
│   │       └── invitations.ts          # NEW: sponsor_invitations table
│   ├── mail/
│   │   ├── client.ts                   # NEW: Resend client
│   │   └── templates/
│   │       ├── magic-link.tsx          # NEW
│   │       └── sponsor-invitation.tsx  # NEW
│   └── validations/
│       ├── club.ts                     # NEW: Zod schemas
│       ├── sponsor.ts                  # NEW
│       └── pledge.ts                   # NEW
├── components/
│   ├── ui/                             # NEW: shadcn additions
│   │   ├── card.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── radio-group.tsx
│   │   ├── select.tsx
│   │   ├── dialog.tsx
│   │   ├── toast.tsx (Sonner)
│   │   ├── separator.tsx
│   │   ├── avatar.tsx
│   │   └── dropdown-menu.tsx
│   ├── auth/
│   │   ├── header-user-menu.tsx        # NEW
│   │   └── magic-link-form.tsx         # NEW
│   └── shared/
│       ├── app-header.tsx              # NEW
│       └── wizard-progress.tsx         # NEW
└── tests/
    └── e2e/
        └── full-onboarding.test.ts     # NEW: Playwright E2E
```

## Phase Overview

- **Phase A** — Better Auth Foundation (Tasks 1–4)
- **Phase B** — shadcn Components + App-Shell (Tasks 5–6)
- **Phase C** — Auth-Pages (Tasks 7–8)
- **Phase D** — Vereins-Onboarding-Wizard (Tasks 9–13)
- **Phase E** — Sponsor-Onboarding + Pledge-Setup (Tasks 14–18)
- **Phase F** — Stub-Dashboards (Tasks 19–20)
- **Phase G** — E2E-Test (Task 21)

**End-State:** Ein neuer User kann auf `/` landen, sich als Verein registrieren, 4-Step-Wizard durchklicken (echter Fußball.de-Verein gesucht, Mannschaft gewählt, Stammdaten erfasst, Einladungslink erzeugt). Den Einladungslink kann ein zweiter User öffnen, sich als Familie/Business-Sponsor registrieren und einen Pledge anlegen. Beide sehen ihr Stub-Dashboard mit den richtigen Daten aus der DB.

---

## Phase A — Better Auth Foundation

Goal: Auth-Backend steht, Magic Link funktioniert, Google OAuth optional, Session-Scope-Helper.

### Task 1: Better Auth installieren + konfigurieren

**Files:**
- Create: `lib/auth/server.ts`, `app/api/auth/[...all]/route.ts`
- Modify: `.env.example`, `.env.local` (lokal vom User), `package.json`

- [ ] **Step 1: Better Auth + Drizzle-Adapter installieren**

```bash
cd /Users/johan/kickpact
npm install better-auth
```

- [ ] **Step 2: BETTER_AUTH_SECRET generieren + in .env.local setzen**

Manueller Schritt für den User (Klartext-Anweisung im Report):

```bash
openssl rand -base64 32
# Output in .env.local einsetzen als BETTER_AUTH_SECRET="..."
```

Subagent: prüfe `cat /Users/johan/kickpact/.env.local | grep BETTER_AUTH_SECRET` — falls leer, im Report DONE_WITH_CONCERNS reporten mit Anweisung.

- [ ] **Step 3: `lib/auth/server.ts`**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications
    }
  }),
  emailAndPassword: { enabled: false },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3003",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3003"]
  // emailMagicLink + Google werden in Task 2 + 3 hinzugefügt
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 4: API Route Handler `app/api/auth/[...all]/route.ts`**

```typescript
import { auth } from "@/lib/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Type-check + Build**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
npm run build 2>&1 | tail -15
```

Expected: clean. `/api/auth/[...all]` als Dynamic-Route in der Output.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/server.ts app/api/auth/[...all]/route.ts package.json package-lock.json
git commit -m "feat(auth): install better-auth with drizzle adapter"
```

---

### Task 2: Magic Link Plugin + Resend-Versand

**Files:**
- Create: `lib/mail/client.ts`, `lib/mail/templates/magic-link.tsx`
- Modify: `lib/auth/server.ts`, `.env.example`

- [ ] **Step 1: Resend + React-Email installieren**

```bash
cd /Users/johan/kickpact
npm install resend
```

- [ ] **Step 2: Resend Account + API-Key**

Manueller Schritt: User registriert sich auf https://resend.com (kostenlos 3000 Mails/Mon), erstellt API-Key, setzt `RESEND_API_KEY` und `MAIL_FROM` in `.env.local`.

Subagent: prüfe `cat /Users/johan/kickpact/.env.local | grep RESEND_API_KEY` — falls leer, report mit Anweisung.

- [ ] **Step 3: `lib/mail/client.ts`**

```typescript
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const MAIL_FROM = process.env.MAIL_FROM ?? "KickPact <hello@kickpact.de>";
```

- [ ] **Step 4: Magic-Link-E-Mail-Template `lib/mail/templates/magic-link.tsx`**

Plain HTML, keine React-Email-Dependency:

```typescript
export function magicLinkEmail(args: { url: string; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { url, email } = args;
  return {
    subject: "Dein KickPact-Login-Link",
    text: `Hi,\n\nklick auf diesen Link um dich bei KickPact einzuloggen:\n${url}\n\nDer Link ist 15 Minuten gültig.\n\nFalls du das nicht warst, ignorier diese Mail einfach.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 28px; margin: 0 0 8px;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 24px;">Dein Login-Link, gültig 15 Minuten.</p>
      <a href="${url}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Bei KickPact einloggen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, kopier diese URL:<br/><a href="${url}" style="color:#a3a3a3;">${url}</a></p>
    </td></tr>
  </table>
</body></html>`
  };
}
```

- [ ] **Step 5: Magic-Link-Plugin in `lib/auth/server.ts` aktivieren**

Replace existing `lib/auth/server.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema/auth";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { magicLinkEmail } from "@/lib/mail/templates/magic-link";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications
    }
  }),
  emailAndPassword: { enabled: false },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3003",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3003"],
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const mail = magicLinkEmail({ url, email });
        await resend.emails.send({
          from: MAIL_FROM,
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        });
      },
      expiresIn: 60 * 15 // 15 Min
    })
  ]
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 6: Type-check + Commit**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
git add lib/auth/server.ts lib/mail/ package.json package-lock.json
git commit -m "feat(auth): add magic-link plugin with Resend delivery"
```

---

### Task 3: Google OAuth Provider (optional, mit Skip-Path)

**Files:**
- Modify: `lib/auth/server.ts`, `.env.example`

- [ ] **Step 1: Google OAuth Setup**

Manueller Schritt für User: Google Cloud Console → neues OAuth-Client-Credential → `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env.local`. Redirect-URI: `http://localhost:3003/api/auth/callback/google`.

Subagent: `grep -E "GOOGLE_CLIENT_(ID|SECRET)" /Users/johan/kickpact/.env.local | grep -v '""'`. Falls leer, im Report melden — Plan 2 funktioniert auch ohne Google (Magic Link reicht).

- [ ] **Step 2: Provider in `lib/auth/server.ts` hinzufügen**

Im `betterAuth({ ... })` Block, NACH `plugins`, hinzufügen:

```typescript
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
          }
        }
      : undefined
```

Conditional: nur aktiv wenn beide ENV-Vars gesetzt.

- [ ] **Step 3: Type-check + Commit**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
git add lib/auth/server.ts
git commit -m "feat(auth): add optional google OAuth provider"
```

---

### Task 4: Session-Helper + Tenant-Scope

**Files:**
- Create: `lib/auth/session.ts`, `lib/auth/scope.ts`, `lib/auth/client.ts`

- [ ] **Step 1: Server-side Session-Helper `lib/auth/session.ts`**

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export async function getServerSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}
```

- [ ] **Step 2: Client-Helper `lib/auth/client.ts`**

```typescript
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003",
  plugins: [magicLinkClient()]
});

export const { useSession, signIn, signOut } = authClient;
```

- [ ] **Step 3: Tenant-Scope `lib/auth/scope.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubMemberships, clubs } from "@/lib/db/schema";
import { requireUser } from "./session";

type Role = "admin" | "trainer" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 1, trainer: 2, admin: 3 };

export async function assertClubAccess(clubSlug: string, minRole: Role = "viewer") {
  const user = await requireUser();
  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) throw new Error(`Club ${clubSlug} not found`);

  const [membership] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id))
    )
    .limit(1);

  if (!membership) {
    throw new Error("Forbidden: not a club member");
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new Error(`Forbidden: requires ${minRole}`);
  }

  return { user, club, role: membership.role };
}
```

- [ ] **Step 4: Type-check + Commit**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
git add lib/auth/
git commit -m "feat(auth): add session helpers + tenant scope"
```

---

**Phase A complete checkpoint:** Better Auth-Server läuft, Magic Link via Resend versendet (manuell testbar via Curl), Google optional, Session-Helper + Scope-Layer ready.

---

## Phase B — shadcn Components + App-Shell

Goal: Alle benötigten shadcn-Komponenten installiert + globales App-Layout mit Header.

### Task 5: shadcn-Components Bulk-Install

**Files:**
- Create: 11 Komponenten unter `components/ui/`

- [ ] **Step 1: Installiere alle benötigten Komponenten via shadcn CLI**

```bash
cd /Users/johan/kickpact
npx shadcn@latest add card form input label radio-group select dialog separator avatar dropdown-menu sonner --yes --overwrite
```

Falls CLI nach `tsx`/`tsconfig.json`-Paths fragt, default akzeptieren. Falls Konflikt mit existierendem `button.tsx`, mit `--overwrite` überschreiben (gleicher canonical Code).

- [ ] **Step 2: Verify imports work**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
```

Expected: clean. Wenn `Sonner` als Client-Component flag braucht, der shadcn-CLI macht das automatisch.

- [ ] **Step 3: Add Toaster zu Root-Layout**

Modify `app/layout.tsx` — der current Code:

```typescript
import "./globals.css";
import { Inter, Anton } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata = { /* ... */ };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${anton.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

ADD `<Toaster />` import + render before `</body>`:

```typescript
import { Toaster } from "@/components/ui/sonner";
// ...
      <body className="font-sans">
        {children}
        <Toaster />
      </body>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/johan/kickpact
git add components/ui/ app/layout.tsx package.json package-lock.json
git commit -m "chore(ui): add 11 shadcn components (card, form, input, ...)"
```

---

### Task 6: App-Header + Auth-Aware Layout

**Files:**
- Create: `components/shared/app-header.tsx`, `components/auth/header-user-menu.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: `components/auth/header-user-menu.tsx` (Client Component)**

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HeaderUserMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return <div className="h-10 w-24 animate-pulse rounded-md bg-neutral-100" />;
  }

  if (!session?.user) {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" asChild>
          <Link href="/login">Login</Link>
        </Button>
        <Button variant="accent" asChild>
          <Link href="/signup">Verein anlegen</Link>
        </Button>
      </div>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? session.user.email[0].toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-accent text-xs text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline">{session.user.name ?? session.user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-xs text-neutral-500">Angemeldet als</div>
          <div className="truncate">{session.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/sponsor">Sponsor-Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: `components/shared/app-header.tsx` (Server Component)**

```typescript
import Link from "next/link";
import { HeaderUserMenu } from "@/components/auth/header-user-menu";

export function AppHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-display text-2xl tracking-wide">
          KickPact
        </Link>
        <HeaderUserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Header in Root-Layout einbauen**

In `app/layout.tsx` MODIFY:

```typescript
import { AppHeader } from "@/components/shared/app-header";
// ...
      <body className="font-sans">
        <AppHeader />
        {children}
        <Toaster />
      </body>
```

- [ ] **Step 4: Verify in Browser**

```bash
cd /Users/johan/kickpact
npm run dev
```

Manueller Browser-Check (oder via preview-Tool wenn verfügbar): `http://localhost:3003` zeigt jetzt Header oben mit "KickPact"-Logo + "Login"/"Verein anlegen"-Buttons. Demo-Page-Content darunter.

- [ ] **Step 5: Commit**

```bash
git add components/shared/ components/auth/ app/layout.tsx
git commit -m "feat(ui): add app header with auth-aware user menu"
```

---

**Phase B complete checkpoint:** Globaler Header mit Auth-Menu, alle shadcn-Components ready, Toaster verfügbar.

---

## Phase C — Auth-Pages

Goal: Funktionierender Magic-Link-Login-Flow.

### Task 7: `/login` und `/signup` Pages

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/verify/page.tsx`, `components/auth/magic-link-form.tsx`

- [ ] **Step 1: Magic-Link-Form `components/auth/magic-link-form.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const schema = z.object({ email: z.string().email("Bitte gültige E-Mail eingeben") });
type FormValues = z.infer<typeof schema>;

export function MagicLinkForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await signIn.magicLink({
      email: values.email,
      callbackURL: mode === "signup" ? "/onboarding/verein/1" : "/sponsor"
    });
    setPending(false);
    if (result.error) {
      toast.error(result.error.message ?? "Konnte Link nicht senden");
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(values.email)}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail</FormLabel>
              <FormControl>
                <Input type="email" placeholder="du@beispiel.de" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Sende Link..." : "Magic Link senden"}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Install react-hook-form deps falls noch nicht da**

```bash
cd /Users/johan/kickpact
npm install react-hook-form @hookform/resolvers
```

(shadcn `form add` sollte das eigentlich schon getan haben; idempotent.)

- [ ] **Step 3: `app/(auth)/login/page.tsx`**

```typescript
import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Login · KickPact" };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">Login</CardTitle>
          <CardDescription>Wir schicken dir einen Magic-Link per Mail.</CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm mode="login" />
          <p className="mt-6 text-sm text-neutral-500">
            Noch keinen Account?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Verein anlegen
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: `app/(auth)/signup/page.tsx`**

```typescript
import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Verein anlegen · KickPact" };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">Verein anlegen</CardTitle>
          <CardDescription>
            Du legst KickPact für deinen Verein an und kannst dann Sponsoren einladen.
            30 Tage gratis testen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm mode="signup" />
          <p className="mt-6 text-sm text-neutral-500">
            Schon dabei?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: `app/(auth)/verify/page.tsx` (statisch, zeigt "Check your inbox")**

```typescript
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "E-Mail prüfen · KickPact" };

export default function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">
            Check deine Mails
          </CardTitle>
          <CardDescription>
            Wir haben dir einen Login-Link geschickt. Der Link gilt 15 Minuten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            Falls die Mail nicht ankommt, prüfe deinen Spam-Ordner oder versuche es{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              erneut
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Browser-Smoketest**

Mit `npm run dev` laufend:
1. `http://localhost:3003/login` → Form rendert
2. Echte E-Mail eingeben + Submit → Toast "Sende Link..." → Redirect zu `/verify?email=...`
3. Mail im Posteingang prüfen (echte Resend-Mail mit Magic-Link-Button)
4. Klick auf Mail-Link → loggt User ein → redirect zu `/sponsor` (oder `/onboarding/verein/1` bei signup)

Manuell ausführen + im Report bestätigen.

- [ ] **Step 7: Commit**

```bash
git add app/\(auth\)/ components/auth/magic-link-form.tsx package.json package-lock.json
git commit -m "feat(auth): add /login + /signup + /verify pages with magic-link form"
```

---

### Task 8: Landing-Page mit klarer Auth-CTA

**Files:**
- Modify: `app/page.tsx` (aktuell Status-Dashboard) — wir bewegen den Status-Content nach `/status` und machen `/` zur Marketing-Landing

- [ ] **Step 1: Status-Dashboard nach `/status` verschieben**

```bash
mkdir -p /Users/johan/kickpact/app/status
mv /Users/johan/kickpact/app/page.tsx /Users/johan/kickpact/app/status/page.tsx
```

- [ ] **Step 2: Neue `app/page.tsx` — schlanke Landing**

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "KickPact — Sponsoring, das mitfiebert" };

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="py-24">
        <h1 className="font-display text-6xl md:text-8xl tracking-wide leading-none">
          Sponsoring,
          <br />
          <span className="text-accent">das mitfiebert.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-xl text-neutral-600">
          Familie, Freunde und lokale Unternehmen unterstützen deine Mannschaft mit
          performance-basierten Versprechen — 5 € pro Tor, 10 € pro Sieg, 20 € pro
          Comeback. KickPact rechnet jedes Spiel automatisch ab.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="accent" size="lg" asChild>
            <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/login">Ich bin schon dabei</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          Weniger als 1 € pro Spieler im Monat.
        </p>
      </section>

      <section className="grid gap-6 border-t border-neutral-200 py-16 md:grid-cols-3">
        <Feature
          title="Automatisch"
          body="Spielergebnisse werden direkt von Fußball.de gescraped. Tore, Siege, Comebacks — alles wird vollautomatisch erkannt und abgerechnet."
        />
        <Feature
          title="Transparent"
          body="Jeder Sponsor sieht jeden Pledge live mit Worst-Case-Schätzung. Monatliche PDF-Rechnung direkt vom Verein. Steuerlich absetzbar als Werbeleistung."
        />
        <Feature
          title="Flexibel"
          body="Spezial-Events wie Kopfballtore oder Hackentore meldet der Trainer, Sponsor bestätigt. Optional Caps pro Spiel oder Monat, damit niemand erschlagen wird."
        />
      </section>

      <section className="border-t border-neutral-200 py-8 text-sm text-neutral-500">
        <Link href="/status" className="hover:underline">
          System-Status &amp; Live-Demo
        </Link>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-2xl tracking-wide">{title}</h3>
      <p className="mt-2 text-neutral-600">{body}</p>
    </div>
  );
}
```

- [ ] **Step 3: Browser-Check**

`http://localhost:3003` → Marketing-Landing mit Hero + 3 Feature-Karten + Link zu /status. Login-Funktion über Header rechts oben.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/status/
git commit -m "feat(ui): new landing page with marketing hero; status moved to /status"
```

---

**Phase C complete checkpoint:** Login funktioniert end-to-end (Mail → Click → Session). Landing-Seite hat klare CTA.

---

## Phase D — Vereins-Onboarding-Wizard

Goal: 4-Step Wizard, der einen User → Verein-Eintrag → Mannschaft-Eintrag → Stammdaten + Sponsor-Einladungslink führt.

Crawler `searchVereine` + `getMannschaften` aus Plan 1 werden verwendet — aber **NICHT** im Server-Component direkt aufgerufen (Playwright-Startup ist langsam), sondern als Server Action mit Loading-State.

### Task 9: Wizard-Shell + Progress

**Files:**
- Create: `app/(onboarding)/onboarding/verein/layout.tsx`, `components/shared/wizard-progress.tsx`

- [ ] **Step 1: `components/shared/wizard-progress.tsx`**

```typescript
import { cn } from "@/lib/utils";

export function WizardProgress({
  steps,
  currentStep
}: {
  steps: { label: string; href: string }[];
  currentStep: number;
}) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {steps.map((step, idx) => {
        const num = idx + 1;
        const status = num < currentStep ? "done" : num === currentStep ? "current" : "todo";
        return (
          <li
            key={step.href}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1",
              status === "current" && "bg-accent text-white",
              status === "done" && "bg-emerald-100 text-emerald-700",
              status === "todo" && "bg-neutral-100 text-neutral-400"
            )}
          >
            <span className="tabular-nums">{num}.</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: `app/(onboarding)/onboarding/verein/layout.tsx`**

```typescript
import { requireUser } from "@/lib/auth/session";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl tracking-wide">Verein anlegen</h1>
        <p className="mt-1 text-neutral-500">
          4 Schritte, dauert ca. 5 Minuten.
        </p>
      </div>
      {children}
    </main>
  );
}
```

- [ ] **Step 3: Verify Type-check + Commit**

```bash
cd /Users/johan/kickpact
npx tsc --noEmit
git add app/\(onboarding\)/ components/shared/wizard-progress.tsx
git commit -m "feat(onboarding): wizard shell + progress component"
```

---

### Task 10: Step 1 — Fußball.de-Suche

**Files:**
- Create: `app/(onboarding)/onboarding/verein/1/page.tsx`, `app/(onboarding)/onboarding/verein/_actions/search.ts`, `app/(onboarding)/onboarding/verein/_components/search-step.tsx`

- [ ] **Step 1: Server Action für Suche `app/(onboarding)/onboarding/verein/_actions/search.ts`**

```typescript
"use server";

import { z } from "zod";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";

const searchSchema = z.object({
  query: z.string().min(2).max(80)
});

export async function searchVereineAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Bitte mindestens 2 Zeichen eingeben" };
  try {
    const results = await searchVereine(parsed.data.query);
    return { ok: true as const, results: results.slice(0, 15) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Suche fehlgeschlagen" };
  }
}

export async function getMannschaftenAction(input: { vereinId: string; slug: string }) {
  try {
    const results = await getMannschaften(input.vereinId, input.slug);
    return { ok: true as const, results };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Mannschaften laden fehlgeschlagen" };
  }
}
```

- [ ] **Step 2: Search-Step-Client-Component `app/(onboarding)/onboarding/verein/_components/search-step.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchVereineAction } from "../_actions/search";
import { toast } from "sonner";

type VereinHit = { name: string; slug: string; vereinId: string; url: string };

export function SearchStep() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VereinHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSearch() {
    if (query.length < 2) {
      toast.error("Bitte mindestens 2 Zeichen eingeben");
      return;
    }
    startTransition(async () => {
      const res = await searchVereineAction({ query });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResults(res.results);
      setSearched(true);
      if (res.results.length === 0) {
        toast.info("Keine Treffer. Anderer Suchbegriff?");
      }
    });
  }

  function selectVerein(v: VereinHit) {
    const params = new URLSearchParams({ vereinId: v.vereinId, slug: v.slug, name: v.name });
    router.push(`/onboarding/verein/2?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="search">Vereinssuche (z.B. Stadtname oder Vereinsname)</Label>
        <div className="flex gap-2">
          <Input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="z.B. FC Heidelberg"
          />
          <Button onClick={handleSearch} disabled={pending} variant="accent">
            {pending ? "Suche..." : "Suchen"}
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          Wir scrapen Fußball.de live — die Suche dauert ein paar Sekunden.
        </p>
      </div>

      {searched && (
        <div className="rounded-lg border border-neutral-200 bg-white">
          {results.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">Keine Treffer.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {results.map((v) => (
                <li key={v.vereinId}>
                  <button
                    type="button"
                    onClick={() => selectVerein(v)}
                    className="flex w-full items-center justify-between p-4 text-left hover:bg-neutral-50"
                  >
                    <div>
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-neutral-400">{v.vereinId}</div>
                    </div>
                    <span className="text-accent">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Step-1-Page**

`app/(onboarding)/onboarding/verein/1/page.tsx`:

```typescript
import { WizardProgress } from "@/components/shared/wizard-progress";
import { SearchStep } from "../_components/search-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step1Page() {
  return (
    <div className="space-y-8">
      <WizardProgress steps={STEPS} currentStep={1} />
      <SearchStep />
    </div>
  );
}
```

- [ ] **Step 4: Browser-Smoketest**

`http://localhost:3003/onboarding/verein/1` (nach Login) → Suchfeld → "Heidelberg" eingeben → Submit → Live-Crawler-Lauf → Liste von Vereinen → einer auswählen → leitet zu `/onboarding/verein/2?vereinId=...` (404 erstmal, Step 2 kommt Task 11).

- [ ] **Step 5: Commit**

```bash
git add app/\(onboarding\)/onboarding/verein/1/ app/\(onboarding\)/onboarding/verein/_actions/ app/\(onboarding\)/onboarding/verein/_components/
git commit -m "feat(onboarding): step 1 — fussball.de search via server action"
```

---

### Task 11: Step 2 — Mannschaft + Plan

**Files:**
- Create: `app/(onboarding)/onboarding/verein/2/page.tsx`, `app/(onboarding)/onboarding/verein/_components/team-plan-step.tsx`

- [ ] **Step 1: `_components/team-plan-step.tsx`**

```typescript
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getMannschaftenAction } from "../_actions/search";
import { toast } from "sonner";

type Mannschaft = { name: string; slug: string; saison: string; teamId: string; url: string };

export function TeamPlanStep() {
  const router = useRouter();
  const params = useSearchParams();
  const vereinId = params.get("vereinId");
  const slug = params.get("slug");
  const vereinName = params.get("name");

  const [teams, setTeams] = useState<Mannschaft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "pro">("basic");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!vereinId || !slug) return;
    (async () => {
      const res = await getMannschaftenAction({ vereinId, slug });
      setLoading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTeams(res.results);
    })();
  }, [vereinId, slug]);

  function handleNext() {
    if (!selectedTeamId) {
      toast.error("Bitte Mannschaft auswählen");
      return;
    }
    const team = teams.find((t) => t.teamId === selectedTeamId)!;
    const next = new URLSearchParams({
      vereinId: vereinId!,
      slug: slug!,
      name: vereinName!,
      teamId: team.teamId,
      teamSlug: team.slug,
      teamName: team.name,
      saison: team.saison,
      plan: selectedPlan
    });
    router.push(`/onboarding/verein/3?${next.toString()}`);
  }

  if (!vereinId || !slug) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Kein Verein ausgewählt. Bitte zurück zu Schritt 1.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Label className="text-sm uppercase tracking-wider text-neutral-500">
          Verein
        </Label>
        <div className="mt-1 text-lg font-medium">{vereinName}</div>
      </div>

      <div className="space-y-3">
        <Label>Welche Mannschaft willst du sponsoring-fähig machen?</Label>
        {loading ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            Lade Mannschaften aus Fußball.de…
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            Keine Mannschaften gefunden.
          </div>
        ) : (
          <RadioGroup value={selectedTeamId} onValueChange={setSelectedTeamId}>
            {teams.map((t) => (
              <div key={t.teamId} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                <RadioGroupItem value={t.teamId} id={`team-${t.teamId}`} />
                <Label htmlFor={`team-${t.teamId}`} className="flex-1 cursor-pointer">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-neutral-400">Saison {t.saison}</div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
      </div>

      <div className="space-y-3">
        <Label>Plan</Label>
        <RadioGroup value={selectedPlan} onValueChange={(v) => setSelectedPlan(v as "basic" | "pro")} className="grid gap-3 md:grid-cols-2">
          <PlanCard plan="basic" price="9 € / Mon" selected={selectedPlan === "basic"} value="basic" />
          <PlanCard plan="pro" price="19 € / Mon" selected={selectedPlan === "pro"} value="pro" />
        </RadioGroup>
        <p className="text-xs text-neutral-500">
          30 Tage gratis. Pro Mannschaft buchbar — weitere Mannschaften später aktivierbar.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => router.push("/onboarding/verein/1")}>
          ← Zurück
        </Button>
        <Button variant="accent" onClick={handleNext}>
          Weiter →
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ plan, price, selected, value }: { plan: string; price: string; selected: boolean; value: string }) {
  return (
    <div className={selected ? "rounded-lg border-2 border-accent bg-accent/5 p-4" : "rounded-lg border border-neutral-200 bg-white p-4"}>
      <RadioGroupItem value={value} id={`plan-${value}`} className="sr-only" />
      <Label htmlFor={`plan-${value}`} className="cursor-pointer">
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl uppercase tracking-wide">{plan === "basic" ? "Basic" : "Pro"}</div>
          <div className="font-mono text-sm">{price}</div>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-neutral-600">
          {plan === "basic" ? (
            <>
              <li>· 20 Sponsoren pro Mannschaft</li>
              <li>· Alle Auto- & Manuelle-Trigger</li>
              <li>· Monatliches PDF</li>
            </>
          ) : (
            <>
              <li>· Unlimited Sponsoren</li>
              <li>· Vereins-Logo auf PDF</li>
              <li>· CSV-Export, Custom-Trigger</li>
            </>
          )}
        </ul>
      </Label>
    </div>
  );
}
```

- [ ] **Step 2: Step-2-Page**

`app/(onboarding)/onboarding/verein/2/page.tsx`:

```typescript
import { WizardProgress } from "@/components/shared/wizard-progress";
import { TeamPlanStep } from "../_components/team-plan-step";
import { Suspense } from "react";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step2Page() {
  return (
    <div className="space-y-8">
      <WizardProgress steps={STEPS} currentStep={2} />
      <Suspense fallback={<div>Lade…</div>}>
        <TeamPlanStep />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(onboarding\)/onboarding/verein/2/ app/\(onboarding\)/onboarding/verein/_components/team-plan-step.tsx
git commit -m "feat(onboarding): step 2 — team selection + plan choice"
```

---

### Task 12: Step 3 — Stammdaten

**Files:**
- Create: `app/(onboarding)/onboarding/verein/3/page.tsx`, `app/(onboarding)/onboarding/verein/_components/stammdaten-step.tsx`, `lib/validations/club.ts`

- [ ] **Step 1: Zod-Schema `lib/validations/club.ts`**

```typescript
import { z } from "zod";

export const clubStammdatenSchema = z.object({
  contactName: z.string().min(2, "Name fehlt"),
  street: z.string().min(2),
  zip: z.string().min(4),
  city: z.string().min(2),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional(),
  iban: z.string().min(15, "IBAN sieht zu kurz aus").max(34)
});

export type ClubStammdaten = z.infer<typeof clubStammdatenSchema>;
```

- [ ] **Step 2: `_components/stammdaten-step.tsx`** (Client Component mit Form)

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { clubStammdatenSchema, type ClubStammdaten } from "@/lib/validations/club";
import { toast } from "sonner";

export function StammdatenStep() {
  const router = useRouter();
  const params = useSearchParams();

  const form = useForm<ClubStammdaten>({
    resolver: zodResolver(clubStammdatenSchema),
    defaultValues: {
      contactName: "",
      street: "",
      zip: "",
      city: "",
      isSmallBusiness: true,
      taxId: "",
      iban: ""
    }
  });

  function onSubmit(values: ClubStammdaten) {
    // Daten in URL packen für Step 4 (für die Demo — in v2 ggf. in Server-State via Cookie)
    const next = new URLSearchParams(params);
    next.set("contactName", values.contactName);
    next.set("street", values.street);
    next.set("zip", values.zip);
    next.set("city", values.city);
    next.set("isSmallBusiness", String(values.isSmallBusiness));
    if (values.taxId) next.set("taxId", values.taxId);
    next.set("iban", values.iban);
    router.push(`/onboarding/verein/4?${next.toString()}`);
  }

  const isSB = form.watch("isSmallBusiness");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="contactName" render={({ field }) => (
          <FormItem>
            <FormLabel>Dein Name (Kontaktperson)</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField control={form.control} name="street" render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Straße + Hausnummer</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="zip" render={({ field }) => (
            <FormItem>
              <FormLabel>PLZ</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="city" render={({ field }) => (
            <FormItem>
              <FormLabel>Stadt</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="isSmallBusiness" render={({ field }) => (
          <FormItem className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <FormLabel>Kleinunternehmer (§19 UStG)</FormLabel>
                <FormDescription>Aktiv lassen, wenn dein Verein nicht USt-pflichtig ist.</FormDescription>
              </div>
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="h-5 w-5"
              />
            </div>
          </FormItem>
        )} />

        {!isSB && (
          <FormField control={form.control} name="taxId" render={({ field }) => (
            <FormItem>
              <FormLabel>USt-IdNr.</FormLabel>
              <FormControl><Input {...field} placeholder="DE123456789" /></FormControl>
              <FormDescription>Erscheint auf den Sponsoren-Rechnungen.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <FormField control={form.control} name="iban" render={({ field }) => (
          <FormItem>
            <FormLabel>IBAN</FormLabel>
            <FormControl><Input {...field} placeholder="DE89 3704 0044 0532 0130 00" /></FormControl>
            <FormDescription>Wir nehmen kein Geld an — die IBAN steht nur auf der Rechnung an deine Sponsoren.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={() => router.back()}>← Zurück</Button>
          <Button type="submit" variant="accent">Weiter →</Button>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 3: Step-3-Page**

`app/(onboarding)/onboarding/verein/3/page.tsx`:

```typescript
import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { StammdatenStep } from "../_components/stammdaten-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step3Page() {
  return (
    <div className="space-y-8">
      <WizardProgress steps={STEPS} currentStep={3} />
      <Suspense fallback={<div>Lade…</div>}>
        <StammdatenStep />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(onboarding\)/onboarding/verein/3/ app/\(onboarding\)/onboarding/verein/_components/stammdaten-step.tsx lib/validations/club.ts
git commit -m "feat(onboarding): step 3 — club master data form"
```

---

### Task 13: Step 4 — Persistierung + Sponsor-Einladungslink

**Files:**
- Create: `app/(onboarding)/onboarding/verein/4/page.tsx`, `app/(onboarding)/onboarding/verein/_actions/finalize.ts`, `app/(onboarding)/onboarding/verein/_components/invite-step.tsx`, `lib/db/schema/invitations.ts`, `lib/db/queries/invitations.ts`
- Modify: `lib/db/schema/index.ts`, `lib/db/relations.ts`

- [ ] **Step 1: Neue Tabelle `sponsor_invitations` für Einladungslinks**

`lib/db/schema/invitations.ts`:

```typescript
import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";
import { users } from "./auth";

export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "used", "revoked"]);

export const sponsorInvitations = pgTable("sponsor_invitations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  token: text("token").notNull().unique(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: invitationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id").references(() => users.id, { onDelete: "set null" })
});
```

Add `export * from "./invitations";` to `lib/db/schema/index.ts`.

Add relations to `lib/db/relations.ts`:

```typescript
import { sponsorInvitations } from "./schema/invitations";

export const sponsorInvitationsRelations = relations(sponsorInvitations, ({ one }) => ({
  team: one(teams, { fields: [sponsorInvitations.teamId], references: [teams.id] }),
  createdBy: one(users, { fields: [sponsorInvitations.createdByUserId], references: [users.id] })
}));
```

- [ ] **Step 2: Generate + apply migration**

```bash
cd /Users/johan/kickpact
npm run db:generate
npm run db:migrate
```

- [ ] **Step 3: Query-Helper `lib/db/queries/invitations.ts`**

```typescript
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";

function generateToken(): string {
  return randomBytes(24).toString("base64url"); // 32 chars URL-safe
}

export async function createInvitation(args: { teamId: string; createdByUserId: string }) {
  const token = generateToken();
  const [row] = await db
    .insert(sponsorInvitations)
    .values({ teamId: args.teamId, createdByUserId: args.createdByUserId, token })
    .returning();
  return row;
}

export async function findInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.token, token))
    .limit(1);
  return row ?? null;
}

export async function markInvitationUsed(token: string, usedByUserId: string) {
  await db
    .update(sponsorInvitations)
    .set({ status: "used", usedAt: new Date(), usedByUserId })
    .where(eq(sponsorInvitations.token, token));
}
```

- [ ] **Step 4: Finalize-Action `_actions/finalize.ts`**

```typescript
"use server";

import slugify from "slugify";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { clubs, teams, clubMemberships, subscriptions, teamLicenses } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { createInvitation } from "@/lib/db/queries/invitations";

const finalizeSchema = z.object({
  verein: z.object({
    name: z.string(),
    vereinId: z.string(),
    slug: z.string()
  }),
  team: z.object({
    name: z.string(),
    teamId: z.string(),
    slug: z.string(),
    saison: z.string()
  }),
  stammdaten: z.object({
    contactName: z.string(),
    street: z.string(),
    zip: z.string(),
    city: z.string(),
    isSmallBusiness: z.boolean(),
    taxId: z.string().optional(),
    iban: z.string()
  }),
  plan: z.enum(["basic", "pro"])
});

export async function finalizeOnboarding(input: z.infer<typeof finalizeSchema>) {
  const user = await requireUser();
  const parsed = finalizeSchema.parse(input);

  const slug = slugify(parsed.verein.name, { lower: true, strict: true, trim: true });

  // Insert all in a transaction
  const result = await db.transaction(async (tx) => {
    // Club
    const [club] = await tx
      .insert(clubs)
      .values({
        slug,
        name: parsed.verein.name,
        ort: parsed.stammdaten.city,
        fussballdeVereinId: parsed.verein.vereinId,
        taxId: parsed.stammdaten.taxId || null,
        isSmallBusiness: parsed.stammdaten.isSmallBusiness,
        addressJson: {
          street: parsed.stammdaten.street,
          zip: parsed.stammdaten.zip,
          city: parsed.stammdaten.city,
          country: "DE"
        },
        iban: parsed.stammdaten.iban
      })
      .returning();

    // Membership: user wird admin
    await tx.insert(clubMemberships).values({
      userId: user.id,
      clubId: club.id,
      role: "admin"
    });

    // Team
    const [team] = await tx
      .insert(teams)
      .values({
        clubId: club.id,
        name: parsed.team.name,
        saison: parsed.team.saison,
        fussballdeTeamId: parsed.team.teamId,
        fussballdeSlug: parsed.team.slug,
        isActive: true
      })
      .returning();

    // Subscription (Trial-State, ohne echte Stripe-Anbindung — kommt Plan 5)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    await tx.insert(subscriptions).values({
      clubId: club.id,
      stripeCustomerId: `placeholder_${club.id}`,
      stripeSubscriptionId: null,
      status: "trialing",
      trialEndsAt: trialEnd
    });

    await tx.insert(teamLicenses).values({
      subscriptionClubId: club.id,
      teamId: team.id,
      plan: parsed.plan,
      stripeSubscriptionItemId: null,
      status: "trialing"
    });

    return { club, team };
  });

  // Invitation außerhalb der Transaktion (separate insert)
  const invitation = await createInvitation({
    teamId: result.team.id,
    createdByUserId: user.id
  });

  return {
    clubSlug: result.club.slug,
    teamId: result.team.id,
    invitationToken: invitation.token
  };
}
```

- [ ] **Step 5: `slugify` installieren**

```bash
cd /Users/johan/kickpact
npm install slugify
```

- [ ] **Step 6: Invite-Step-Client `_components/invite-step.tsx`**

```typescript
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { finalizeOnboarding } from "../_actions/finalize";
import { toast } from "sonner";

export function InviteStep() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [invitationUrl, setInvitationUrl] = useState<string>("");
  const [clubSlug, setClubSlug] = useState<string>("");

  useEffect(() => {
    if (invitationUrl) return; // already finalized
    startTransition(async () => {
      try {
        const result = await finalizeOnboarding({
          verein: {
            name: params.get("name")!,
            vereinId: params.get("vereinId")!,
            slug: params.get("slug")!
          },
          team: {
            name: params.get("teamName")!,
            teamId: params.get("teamId")!,
            slug: params.get("teamSlug")!,
            saison: params.get("saison")!
          },
          stammdaten: {
            contactName: params.get("contactName")!,
            street: params.get("street")!,
            zip: params.get("zip")!,
            city: params.get("city")!,
            isSmallBusiness: params.get("isSmallBusiness") === "true",
            taxId: params.get("taxId") || undefined,
            iban: params.get("iban")!
          },
          plan: (params.get("plan") as "basic" | "pro") ?? "basic"
        });
        const baseUrl = window.location.origin;
        setInvitationUrl(`${baseUrl}/einladung/${result.invitationToken}`);
        setClubSlug(result.clubSlug);
        toast.success("Verein angelegt!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (pending && !invitationUrl) {
    return <div className="text-neutral-500">Lege Verein an …</div>;
  }

  if (!invitationUrl) {
    return <div className="text-red-700">Fehler. Bitte zurück zu Schritt 3.</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-wide">
            🎉 Geschafft! Verein ist angelegt.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-neutral-600">
            Jetzt einladen lädst du Sponsoren ein. Schick ihnen einfach diesen Link:
          </p>
          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={invitationUrl}
              className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="accent"
              onClick={() => {
                navigator.clipboard.writeText(invitationUrl);
                toast.success("Link kopiert");
              }}
            >
              Kopieren
            </Button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Jeder, der diesen Link öffnet, kann sich als Sponsor für deine Mannschaft registrieren
            und Pledges anlegen.
          </p>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => router.push(`/verein/${clubSlug}`)}>
        Zum Vereins-Dashboard →
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Step-4-Page**

`app/(onboarding)/onboarding/verein/4/page.tsx`:

```typescript
import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { InviteStep } from "../_components/invite-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step4Page() {
  return (
    <div className="space-y-8">
      <WizardProgress steps={STEPS} currentStep={4} />
      <Suspense fallback={<div>Lade…</div>}>
        <InviteStep />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add app/\(onboarding\)/onboarding/verein/ lib/db/schema/invitations.ts lib/db/schema/index.ts lib/db/relations.ts lib/db/queries/invitations.ts drizzle/migrations/ package.json package-lock.json
git commit -m "feat(onboarding): step 4 — finalize club + generate sponsor invitation link"
```

---

**Phase D complete checkpoint:** Vereins-Onboarding-Wizard funktioniert end-to-end. User landet nach Step 4 mit kopierbarem Einladungslink.

---

## Phase E — Sponsor-Onboarding + Pledge-Setup

Goal: Sponsor klickt Einladungslink → Login → Sponsor-Typ → Pledge-Setup.

### Task 14: Einladungs-Landing `/einladung/[token]`

**Files:**
- Create: `app/einladung/[token]/page.tsx`, `app/einladung/[token]/_components/accept-form.tsx`

- [ ] **Step 1: Page (Server Component lookup)**

`app/einladung/[token]/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations, teams, clubs } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth/session";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [invitation] = await db
    .select({
      id: sponsorInvitations.id,
      status: sponsorInvitations.status,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(sponsorInvitations)
    .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(sponsorInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Einladung ungültig</CardTitle>
            <CardDescription>Dieser Link existiert nicht.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (invitation.status === "revoked") {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Einladung zurückgezogen</CardTitle>
            <CardDescription>Der Verein hat diesen Link deaktiviert.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const session = await getServerSession();

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">
            {invitation.clubName}
          </CardTitle>
          <CardDescription>
            lädt dich ein, die <strong>{invitation.teamName}</strong> zu unterstützen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">
            Lege ein Pledge an — z.B. <em>5 € pro Tor</em> oder <em>10 € pro Sieg</em>. Am
            Monatsende bekommst du eine Rechnung vom Verein über das, was im letzten
            Monat zusammenkam.
          </p>
          <div className="mt-6">
            <Button variant="accent" className="w-full" asChild>
              <Link
                href={
                  session?.user
                    ? `/sponsor/pledge/new?invitation=${token}`
                    : `/login?invitation=${token}`
                }
              >
                {session?.user ? "Pledge anlegen" : "Login / Account anlegen"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Modify `MagicLinkForm` so dass `invitation` URL-Param weitergegeben wird**

In `components/auth/magic-link-form.tsx`, MODIFY die `signIn.magicLink` aufruf:

```typescript
const callbackBase = mode === "signup" ? "/onboarding/verein/1" : "/sponsor";
// Wenn invitation-Param im URL, leite stattdessen zum Sponsor-Onboarding-Flow:
const invitationToken = new URLSearchParams(window.location.search).get("invitation");
const callbackURL = invitationToken
  ? `/sponsor/onboarding?invitation=${invitationToken}`
  : callbackBase;

const result = await signIn.magicLink({
  email: values.email,
  callbackURL
});
```

- [ ] **Step 3: Commit**

```bash
git add app/einladung/ components/auth/magic-link-form.tsx
git commit -m "feat(invitations): landing + magic-link forwarding"
```

---

### Task 15: Sponsor-Onboarding (Typ-Auswahl)

**Files:**
- Create: `app/(sponsor)/sponsor/onboarding/page.tsx`, `app/(sponsor)/sponsor/onboarding/_components/sponsor-type-form.tsx`, `app/(sponsor)/sponsor/onboarding/_actions/create-sponsor.ts`, `lib/validations/sponsor.ts`

- [ ] **Step 1: Zod-Schema `lib/validations/sponsor.ts`**

```typescript
import { z } from "zod";

const baseSchema = z.object({
  displayName: z.string().min(2, "Name fehlt")
});

export const sponsorFamilieSchema = baseSchema.extend({
  type: z.literal("familie")
});

export const sponsorBusinessSchema = baseSchema.extend({
  type: z.literal("business"),
  businessName: z.string().min(2),
  street: z.string().min(2),
  zip: z.string().min(4),
  city: z.string().min(2),
  businessTaxId: z.string().optional()
});

export const sponsorOnboardingSchema = z.discriminatedUnion("type", [
  sponsorFamilieSchema,
  sponsorBusinessSchema
]);

export type SponsorOnboardingInput = z.infer<typeof sponsorOnboardingSchema>;
```

- [ ] **Step 2: Server Action `_actions/create-sponsor.ts`**

```typescript
"use server";

import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { sponsorOnboardingSchema, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { markInvitationUsed } from "@/lib/db/queries/invitations";

export async function createSponsor(input: SponsorOnboardingInput, invitationToken?: string) {
  const user = await requireUser();
  const parsed = sponsorOnboardingSchema.parse(input);

  const [sponsor] = await db
    .insert(sponsors)
    .values({
      userId: user.id,
      displayName: parsed.displayName,
      type: parsed.type,
      businessName: parsed.type === "business" ? parsed.businessName : null,
      businessAddressJson:
        parsed.type === "business"
          ? {
              street: parsed.street,
              zip: parsed.zip,
              city: parsed.city,
              country: "DE"
            }
          : null,
      businessTaxId: parsed.type === "business" ? parsed.businessTaxId || null : null
    })
    .returning();

  if (invitationToken) {
    await markInvitationUsed(invitationToken, user.id);
  }

  return { sponsorId: sponsor.id };
}
```

- [ ] **Step 3: Form-Component `_components/sponsor-type-form.tsx`**

(Client Component, größerer Form mit `discriminatedUnion`. Pseudo-code-Pattern wie Step 12 — Form mit RadioGroup für Typ, conditional Business-Felder.)

Implementation-Detail (Engineer baut analog zu Step 12 Stammdaten):

- RadioGroup: `familie` (default) | `business`
- Wenn `business` ausgewählt: zeige zusätzliche Felder `businessName`, `street`, `zip`, `city`, `businessTaxId` (optional)
- Beim Submit: `createSponsor(values, invitationToken)` → redirect zu `/sponsor/pledge/new?invitation=...`

(Code-Skizze, vollständig analog zu `StammdatenStep` aus Task 12.)

- [ ] **Step 4: Page**

```typescript
import { Suspense } from "react";
import { SponsorTypeForm } from "./_components/sponsor-type-form";

export default function SponsorOnboardingPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-4xl tracking-wide">Willkommen bei KickPact</h1>
      <p className="mt-1 text-neutral-500">Kurze Frage: Bist du Familie/Freund oder Unternehmen?</p>
      <div className="mt-8">
        <Suspense fallback={<div>Lade…</div>}>
          <SponsorTypeForm />
        </Suspense>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(sponsor\)/sponsor/onboarding/ lib/validations/sponsor.ts
git commit -m "feat(sponsor): onboarding with type selection (familie/business)"
```

---

### Task 16: Pledge-Setup Wizard Step 1 — Trigger + Beträge

**Files:**
- Create: `app/(sponsor)/sponsor/pledge/new/page.tsx`, `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`, `lib/validations/pledge.ts`

Dieses Task ist umfangreich aber konzeptionell ähnlich zu den Wizard-Steps. Kernidee:

- [ ] **Step 1: Zod-Schemas `lib/validations/pledge.ts`**

```typescript
import { z } from "zod";

export const TRIGGER_TYPES = [
  "goal_total",
  "win",
  "clean_sheet",
  "comeback_win",
  "hattrick",
  "goal_by_player",
  "special_goal",
  "goals_scored_min",
  "goal_diff_min"
] as const;

export const pledgeRuleSchema = z.object({
  triggerType: z.enum(TRIGGER_TYPES),
  amountEur: z.number().min(0.5).max(500),
  perMatchCapEur: z.number().optional(),
  params: z.record(z.unknown()).default({})
});

export const pledgeSchema = z.object({
  teamId: z.string().min(1),
  invitationToken: z.string().optional(),
  rules: z.array(pledgeRuleSchema).min(1, "Mindestens eine Regel"),
  monthlyCapEur: z.number().optional(),
  endsAtSaisonEnd: z.boolean().default(true)
});

export type PledgeInput = z.infer<typeof pledgeSchema>;
```

- [ ] **Step 2: Pledge-Builder Komponente (Single-Page-Wizard mit allen Steps)**

Engineer baut `pledge-builder.tsx`: ein größeres Form, das in einer Datei alle 3 Sub-Steps abbildet:

1. **Trigger-Auswahl:** Multi-Select-Liste mit Trigger-Typen (Checkbox + Amount-Input neben jedem)
2. **Monats-Cap:** Optional, mit Hinweis-Banner falls leer ("Wir empfehlen einen Cap.")
3. **Worst-Case-Berechnung:** simple Heuristik (z.B. Annahme: 18 Spiele Saison, durchschnittlich 2 Tore pro Spiel, 60% Win-Quote) → zeigt Range "Bei dieser Konfiguration zahlst du ~XX€/Saison".

Library: `react-hook-form` + `useFieldArray` für die Rule-Liste.

Submit → Server Action `createPledge` (siehe Task 17).

- [ ] **Step 3: Commit (Skelett ohne Action — Action kommt Task 17)**

```bash
git add app/\(sponsor\)/sponsor/pledge/new/ lib/validations/pledge.ts
git commit -m "feat(pledge): setup wizard ui (form + worst-case calc)"
```

---

### Task 17: Pledge Server Action + Persistierung

**Files:**
- Create: `app/(sponsor)/sponsor/pledge/new/_actions/create-pledge.ts`
- Modify: `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`

- [ ] **Step 1: Server Action**

```typescript
"use server";

import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { pledgeSchema, type PledgeInput } from "@/lib/validations/pledge";
import { markInvitationUsed } from "@/lib/db/queries/invitations";

export async function createPledge(input: PledgeInput) {
  const user = await requireUser();
  const parsed = pledgeSchema.parse(input);

  const [sponsor] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);
  if (!sponsor) throw new Error("Sponsor profile missing — please complete onboarding");

  const startsAt = new Date();
  // Saisonende: vereinfacht 30. Juni nächstes Jahr falls aktuell Januar–Juni, sonst 30. Juni übernächstes Jahr
  const seasonEnd = (() => {
    const now = new Date();
    const year = now.getMonth() <= 5 ? now.getFullYear() : now.getFullYear() + 1;
    return new Date(`${year}-06-30T23:59:59Z`);
  })();

  const result = await db.transaction(async (tx) => {
    const [pledge] = await tx
      .insert(pledges)
      .values({
        sponsorId: sponsor.id,
        teamId: parsed.teamId,
        status: "active",
        startsAt,
        endsAt: parsed.endsAtSaisonEnd
          ? seasonEnd
          : new Date(seasonEnd.getTime() + 365 * 24 * 60 * 60 * 1000),
        monthlyCapCents: parsed.monthlyCapEur ? Math.round(parsed.monthlyCapEur * 100) : null
      })
      .returning();

    await tx.insert(pledgeRules).values(
      parsed.rules.map((r) => ({
        pledgeId: pledge.id,
        triggerType: r.triggerType,
        triggerParamsJson: r.params,
        amountCents: Math.round(r.amountEur * 100),
        perMatchCapCents: r.perMatchCapEur ? Math.round(r.perMatchCapEur * 100) : null,
        requiresApproval: r.triggerType === "special_goal" // Manuelle Events brauchen approval
      }))
    );

    return { pledgeId: pledge.id };
  });

  if (parsed.invitationToken) {
    await markInvitationUsed(parsed.invitationToken, user.id);
  }

  return result;
}
```

- [ ] **Step 2: Verdrahte Action im Pledge-Builder**

Im `pledge-builder.tsx` aus Task 16: bei Submit `createPledge` aufrufen, dann redirect zu `/sponsor/pledge/${result.pledgeId}`.

- [ ] **Step 3: Commit**

```bash
git add app/\(sponsor\)/sponsor/pledge/new/_actions/
git commit -m "feat(pledge): server action to persist pledge + rules"
```

---

### Task 18: Pledge-Detail-Page (stub)

**Files:**
- Create: `app/(sponsor)/sponsor/pledge/[id]/page.tsx`

- [ ] **Step 1: Stub-Page mit Pledge-Daten**

```typescript
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [pledge] = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      startsAt: pledges.startsAt,
      endsAt: pledges.endsAt,
      monthlyCapCents: pledges.monthlyCapCents,
      teamName: teams.name,
      clubName: clubs.name,
      sponsorUserId: sponsors.userId
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.id, id))
    .limit(1);

  if (!pledge || pledge.sponsorUserId !== user.id) {
    redirect("/sponsor");
  }

  const rules = await db.select().from(pledgeRules).where(eq(pledgeRules.pledgeId, id));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide">
        Pledge für {pledge.teamName}
      </h1>
      <p className="mt-1 text-neutral-500">{pledge.clubName}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status</CardTitle></CardHeader>
          <CardContent className="text-2xl font-medium">{pledge.status}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Laufzeit</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {pledge.startsAt.toLocaleDateString("de-DE")} – {pledge.endsAt.toLocaleDateString("de-DE")}
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 font-display text-2xl tracking-wide">Regeln</h2>
      <ul className="mt-3 space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="font-medium">
              {(r.amountCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}{" "}
              <span className="font-normal text-neutral-500">pro {r.triggerType}</span>
            </div>
            {r.perMatchCapCents && (
              <div className="text-xs text-neutral-400">
                Max {(r.perMatchCapCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Spiel
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-neutral-400">
        Pledge ist aktiv. Bei jedem neuen Spiel deiner Mannschaft erzeugt KickPact
        automatisch Charges. Die laufenden Beträge siehst du im Dashboard.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(sponsor\)/sponsor/pledge/\[id\]/
git commit -m "feat(pledge): stub detail page with rules display"
```

---

**Phase E complete checkpoint:** Sponsor kann sich via Einladungslink registrieren, Sponsor-Typ wählen, Pledge mit Regeln anlegen, Pledge sehen.

---

## Phase F — Stub-Dashboards

### Task 19: Vereins-Dashboard `/verein/[slug]`

**Files:**
- Create: `app/(verein)/verein/[slug]/layout.tsx`, `app/(verein)/verein/[slug]/page.tsx`

- [ ] **Step 1: Layout mit Tenant-Check**

```typescript
import { assertClubAccess } from "@/lib/auth/scope";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "viewer");
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl tracking-wide">{club.name}</h1>
        <p className="text-neutral-500">Vereins-Dashboard</p>
      </div>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: Dashboard Page mit Counts + Sponsor-Link**

```typescript
import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, pledges, sponsors, sponsorInvitations, clubs } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ClubDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);

  const teamRows = await db.select().from(teams).where(eq(teams.clubId, club.id));
  const teamIds = teamRows.map((t) => t.id);

  // Active invitations
  const [{ invitationCount }] = await db
    .select({ invitationCount: count() })
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.createdByUserId, club.id)); // approximation

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Mannschaften</CardTitle></CardHeader>
          <CardContent className="text-3xl font-medium">{teamRows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Aktive Sponsoren</CardTitle></CardHeader>
          <CardContent className="text-3xl font-medium">0</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Spiele ausgewertet</CardTitle></CardHeader>
          <CardContent className="text-3xl font-medium">0</CardContent>
        </Card>
      </div>

      <h2 className="mt-10 font-display text-2xl tracking-wide">Mannschaften</h2>
      <ul className="space-y-2">
        {teamRows.map((t) => (
          <li key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-neutral-400">Saison {t.saison}</div>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6">
        <p className="text-sm text-neutral-600">
          Match-Detail, Manual-Event-Editor und Approval-Inbox kommen in Plan 3.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(verein\)/
git commit -m "feat(verein): stub dashboard with team count + placeholder note"
```

---

### Task 20: Sponsor-Dashboard `/sponsor`

**Files:**
- Create: `app/(sponsor)/sponsor/layout.tsx`, `app/(sponsor)/sponsor/page.tsx`

- [ ] **Step 1: Layout**

```typescript
import { requireUser } from "@/lib/auth/session";

export default async function SponsorLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl tracking-wide">Sponsor-Dashboard</h1>
      </div>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: Dashboard**

```typescript
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SponsorDashboard() {
  const user = await requireUser();
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (!sponsor) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p>Du hast noch kein Sponsor-Profil.</p>
        <p className="mt-2 text-sm text-neutral-500">
          Folge einer Einladung von einem Verein, um zu starten.
        </p>
      </div>
    );
  }

  const myPledges = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      teamName: teams.name,
      clubName: clubs.name,
      endsAt: pledges.endsAt
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.sponsorId, sponsor.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl tracking-wide">Deine Pledges</h2>
        {myPledges.length === 0 ? (
          <p className="mt-2 text-neutral-500">
            Du hast noch keinen Pledge. Öffne einen Einladungslink von einem Verein.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {myPledges.map((p) => (
              <li key={p.id}>
                <Link href={`/sponsor/pledge/${p.id}`} className="block rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.teamName}</div>
                      <div className="text-xs text-neutral-400">{p.clubName}</div>
                    </div>
                    <div className="text-xs text-neutral-500">bis {p.endsAt.toLocaleDateString("de-DE")}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6">
        <p className="text-sm text-neutral-600">
          Approval-Inbox und Rechnungen kommen in Plan 3+4.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(sponsor\)/sponsor/layout.tsx app/\(sponsor\)/sponsor/page.tsx
git commit -m "feat(sponsor): stub dashboard with pledge list"
```

---

**Phase F complete checkpoint:** Beide Dashboards rendern für eingeloggten User mit echten DB-Daten.

---

## Phase G — E2E-Test

### Task 21: Komplettes Onboarding-E2E

**Files:**
- Create: `tests/e2e/full-onboarding.test.ts`, `playwright.config.ts`

- [ ] **Step 1: Playwright als Test-Runner installieren (zusätzlich zum bestehenden Crawler-Setup)**

```bash
cd /Users/johan/kickpact
npm install -D @playwright/test
```

- [ ] **Step 2: `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 5 * 60 * 1000,
  use: {
    baseURL: "http://localhost:3003",
    headless: true
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3003",
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000
  }
});
```

- [ ] **Step 3: E2E-Test Skeleton (UNSKIPPED bei `RUN_E2E=1`)**

```typescript
import { test, expect } from "@playwright/test";

const SHOULD_RUN = process.env.RUN_E2E === "1";
test.skip(!SHOULD_RUN, "E2E only when RUN_E2E=1");

test("Verein anlegen + Sponsor einladen + Pledge anlegen", async ({ page }) => {
  // Diese Tests brauchen eine real existing Magic-Link-Inbox + Fußball.de Live-Daten.
  // Strategie: für CI-friendly setup → mocken oder skippen. Hier dokumentieren wir den Flow für manuelles Smoke-Testing.

  await page.goto("/");
  await expect(page.getByText("KickPact")).toBeVisible();
  await page.getByRole("link", { name: /Verein anlegen/i }).first().click();
  await expect(page).toHaveURL(/signup/);

  // Bis hier können wir ohne echte Mail navigieren.
  // Für vollständiges E2E: User per DB-Seed + Session-Cookie injizieren statt Magic Link.
  // Pattern dafür in nächstem Plan dokumentieren.
});

test("Landing-Seite zeigt Marketing-Hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Sponsoring/ })).toBeVisible();
  await expect(page.getByText(/Weniger als 1/)).toBeVisible();
});

test("Status-Seite zeigt System-Status + Live-Demo", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByText(/System-Status/)).toBeVisible();
  await expect(page.getByText(/Trigger-Engine/)).toBeVisible();
});
```

- [ ] **Step 4: Run E2E (manuell, weil Live-Server)**

```bash
RUN_E2E=1 npx playwright test
```

Expected: 2 von 3 Tests grün (Landing + Status). Onboarding-Test ist im Skelett dokumentiert aber noch nicht vollständig (Magic Link erfordert seed).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ playwright.config.ts package.json package-lock.json
git commit -m "test(e2e): add playwright e2e suite (landing + status verified; onboarding skeleton)"
```

---

## Plan Self-Review

**1. Spec coverage:**

- ✅ Section 6.1 Vereins-Onboarding — Phase D (Tasks 9-13)
- ✅ Section 6.2 Sponsor-Onboarding — Phase E (Tasks 14-15)
- ✅ Section 6.3 Pledge-Setup — Phase E (Tasks 16-18)
- ✅ Section 7 Auth & Berechtigung — Phase A (Tasks 1-4)
- ✅ Section 8.1 Route-Map — Phasen C, D, E, F decken alle Routes ab
- ✅ Section 8.4 Pricing — Plan-Choice in Onboarding Step 2
- ❌ Section 8.2/8.3 Brand-Polish — bleibt Plan 6 (Logo, finale Palette)
- ❌ Section 6.5/6.6 Manual-Events + Approval-Inbox — Plan 3
- ❌ Section 6.7 Invoicing — Plan 4

Plan 2 = Auth-Foundation + Onboarding-Flows + Stub-Dashboards. Klar abgegrenzt.

**2. Placeholder scan:**

- Task 15 Step 3 sagt "Implementation-Detail … analog zu StammdatenStep" — bewusst kompakt, das Pattern ist eindeutig aus Task 12.
- Task 16 Step 2 ähnlich kompakt — Form-Pattern aus Task 7+12 klar.
- Diese sind keine TBD-Placeholder sondern verweise auf wiederkehrende UI-Patterns.

**3. Type-Konsistenz:**

- `sponsorInvitations.token` ist UNIQUE → keine Kollision möglich
- `assertClubAccess(slug, minRole)` Signature konsistent zwischen Definition (Task 4) und Verwendung (Task 19)
- `pledgeSchema` mit `monthlyCapEur` (Euro) und `monthlyCapCents` (DB) — Conversion klar in Task 17

**Bekannte Issues, die NICHT in Plan 2 gelöst werden:**

- Magic-Link-Mail braucht eine verifizierte Sender-Domain bei Resend. Für Dev reicht `onboarding@resend.dev`, für Produktion muss `kickpact.de` (oder die finale Domain) bei Resend verifiziert werden. Hinweis in Task 2 für User.
- Sponsor-Onboarding-Flow nimmt an, dass der User nach dem Magic-Link auf `/sponsor/onboarding?invitation=...` landet. Die Callback-URL ist in Task 14 Step 2 verdrahtet. Validate manuell beim Smoketest.
- "Aktive Sponsoren" Count im Vereins-Dashboard (Task 19) ist 0 hardcoded (Stub) — echte Query kommt Plan 3.

---

## Execution Handoff

Plan 2 fertig und committed. Zwei Execution-Optionen:

**1. Subagent-Driven (Recommended für die Engineering-Tasks)** — frischer Subagent pro Task, ~21 Subagent-Dispatches, ähnlich Plan 1 in dieser Session. Realistisch eigene Session.

**2. Inline Execution** — Tasks direkt in current Session. Bei 21 Tasks deutlich zu viel Context-Pressure (wir sind bereits ~430k Tokens).

**Empfehlung:** **Fresh Session** für Plan-2-Implementation. Memory + CLAUDE.md + Spec + Plan 2 sind die Source-of-Truth für die neue Session. Eröffnungszeile dort: *"Plan 2 für KickPact, Task 1 starten."*

Welcher Modus? (Oder: Plan-Review zuerst.)
