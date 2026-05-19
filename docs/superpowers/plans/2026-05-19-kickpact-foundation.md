# KickPact Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Funktionsfähige Foundation für KickPact v1 — Next.js-Repo, vollständiges Postgres-Schema, portierter Fußball.de-Crawler und unit-getestete Trigger-Engine, die aus Match-Daten Charges erzeugt.

**Architecture:** Next.js 15 App Router mit Postgres/Neon + Drizzle ORM als Datenschicht, Playwright-Crawler + Trigger-Engine als Library-Module unter `lib/`, Inngest als Job-Runner für Crawl- und Evaluate-Jobs. Keine User-facing UI in diesem Plan — End-State ist via Inngest-Dev-Server + DB-Inspection demonstrierbar.

**Tech Stack:** Next.js 15, TypeScript 5.6, Tailwind v3.4, Drizzle ORM, Postgres (Neon), Inngest, Playwright, Vitest, Better Auth (nur Schema-Tabellen, kein Wire-Up).

**Spec:** [docs/superpowers/specs/2026-05-19-kickpact-v1-design.md](../specs/2026-05-19-kickpact-v1-design.md)

---

## File Structure

```
/Users/johan/kickpact/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── drizzle.config.ts
├── vitest.config.ts
├── .env.example
├── .env.local                          # gitignored
├── .gitignore
├── README.md
├── CLAUDE.md                           # Project-Context für künftige Sessions
├── app/
│   ├── layout.tsx                      # Root layout
│   ├── page.tsx                        # Temp homepage (single banner)
│   ├── globals.css                     # Tailwind directives
│   └── api/
│       └── inngest/route.ts            # Inngest endpoint
├── lib/
│   ├── db/
│   │   ├── client.ts                   # Drizzle client + pool
│   │   ├── schema/
│   │   │   ├── index.ts                # re-export all
│   │   │   ├── auth.ts                 # users, sessions, accounts, verifications (Better Auth)
│   │   │   ├── clubs.ts                # clubs, club_memberships, teams, players
│   │   │   ├── sponsors.ts             # sponsors
│   │   │   ├── pledges.ts              # pledges, pledge_rules
│   │   │   ├── matches.ts              # matches, match_events, event_approvals
│   │   │   ├── charges.ts              # charges, invoices, invoice_items
│   │   │   └── billing.ts              # subscriptions, team_licenses
│   │   └── relations.ts                # Drizzle relations()
│   ├── crawler/
│   │   ├── fussballde.ts               # Playwright scraper (port von altem crawler.js)
│   │   └── triggers.ts                 # Trigger-Engine (kernstück)
│   └── inngest/
│       ├── client.ts                   # Inngest client setup
│       └── functions/
│           ├── index.ts                # registry
│           ├── crawl-matches.ts        # Cron-Job alle 6h
│           └── evaluate-match.ts       # nach jedem neuen Match
├── tests/
│   ├── fixtures/
│   │   └── matches/
│   │       ├── win-with-goals.json
│   │       ├── clean-sheet.json
│   │       ├── comeback-win.json
│   │       ├── hattrick.json
│   │       └── draw-no-goals.json
│   ├── crawler/
│   │   ├── triggers.test.ts
│   │   └── fussballde.test.ts
│   └── inngest/
│       └── evaluate-match.test.ts
├── components/
│   └── ui/                             # shadcn output (Button only for now)
├── drizzle/
│   └── migrations/                     # generated
└── reference/
    └── kickpact-legacy/                # gitignored — alte Codebase als Referenz
```

## Phase Overview

- **Phase A** — Repo-Reset + Tooling-Setup (Tasks 1–8)
- **Phase B** — Database Schema (Tasks 9–13)
- **Phase C** — Trigger-Engine (Tasks 14–20) — kritischste Logik, TDD
- **Phase D** — Crawler-Port (Tasks 21–24)
- **Phase E** — Inngest Crawl-Job (Tasks 25–26)
- **Phase F** — Evaluate-Match-Job + Pipeline-Test (Tasks 27–29)

**End-State:** `npm run dev` startet die App. Inngest-Dev-Server zeigt die zwei registrierten Jobs. `npm test` läuft grün, mit > 25 Unit-Tests, davon ~15 für die Trigger-Engine. Manueller Aufruf von `crawl-matches` mit einem realen Team holt echte Spiele aus Fußball.de und persistiert sie. Manueller Aufruf von `evaluate-match` mit einem Match aus DB + einem Fixture-Pledge erzeugt `Charges`.

---

## Phase A — Repo-Reset + Tooling-Setup

Goal: Sauberer Next.js 15 / Drizzle / Inngest / Vitest Workspace; alter Code als Referenz erhalten.

### Task 1: Alten Code in `reference/kickpact-legacy/` verschieben

**Files:**
- Move: alles ausser `.git/`, `docs/`, `.env.example` in `reference/kickpact-legacy/`
- Modify: `.gitignore`

- [ ] **Step 1: Status checken + bestehende Branch sichern**

```bash
cd /Users/johan/kickpact
git status --short
git branch legacy-snapshot          # Sicherungsbranch für den April-Stand
```

Expected: Branch `legacy-snapshot` zeigt auf aktuellen `main`.

- [ ] **Step 2: Verzeichnis `reference/kickpact-legacy/` anlegen + alten Code verschieben**

```bash
mkdir -p reference/kickpact-legacy
# alles außer .git, docs, .env.example, reference, .gitignore verschieben
for item in crawler.js cron kickpact-app middleware models node_modules \
            package.json package-lock.json public routes server.js \
            services views; do
  [ -e "$item" ] && mv "$item" reference/kickpact-legacy/
done
```

- [ ] **Step 3: `.gitignore` schreiben (überschreibt alte Version)**

Datei `.gitignore`:

```
# deps
node_modules/

# next
.next/
out/

# env
.env
.env.local
.env*.local

# logs
*.log
npm-debug.log*

# test
coverage/

# editor
.vscode/
.idea/
.DS_Store

# drizzle (lokale snapshots)
drizzle/meta/_journal.json.bak

# legacy (alter April-Code, nur lokal als Referenz)
reference/

# inngest dev
.inngest/
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git rm -r --cached reference/ 2>/dev/null || true
git status --short
git commit -m "chore: archive legacy code to reference/, reset workspace"
```

Expected: Commit erfolgreich, `reference/` ist gitignored (nicht im Tree, aber lokal vorhanden).

---

### Task 2: Next.js 15 + TypeScript + Tailwind initialisieren

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: package.json mit allen Foundation-Deps anlegen**

Datei `package.json`:

```json
{
  "name": "kickpact",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "inngest:dev": "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "drizzle-orm": "0.36.4",
    "postgres": "3.4.5",
    "@neondatabase/serverless": "0.10.4",
    "inngest": "3.27.5",
    "playwright": "1.48.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/node": "22.9.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "tailwindcss": "3.4.14",
    "postcss": "8.4.49",
    "autoprefixer": "10.4.20",
    "drizzle-kit": "0.28.1",
    "vitest": "2.1.5",
    "@vitest/coverage-v8": "2.1.5",
    "tsx": "4.19.2"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd /Users/johan/kickpact
npm install
```

Expected: `node_modules/` entsteht, kein peer-dep-error.

- [ ] **Step 3: tsconfig.json**

Datei `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "reference"]
}
```

- [ ] **Step 4: next.config.ts**

Datei `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] }
  }
};

export default config;
```

- [ ] **Step 5: Tailwind + PostCSS**

Datei `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#FF5722", muted: "#FFE0B2" }
      },
      fontFamily: {
        display: ["var(--font-display)", "Anton", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
```

Datei `postcss.config.js`:

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 6: App-Skeleton**

Datei `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-display: Anton, sans-serif;
  --font-sans: Inter, sans-serif;
}

html, body { height: 100%; }
body { @apply bg-white text-neutral-900 antialiased; }
```

Datei `app/layout.tsx`:

```typescript
import "./globals.css";

export const metadata = {
  title: "KickPact",
  description: "Performance-basiertes Sponsoring im Amateurfußball"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
```

Datei `app/page.tsx`:

```typescript
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-6xl tracking-wide">KickPact</h1>
        <p className="mt-2 text-neutral-500">Foundation läuft.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Smoketest**

```bash
npm run dev
```

Im Browser `http://localhost:3000` öffnen → "KickPact" + "Foundation läuft." sichtbar. Server stoppen mit Strg-C.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts \
        tailwind.config.ts postcss.config.js app/
git commit -m "chore: init Next.js 15 + Tailwind 3 + TS 5.6 skeleton"
```

---

### Task 3: shadcn/ui initialisieren (nur Button für jetzt)

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/button.tsx`

- [ ] **Step 1: components.json anlegen (statt CLI-Wizard, damit deterministisch)**

Datei `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": false,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: utility installieren + lib/utils.ts**

```bash
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install -D @types/node
```

Datei `lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Button-Component (canonical shadcn-Code)**

```bash
npm install @radix-ui/react-slot
```

Datei `components/ui/button.tsx`:

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-white hover:bg-neutral-800",
        accent: "bg-accent text-white hover:bg-accent/90",
        outline: "border border-neutral-300 bg-white hover:bg-neutral-100",
        ghost: "hover:bg-neutral-100"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";
```

- [ ] **Step 4: Verify Build**

```bash
npm run build
```

Expected: Build erfolgreich, keine Type-Errors.

- [ ] **Step 5: Commit**

```bash
git add components.json lib/utils.ts components/ui/button.tsx package.json package-lock.json
git commit -m "chore: add shadcn/ui scaffolding + Button component"
```

---

### Task 4: Drizzle Setup + Neon-Client

**Files:**
- Create: `drizzle.config.ts`, `lib/db/client.ts`, `.env.example`

- [ ] **Step 1: Neon-Branch anlegen (manuell)**

Manueller Schritt — nicht automatisierbar via Code:

1. Auf https://console.neon.tech einloggen
2. Neues Projekt "kickpact" anlegen, Region `eu-central-1`
3. Im default-branch `main`: Connection String kopieren (mit `?sslmode=require`)
4. Optional: Branch `dev` anlegen für lokale Entwicklung

Expected: Connection-String der Form `postgresql://user:pass@host.neon.tech/kickpact?sslmode=require`.

- [ ] **Step 2: .env.example schreiben + .env.local lokal anlegen**

Datei `.env.example`:

```bash
# Database
DATABASE_URL="postgresql://user:pass@host.neon.tech/kickpact?sslmode=require"

# Better Auth (Phase: Plan 2)
BETTER_AUTH_SECRET="generate via: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Inngest
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""

# Stripe (Plan 5)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_BASIC_PRICE_ID=""
STRIPE_PRO_PRICE_ID=""

# Resend (Plan 2)
RESEND_API_KEY=""
MAIL_FROM="hello@kickpact.de"

# App
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

Manueller Schritt: `.env.local` anlegen, `DATABASE_URL` aus Neon eintragen, alles andere leer lassen.

```bash
cp .env.example .env.local
# DATABASE_URL editieren mit Neon-Connection-String
```

- [ ] **Step 3: drizzle.config.ts**

Datei `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!
  },
  verbose: true,
  strict: true
});
```

- [ ] **Step 4: lib/db/client.ts**

Datei `lib/db/client.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const queryClient = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
```

- [ ] **Step 5: dotenv-cli für drizzle-kit Commands**

```bash
npm install -D dotenv-cli
```

Edit `package.json` scripts (replace existing `db:*` entries):

```json
"db:generate": "dotenv -e .env.local -- drizzle-kit generate",
"db:migrate": "dotenv -e .env.local -- drizzle-kit migrate",
"db:studio": "dotenv -e .env.local -- drizzle-kit studio"
```

- [ ] **Step 6: Stub-Schema-Index, damit drizzle.config nicht bricht**

Datei `lib/db/schema/index.ts`:

```typescript
// Re-exports werden in Phase B befüllt
export {};
```

- [ ] **Step 7: Verify config works**

```bash
npm run db:studio
```

Expected: Studio öffnet im Browser, kein Schema sichtbar (Tabellen kommen in Phase B). Stoppen mit Strg-C.

- [ ] **Step 8: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts lib/db/schema/index.ts \
        .env.example package.json package-lock.json
git commit -m "chore: configure Drizzle ORM + Neon Postgres client"
```

---

### Task 5: Inngest Setup (Client + Endpoint)

**Files:**
- Create: `lib/inngest/client.ts`, `lib/inngest/functions/index.ts`, `app/api/inngest/route.ts`

- [ ] **Step 1: Inngest-Client**

Datei `lib/inngest/client.ts`:

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "kickpact",
  name: "KickPact"
});
```

- [ ] **Step 2: Functions-Registry (leer für jetzt)**

Datei `lib/inngest/functions/index.ts`:

```typescript
// Funktionen werden in Phase E + F registriert
export const functions: never[] = [];
```

- [ ] **Step 3: Next.js Route-Handler**

Datei `app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions
});
```

- [ ] **Step 4: Inngest CLI als devDependency**

```bash
npm install -D inngest-cli
```

- [ ] **Step 5: Smoketest**

```bash
# Terminal A
npm run dev

# Terminal B
npm run inngest:dev
```

Expected: Inngest-Dev-Server öffnet auf `http://localhost:8288`, dort steht "KickPact" als App registriert, 0 Funktionen. Beide Server stoppen.

- [ ] **Step 6: Commit**

```bash
git add lib/inngest/ app/api/inngest/route.ts package.json package-lock.json
git commit -m "chore: configure Inngest client + Next.js endpoint"
```

---

### Task 6: Vitest Setup für Unit-Tests

**Files:**
- Create: `vitest.config.ts`, `tests/sanity.test.ts`

- [ ] **Step 1: vitest.config.ts**

Datei `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/db/schema/**", "lib/inngest/client.ts"]
    }
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
```

- [ ] **Step 2: Sanity-Test**

Datei `tests/sanity.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("Vitest sanity", () => {
  it("kann assertions evaluieren", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run**

```bash
npm test
```

Expected: 1 file, 1 test passed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/sanity.test.ts
git commit -m "chore: configure Vitest test runner"
```

---

### Task 7: CLAUDE.md im Repo

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md schreiben**

Datei `CLAUDE.md`:

```markdown
# KickPact — Project Context for Claude Code

## Was ist das?

KickPact ist eine Plattform für performance-basiertes Sponsoring im Amateurfußball. Sponsoren versprechen Beträge pro Spielereignis (z.B. "5€ pro Tor"), Fußball.de wird gescraped, Manual Events meldet der Verein. Monatsende → PDF-Rechnung.

## Source of Truth

- **Spec:** [docs/superpowers/specs/2026-05-19-kickpact-v1-design.md](docs/superpowers/specs/2026-05-19-kickpact-v1-design.md)
- **Aktiver Plan:** [docs/superpowers/plans/2026-05-19-kickpact-foundation.md](docs/superpowers/plans/2026-05-19-kickpact-foundation.md)

## Stack-Konventionen

- **Next.js 15 App Router** — Server Components als Default, Client Components mit `"use client"` nur bei Interaktivität.
- **Drizzle ORM** — alle DB-Queries durch `lib/db/queries/<domain>.ts`-Layer, niemals direkt in Route Handlern oder Server Components.
- **TypeScript strict** — keine `any`s, keine `as unknown as Foo`-Casts.
- **Tailwind v3.4 + shadcn/ui** — Komponenten unter `components/ui/`, Domain-Komponenten unter `components/<verein|sponsor|shared>/`.
- **Tests** — Vitest unter `tests/`. Trigger-Engine + DB-Queries MÜSSEN Tests haben. UI-Tests E2E in späteren Plans.
- **Inngest** — alle Async-Jobs als Inngest-Functions, niemals direkt aus Route-Handlern. Cron-Schedules in der Function-Definition.

## Verboten

- Alter Code unter `reference/kickpact-legacy/` ist Referenz, NICHT die aktive Codebase. Niemals von dort importieren.
- Keine direkte MongoDB/Mongoose-Verwendung. Alles geht über Postgres+Drizzle.
- Keine PDFKit-Calls. PDF-Rendering via `@react-pdf/renderer` (kommt in Plan 4).
- Keine EJS-Views. Alle UI ist React/Next.js.

## Brand

- Tonalität: sport-energetisch (Strava/sofascore-Richtung).
- Farben: Orange/Rot/Lime-Akzente auf Neutral. Finale Palette + Logo entstehen mit `ui-ux-pro-max` in späteren Plans.
- Marketing-Hook: "Weniger als 1 € pro Spieler im Monat."

## Commands

| Command | Was |
|---|---|
| `npm run dev` | Next.js Dev-Server |
| `npm run inngest:dev` | Inngest-Dev-Server (parallel zu next dev) |
| `npm test` | Vitest run |
| `npm run db:generate` | Migration aus Schema generieren |
| `npm run db:migrate` | Migration auf DB anwenden |
| `npm run db:studio` | Drizzle Studio |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project context"
```

---

### Task 8: Push zu GitHub-Repo (Johannes221/KickPact, aktuell leer)

**Files:** keine — Git-Remote-Setup.

- [ ] **Step 1: Remote-Status prüfen**

```bash
cd /Users/johan/kickpact
git remote -v
```

- [ ] **Step 2: Remote-URL setzen oder updaten**

```bash
# Falls origin existiert aber verwaist
git remote set-url origin git@github.com:Johannes221/KickPact.git || \
  git remote add origin git@github.com:Johannes221/KickPact.git
```

- [ ] **Step 3: gh-Account-Switch (Johannes221, nicht HE-agency)**

```bash
gh auth status
# Falls aktiver Account nicht Johannes221:
gh auth switch -u Johannes221
```

- [ ] **Step 4: Push**

```bash
git push -u origin main
```

Expected: GitHub-Repo zeigt jetzt die Foundation. Erlaubt PR-Workflow für künftige Phasen.

- [ ] **Step 5: Verifikation**

```bash
gh repo view Johannes221/KickPact --json url,defaultBranchRef
```

Expected: `defaultBranchRef.name == "main"`.

---

**Phase A complete checkpoint:** `npm run dev` zeigt KickPact-Banner, `npm test` läuft grün (1 Test), `npm run inngest:dev` zeigt App ohne Functions, `npm run db:studio` öffnet leere DB-Verwaltung. Code ist auf GitHub gepusht.

---

## Phase B — Database Schema

Goal: Vollständiges Postgres-Schema aus Spec-Section 5, gruppiert pro Domain in separaten Files. Migrations generiert und auf Neon angewendet.

### Task 9: Schema — Auth + Clubs + Teams + Players

**Files:**
- Create: `lib/db/schema/auth.ts`, `lib/db/schema/clubs.ts`

- [ ] **Step 1: lib/db/schema/auth.ts (Better-Auth-kompatible Tabellen)**

```typescript
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: lib/db/schema/clubs.ts**

```typescript
import {
  pgTable, text, timestamp, integer, boolean, jsonb,
  uniqueIndex, index, primaryKey, pgEnum
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const memberRoleEnum = pgEnum("member_role", ["admin", "trainer", "viewer"]);

export const clubs = pgTable(
  "clubs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    ort: text("ort"),
    fussballdeVereinId: text("fussballde_verein_id").unique(),
    taxId: text("tax_id"),
    isSmallBusiness: boolean("is_small_business").notNull().default(false),
    addressJson: jsonb("address_json").$type<{
      street: string;
      zip: string;
      city: string;
      country: string;
    } | null>(),
    iban: text("iban"),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    slugIdx: uniqueIndex("clubs_slug_idx").on(t.slug)
  })
);

export const clubMemberships = pgTable(
  "club_memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.clubId] })
  })
);

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    saison: text("saison").notNull(),
    fussballdeTeamId: text("fussballde_team_id"),
    fussballdeSlug: text("fussballde_slug"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    clubSaisonIdx: index("teams_club_saison_idx").on(t.clubId, t.saison),
    fussballdeIdx: uniqueIndex("teams_fussballde_idx")
      .on(t.fussballdeTeamId, t.saison)
      .where(sql`${t.fussballdeTeamId} IS NOT NULL`)
  })
);

// Note: `sql` import needed for partial index
import { sql } from "drizzle-orm";

export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    fussballdePlayerId: text("fussballde_player_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamFussballdeIdx: uniqueIndex("players_team_fussballde_idx")
      .on(t.teamId, t.fussballdePlayerId)
      .where(sql`${t.fussballdePlayerId} IS NOT NULL`)
  })
);
```

- [ ] **Step 3: cuid2 installieren**

```bash
npm install @paralleldrive/cuid2
```

- [ ] **Step 4: Fix import order in clubs.ts**

Reorder: `import { sql } from "drizzle-orm";` muss VOR `pgTable`-Verwendung stehen.

Aktualisiere `lib/db/schema/clubs.ts`, oberster import-Block:

```typescript
import {
  pgTable, text, timestamp, integer, boolean, jsonb,
  uniqueIndex, index, primaryKey, pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";
```

Entferne den nachträglichen `import { sql } from "drizzle-orm";` weiter unten im File.

- [ ] **Step 5: lib/db/schema/index.ts erweitern**

```typescript
export * from "./auth";
export * from "./clubs";
```

- [ ] **Step 6: Verify Type-Check**

```bash
npx tsc --noEmit
```

Expected: keine Errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema/auth.ts lib/db/schema/clubs.ts lib/db/schema/index.ts \
        package.json package-lock.json
git commit -m "feat(db): add auth + clubs + teams + players schema"
```

---

### Task 10: Schema — Sponsors + Pledges + PledgeRules

**Files:**
- Create: `lib/db/schema/sponsors.ts`, `lib/db/schema/pledges.ts`

- [ ] **Step 1: lib/db/schema/sponsors.ts**

```typescript
import {
  pgTable, text, timestamp, jsonb, pgEnum, index
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const sponsorTypeEnum = pgEnum("sponsor_type", ["familie", "business"]);

export const sponsors = pgTable(
  "sponsors",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    type: sponsorTypeEnum("type").notNull(),
    businessName: text("business_name"),
    businessAddressJson: jsonb("business_address_json").$type<{
      street: string;
      zip: string;
      city: string;
      country: string;
    } | null>(),
    businessTaxId: text("business_tax_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userIdx: index("sponsors_user_idx").on(t.userId)
  })
);
```

- [ ] **Step 2: lib/db/schema/pledges.ts**

```typescript
import {
  pgTable, text, timestamp, integer, boolean, jsonb, pgEnum, index
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { sponsors } from "./sponsors";
import { teams } from "./clubs";

export const pledgeStatusEnum = pgEnum("pledge_status", ["active", "paused", "ended"]);

export const triggerTypeEnum = pgEnum("trigger_type", [
  // Auto
  "goal_total",
  "goal_by_player",
  "win",
  "loss",
  "draw",
  "clean_sheet",
  "comeback_win",
  "hattrick",
  "goal_diff_min",
  "goals_scored_min",
  // Manual
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
]);

export const pledges = pgTable(
  "pledges",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    status: pledgeStatusEnum("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    monthlyCapCents: integer("monthly_cap_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    sponsorIdx: index("pledges_sponsor_idx").on(t.sponsorId),
    teamIdx: index("pledges_team_idx").on(t.teamId)
  })
);

export const pledgeRules = pgTable(
  "pledge_rules",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    pledgeId: text("pledge_id").notNull().references(() => pledges.id, { onDelete: "cascade" }),
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    triggerParamsJson: jsonb("trigger_params_json").$type<Record<string, unknown>>().default({}),
    amountCents: integer("amount_cents").notNull(),
    perMatchCapCents: integer("per_match_cap_cents"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pledgeIdx: index("pledge_rules_pledge_idx").on(t.pledgeId)
  })
);
```

- [ ] **Step 3: Schema-Index erweitern**

`lib/db/schema/index.ts`:

```typescript
export * from "./auth";
export * from "./clubs";
export * from "./sponsors";
export * from "./pledges";
```

- [ ] **Step 4: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/db/schema/sponsors.ts lib/db/schema/pledges.ts lib/db/schema/index.ts
git commit -m "feat(db): add sponsors + pledges + pledge_rules schema"
```

---

### Task 11: Schema — Matches + MatchEvents + EventApprovals

**Files:**
- Create: `lib/db/schema/matches.ts`

- [ ] **Step 1: lib/db/schema/matches.ts**

```typescript
import {
  pgTable, text, timestamp, integer, pgEnum, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams, players } from "./clubs";
import { users } from "./auth";
import { pledgeRules } from "./pledges";

export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "live",
  "finished",
  "cancelled",
  "postponed"
]);

export const eventTypeEnum = pgEnum("event_type", [
  "tor",
  "auswechslung",
  "spezial",
  "karte"
]);

export const eventSideEnum = pgEnum("event_side", ["heim", "gast"]);

export const eventSourceEnum = pgEnum("event_source", ["scraped", "manual"]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "confirmed",
  "disputed",
  "expired"
]);

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    fussballdeSpielId: text("fussballde_spiel_id").notNull().unique(),
    datum: timestamp("datum", { withTimezone: true }).notNull(),
    heimName: text("heim_name").notNull(),
    gastName: text("gast_name").notNull(),
    ergebnisHeim: integer("ergebnis_heim"),
    ergebnisGast: integer("ergebnis_gast"),
    halbzeitHeim: integer("halbzeit_heim"),
    halbzeitGast: integer("halbzeit_gast"),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    crawledAt: timestamp("crawled_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamDatumIdx: index("matches_team_datum_idx").on(t.teamId, t.datum)
  })
);

export const matchEvents = pgTable(
  "match_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    minute: integer("minute"),
    type: eventTypeEnum("type").notNull(),
    subtype: text("subtype"),
    side: eventSideEnum("side").notNull(),
    playerName: text("player_name"),
    playerId: text("player_id").references(() => players.id, { onDelete: "set null" }),
    source: eventSourceEnum("source").notNull(),
    reportedByUserId: text("reported_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    matchIdx: index("match_events_match_idx").on(t.matchId),
    matchTypeIdx: index("match_events_match_type_idx").on(t.matchId, t.type)
  })
);

export const eventApprovals = pgTable(
  "event_approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    matchEventId: text("match_event_id")
      .notNull()
      .references(() => matchEvents.id, { onDelete: "cascade" }),
    pledgeRuleId: text("pledge_rule_id")
      .notNull()
      .references(() => pledgeRules.id, { onDelete: "cascade" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    disputeReason: text("dispute_reason"),
    reminderCount: integer("reminder_count").notNull().default(0),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pendingIdx: index("event_approvals_pending_idx").on(t.pledgeRuleId, t.status, t.expiresAt)
  })
);
```

- [ ] **Step 2: Schema-Index erweitern**

`lib/db/schema/index.ts`:

```typescript
export * from "./auth";
export * from "./clubs";
export * from "./sponsors";
export * from "./pledges";
export * from "./matches";
```

- [ ] **Step 3: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/db/schema/matches.ts lib/db/schema/index.ts
git commit -m "feat(db): add matches + match_events + event_approvals schema"
```

---

### Task 12: Schema — Charges + Invoices + Billing

**Files:**
- Create: `lib/db/schema/charges.ts`, `lib/db/schema/billing.ts`

- [ ] **Step 1: lib/db/schema/charges.ts**

```typescript
import {
  pgTable, text, timestamp, integer, pgEnum, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { pledges, pledgeRules, triggerTypeEnum } from "./pledges";
import { matches, matchEvents } from "./matches";
import { sponsors } from "./sponsors";
import { clubs } from "./clubs";

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending_approval",
  "confirmed",
  "invoiced",
  "cancelled"
]);

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid"]);

export const charges = pgTable(
  "charges",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    pledgeId: text("pledge_id").notNull().references(() => pledges.id, { onDelete: "cascade" }),
    pledgeRuleId: text("pledge_rule_id")
      .notNull()
      .references(() => pledgeRules.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    matchEventId: text("match_event_id").references(() => matchEvents.id, { onDelete: "set null" }),
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: chargeStatusEnum("status").notNull().default("confirmed"),
    invoiceId: text("invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
  },
  (t) => ({
    pledgeStatusIdx: index("charges_pledge_status_idx").on(t.pledgeId, t.status),
    // Idempotenz für event-basierte Trigger (manuelle und player-spezifische)
    uniqueEvent: uniqueIndex("charges_unique_event_idx")
      .on(t.pledgeRuleId, t.matchEventId)
      .where(sql`${t.matchEventId} IS NOT NULL`),
    // Idempotenz für match-level Trigger (sieg, clean_sheet, comeback, hattrick, ...)
    uniqueMatchTrigger: uniqueIndex("charges_unique_match_trigger_idx")
      .on(t.pledgeRuleId, t.matchId, t.triggerType)
      .where(sql`${t.matchEventId} IS NULL`)
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // YYYY-MM
    totalCents: integer("total_cents").notNull(),
    pdfUrl: text("pdf_url"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidMarkedAt: timestamp("paid_marked_at", { withTimezone: true }),
    paidMarkedBy: text("paid_marked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqueSponsorPeriod: uniqueIndex("invoices_sponsor_club_period_idx").on(
      t.sponsorId,
      t.clubId,
      t.period
    )
  })
);

export const invoiceItems = pgTable("invoice_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  chargeId: text("charge_id").notNull().references(() => charges.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull()
});
```

- [ ] **Step 2: lib/db/schema/billing.ts**

```typescript
import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { clubs, teams } from "./clubs";

export const planEnum = pgEnum("plan", ["basic", "pro"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "incomplete"
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "read_only"
]);

export const subscriptions = pgTable("subscriptions", {
  clubId: text("club_id")
    .primaryKey()
    .references(() => clubs.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const teamLicenses = pgTable(
  "team_licenses",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    subscriptionClubId: text("subscription_club_id")
      .notNull()
      .references(() => subscriptions.clubId, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }).unique(),
    plan: planEnum("plan").notNull().default("basic"),
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    status: licenseStatusEnum("status").notNull().default("trialing"),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true })
  },
  (t) => ({
    statusIdx: index("team_licenses_status_idx").on(t.status)
  })
);
```

- [ ] **Step 3: Schema-Index erweitern**

`lib/db/schema/index.ts`:

```typescript
export * from "./auth";
export * from "./clubs";
export * from "./sponsors";
export * from "./pledges";
export * from "./matches";
export * from "./charges";
export * from "./billing";
```

- [ ] **Step 4: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/db/schema/charges.ts lib/db/schema/billing.ts lib/db/schema/index.ts
git commit -m "feat(db): add charges + invoices + subscriptions + team_licenses schema"
```

---

### Task 13: Drizzle-Relations + erste Migration

**Files:**
- Create: `lib/db/relations.ts`, `drizzle/migrations/0000_*.sql`

- [ ] **Step 1: lib/db/relations.ts**

```typescript
import { relations } from "drizzle-orm";
import { users, sessions, accounts } from "./schema/auth";
import { clubs, clubMemberships, teams, players } from "./schema/clubs";
import { sponsors } from "./schema/sponsors";
import { pledges, pledgeRules } from "./schema/pledges";
import { matches, matchEvents, eventApprovals } from "./schema/matches";
import { charges, invoices, invoiceItems } from "./schema/charges";
import { subscriptions, teamLicenses } from "./schema/billing";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(clubMemberships),
  sponsorProfiles: many(sponsors)
}));

export const clubsRelations = relations(clubs, ({ many, one }) => ({
  teams: many(teams),
  memberships: many(clubMemberships),
  subscription: one(subscriptions, {
    fields: [clubs.id],
    references: [subscriptions.clubId]
  }),
  invoices: many(invoices)
}));

export const clubMembershipsRelations = relations(clubMemberships, ({ one }) => ({
  user: one(users, { fields: [clubMemberships.userId], references: [users.id] }),
  club: one(clubs, { fields: [clubMemberships.clubId], references: [clubs.id] })
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  club: one(clubs, { fields: [teams.clubId], references: [clubs.id] }),
  players: many(players),
  matches: many(matches),
  pledges: many(pledges),
  license: one(teamLicenses, { fields: [teams.id], references: [teamLicenses.teamId] })
}));

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] })
}));

export const sponsorsRelations = relations(sponsors, ({ one, many }) => ({
  user: one(users, { fields: [sponsors.userId], references: [users.id] }),
  pledges: many(pledges),
  invoices: many(invoices)
}));

export const pledgesRelations = relations(pledges, ({ one, many }) => ({
  sponsor: one(sponsors, { fields: [pledges.sponsorId], references: [sponsors.id] }),
  team: one(teams, { fields: [pledges.teamId], references: [teams.id] }),
  rules: many(pledgeRules),
  charges: many(charges)
}));

export const pledgeRulesRelations = relations(pledgeRules, ({ one, many }) => ({
  pledge: one(pledges, { fields: [pledgeRules.pledgeId], references: [pledges.id] }),
  charges: many(charges),
  approvals: many(eventApprovals)
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  team: one(teams, { fields: [matches.teamId], references: [teams.id] }),
  events: many(matchEvents),
  charges: many(charges)
}));

export const matchEventsRelations = relations(matchEvents, ({ one, many }) => ({
  match: one(matches, { fields: [matchEvents.matchId], references: [matches.id] }),
  player: one(players, { fields: [matchEvents.playerId], references: [players.id] }),
  approvals: many(eventApprovals),
  charges: many(charges)
}));

export const eventApprovalsRelations = relations(eventApprovals, ({ one }) => ({
  event: one(matchEvents, { fields: [eventApprovals.matchEventId], references: [matchEvents.id] }),
  pledgeRule: one(pledgeRules, {
    fields: [eventApprovals.pledgeRuleId],
    references: [pledgeRules.id]
  })
}));

export const chargesRelations = relations(charges, ({ one }) => ({
  pledge: one(pledges, { fields: [charges.pledgeId], references: [pledges.id] }),
  pledgeRule: one(pledgeRules, {
    fields: [charges.pledgeRuleId],
    references: [pledgeRules.id]
  }),
  match: one(matches, { fields: [charges.matchId], references: [matches.id] }),
  matchEvent: one(matchEvents, {
    fields: [charges.matchEventId],
    references: [matchEvents.id]
  }),
  invoice: one(invoices, { fields: [charges.invoiceId], references: [invoices.id] })
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  sponsor: one(sponsors, { fields: [invoices.sponsorId], references: [sponsors.id] }),
  club: one(clubs, { fields: [invoices.clubId], references: [clubs.id] }),
  items: many(invoiceItems)
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  charge: one(charges, { fields: [invoiceItems.chargeId], references: [charges.id] })
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  club: one(clubs, { fields: [subscriptions.clubId], references: [clubs.id] }),
  licenses: many(teamLicenses)
}));

export const teamLicensesRelations = relations(teamLicenses, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [teamLicenses.subscriptionClubId],
    references: [subscriptions.clubId]
  }),
  team: one(teams, { fields: [teamLicenses.teamId], references: [teams.id] })
}));
```

- [ ] **Step 2: Schema-Index erweitern um Relations**

`lib/db/schema/index.ts` ist nur fürs Schema; Relations gehen separat. Aktualisiere `lib/db/client.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relations from "./relations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const queryClient = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });
export type DB = typeof db;
```

- [ ] **Step 3: Migration generieren**

```bash
npm run db:generate
```

Expected: `drizzle/migrations/0000_<random_name>.sql` entsteht mit `CREATE TABLE` für alle Schemas + ENUMs.

- [ ] **Step 4: Migration inspizieren**

```bash
ls drizzle/migrations/
cat drizzle/migrations/0000_*.sql | head -50
```

Expected: SQL beginnt mit `CREATE TYPE` für Enums, dann `CREATE TABLE`s in topologischer Reihenfolge (users zuerst, teamLicenses zuletzt).

- [ ] **Step 5: Migration auf Neon anwenden**

```bash
npm run db:migrate
```

Expected: "Migrations applied successfully". Drizzle-Journal in `drizzle/migrations/meta/` aktualisiert.

- [ ] **Step 6: Studio-Verification**

```bash
npm run db:studio
```

Im Browser alle Tabellen sehen: `users`, `sessions`, `accounts`, `verifications`, `clubs`, `club_memberships`, `teams`, `players`, `sponsors`, `pledges`, `pledge_rules`, `matches`, `match_events`, `event_approvals`, `charges`, `invoices`, `invoice_items`, `subscriptions`, `team_licenses`.

Stoppen mit Strg-C.

- [ ] **Step 7: Commit**

```bash
git add lib/db/relations.ts lib/db/client.ts drizzle/migrations/
git commit -m "feat(db): add relations + first migration applied to Neon"
```

---

**Phase B complete checkpoint:** Alle 19 Tabellen in Neon-DB existieren, Drizzle-Studio zeigt sie, `npx tsc --noEmit` läuft fehlerfrei. Migrationen sind in `drizzle/migrations/` versioniert und gecommittet.

---

## Phase C — Trigger-Engine

Goal: Unit-getestete reine Funktion `evaluateTriggers(match, pledgeRules) → ChargeProposal[]` plus Fixture-Match-Daten. Diese Engine ist die kritischste Logik der Plattform — wenn sie falsch arbeitet, ist alles falsch.

### Task 14: Trigger-Engine — Types + Test-Fixtures

**Files:**
- Create: `lib/crawler/triggers.ts` (Stub), `tests/fixtures/matches/win-with-goals.json`, `tests/fixtures/matches/clean-sheet.json`, `tests/fixtures/matches/comeback-win.json`, `tests/fixtures/matches/hattrick.json`, `tests/fixtures/matches/draw-no-goals.json`, `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Types in lib/crawler/triggers.ts (Stub-Implementation)**

```typescript
// lib/crawler/triggers.ts

export type MatchSide = "heim" | "gast";

export interface MatchEventInput {
  id: string;
  type: "tor" | "auswechslung" | "spezial" | "karte";
  subtype?: string | null;
  minute: number | null;
  side: MatchSide;
  playerName?: string | null;
  playerId?: string | null;
  source: "scraped" | "manual";
}

export interface MatchInput {
  id: string;
  teamSide: MatchSide; // welche Seite ist die gesponserte Mannschaft
  ergebnisHeim: number;
  ergebnisGast: number;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  events: MatchEventInput[];
}

export type TriggerType =
  | "goal_total"
  | "goal_by_player"
  | "win"
  | "loss"
  | "draw"
  | "clean_sheet"
  | "comeback_win"
  | "hattrick"
  | "goal_diff_min"
  | "goals_scored_min"
  | "special_goal"
  | "yellow_card"
  | "red_card"
  | "assist"
  | "man_of_match"
  | "custom";

export interface PledgeRuleInput {
  id: string;
  pledgeId: string;
  triggerType: TriggerType;
  triggerParams: Record<string, unknown>;
  amountCents: number;
  perMatchCapCents: number | null;
}

export interface ChargeProposal {
  pledgeId: string;
  pledgeRuleId: string;
  matchId: string;
  matchEventId: string | null; // null bei match-level triggern
  triggerType: TriggerType;
  amountCents: number;
  requiresApproval: boolean; // true für manuelle Events
}

/**
 * Pure function. Gegeben ein Match + die für die gesponserte Mannschaft aktiven
 * Pledge-Rules, liefert die Liste der ChargeProposals zurück.
 * Respektiert per_match_cap pro Rule.
 * Monthly-Cap wird NICHT hier durchgesetzt (passiert downstream im evaluate-match Job
 * mit DB-Zugriff auf bisherige Charges des Monats).
 */
export function evaluateTriggers(
  match: MatchInput,
  rules: PledgeRuleInput[]
): ChargeProposal[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Fixture — win-with-goals.json**

Datei `tests/fixtures/matches/win-with-goals.json`:

```json
{
  "id": "match_win_001",
  "teamSide": "heim",
  "ergebnisHeim": 3,
  "ergebnisGast": 1,
  "halbzeitHeim": 2,
  "halbzeitGast": 0,
  "events": [
    { "id": "e1", "type": "tor", "minute": 12, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e2", "type": "tor", "minute": 27, "side": "heim", "playerName": "Maier",   "playerId": "p_maier",   "source": "scraped" },
    { "id": "e3", "type": "tor", "minute": 67, "side": "gast", "playerName": "Müller",  "playerId": "p_mueller", "source": "scraped" },
    { "id": "e4", "type": "tor", "minute": 88, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" }
  ]
}
```

- [ ] **Step 3: Fixture — clean-sheet.json**

Datei `tests/fixtures/matches/clean-sheet.json`:

```json
{
  "id": "match_cs_001",
  "teamSide": "heim",
  "ergebnisHeim": 2,
  "ergebnisGast": 0,
  "halbzeitHeim": 1,
  "halbzeitGast": 0,
  "events": [
    { "id": "e1", "type": "tor", "minute": 33, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e2", "type": "tor", "minute": 71, "side": "heim", "playerName": "Maier",   "playerId": "p_maier",   "source": "scraped" }
  ]
}
```

- [ ] **Step 4: Fixture — comeback-win.json**

Datei `tests/fixtures/matches/comeback-win.json`:

```json
{
  "id": "match_cb_001",
  "teamSide": "heim",
  "ergebnisHeim": 3,
  "ergebnisGast": 2,
  "halbzeitHeim": 0,
  "halbzeitGast": 2,
  "events": [
    { "id": "e1", "type": "tor", "minute": 8,  "side": "gast", "playerName": "Weber",   "playerId": "p_weber",   "source": "scraped" },
    { "id": "e2", "type": "tor", "minute": 22, "side": "gast", "playerName": "Becker",  "playerId": "p_becker",  "source": "scraped" },
    { "id": "e3", "type": "tor", "minute": 58, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e4", "type": "tor", "minute": 79, "side": "heim", "playerName": "Maier",   "playerId": "p_maier",   "source": "scraped" },
    { "id": "e5", "type": "tor", "minute": 91, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" }
  ]
}
```

- [ ] **Step 5: Fixture — hattrick.json**

Datei `tests/fixtures/matches/hattrick.json`:

```json
{
  "id": "match_ht_001",
  "teamSide": "heim",
  "ergebnisHeim": 4,
  "ergebnisGast": 1,
  "halbzeitHeim": 2,
  "halbzeitGast": 1,
  "events": [
    { "id": "e1", "type": "tor", "minute": 5,  "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e2", "type": "tor", "minute": 18, "side": "gast", "playerName": "Weber",   "playerId": "p_weber",   "source": "scraped" },
    { "id": "e3", "type": "tor", "minute": 42, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e4", "type": "tor", "minute": 65, "side": "heim", "playerName": "Schmidt", "playerId": "p_schmidt", "source": "scraped" },
    { "id": "e5", "type": "tor", "minute": 82, "side": "heim", "playerName": "Maier",   "playerId": "p_maier",   "source": "scraped" }
  ]
}
```

- [ ] **Step 6: Fixture — draw-no-goals.json**

Datei `tests/fixtures/matches/draw-no-goals.json`:

```json
{
  "id": "match_draw_001",
  "teamSide": "heim",
  "ergebnisHeim": 0,
  "ergebnisGast": 0,
  "halbzeitHeim": 0,
  "halbzeitGast": 0,
  "events": []
}
```

- [ ] **Step 7: Test-Skeleton mit Fixture-Loader**

Datei `tests/crawler/triggers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateTriggers, type MatchInput, type PledgeRuleInput } from "@/lib/crawler/triggers";

function loadFixture(name: string): MatchInput {
  const file = path.resolve(__dirname, "../fixtures/matches", `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function rule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "r_" + Math.random().toString(36).slice(2, 8),
    pledgeId: "p_test",
    triggerType: "goal_total",
    triggerParams: {},
    amountCents: 500,
    perMatchCapCents: null,
    ...overrides
  };
}

describe("evaluateTriggers — placeholder", () => {
  it("throws not-implemented (will be replaced as we add triggers)", () => {
    const match = loadFixture("draw-no-goals");
    expect(() => evaluateTriggers(match, [])).toThrowError("not implemented");
  });
});
```

- [ ] **Step 8: Run + verify placeholder test**

```bash
npm test
```

Expected: 2 Tests passed (sanity + placeholder).

- [ ] **Step 9: Commit**

```bash
git add lib/crawler/triggers.ts tests/fixtures/matches/ tests/crawler/triggers.test.ts
git commit -m "feat(triggers): add types, fixtures, test scaffolding"
```

---

### Task 15: Trigger — `goal_total` und `goal_by_player`

**Files:**
- Modify: `lib/crawler/triggers.ts`, `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Failing tests für goal_total + goal_by_player**

Ersetze den Inhalt von `tests/crawler/triggers.test.ts` (ohne Imports + Helpers, die bleiben) um:

```typescript
describe("evaluateTriggers — goal_total", () => {
  it("erzeugt eine Charge pro Tor der eigenen Seite", () => {
    const match = loadFixture("win-with-goals"); // 3 Tore heim, 1 Tor gast, teamSide=heim
    const r = rule({ triggerType: "goal_total", amountCents: 500 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(3);
    charges.forEach((c) => {
      expect(c.pledgeRuleId).toBe(r.id);
      expect(c.amountCents).toBe(500);
      expect(c.matchEventId).not.toBeNull();
      expect(c.triggerType).toBe("goal_total");
      expect(c.requiresApproval).toBe(false);
    });
  });

  it("respektiert per_match_cap", () => {
    const match = loadFixture("win-with-goals");
    const r = rule({ triggerType: "goal_total", amountCents: 500, perMatchCapCents: 1200 });
    const charges = evaluateTriggers(match, [r]);
    // 3 Tore × 500 = 1500, gecapped auf 1200 → entweder 2 charges à 500 + 1 à 200,
    // oder 2 charges à 500 (Rest verfällt). Wir entscheiden uns für letzteres:
    // Cap-Logik = "soviele volle Charges wie unter dem Cap passen".
    const sum = charges.reduce((acc, c) => acc + c.amountCents, 0);
    expect(sum).toBeLessThanOrEqual(1200);
    expect(charges.length).toBe(2);
  });

  it("erzeugt nichts bei 0 Toren", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "goal_total", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — goal_by_player", () => {
  it("erzeugt nur Charges für den konkreten Spieler", () => {
    const match = loadFixture("hattrick"); // Schmidt 3 Tore, Maier 1, Weber 1 gast
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 1000
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(3);
    expect(charges.every((c) => c.amountCents === 1000)).toBe(true);
  });

  it("matched per playerName wenn playerId fehlt", () => {
    const match = loadFixture("win-with-goals");
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerName: "Maier" },
      amountCents: 300
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
  });

  it("ignoriert Tore der gegnerischen Seite", () => {
    const match = loadFixture("comeback-win"); // teamSide=heim
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_weber" }, // Weber spielt im gast-Team
      amountCents: 500
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect 6 failures**

```bash
npm test
```

Expected: 6 failed tests + 1 sanity passed. Failures alle wegen "not implemented".

- [ ] **Step 3: Implementation in lib/crawler/triggers.ts**

Ersetze die `evaluateTriggers`-Funktion durch:

```typescript
export function evaluateTriggers(
  match: MatchInput,
  rules: PledgeRuleInput[]
): ChargeProposal[] {
  const proposals: ChargeProposal[] = [];

  for (const rule of rules) {
    const ruleProposals = evaluateRule(match, rule);

    // Apply per_match_cap: emit charges in order, sum up, stop emitting once full charge would exceed cap.
    let emittedSum = 0;
    for (const p of ruleProposals) {
      const wouldExceed =
        rule.perMatchCapCents !== null && emittedSum + p.amountCents > rule.perMatchCapCents;
      if (wouldExceed) break;
      proposals.push(p);
      emittedSum += p.amountCents;
    }
  }

  return proposals;
}

function evaluateRule(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  switch (rule.triggerType) {
    case "goal_total":
      return goalTotal(match, rule);
    case "goal_by_player":
      return goalByPlayer(match, rule);
    default:
      return [];
  }
}

function ownGoals(match: MatchInput): MatchEventInput[] {
  return match.events.filter((e) => e.type === "tor" && e.side === match.teamSide);
}

function goalTotal(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  return ownGoals(match).map((event) => ({
    pledgeId: rule.pledgeId,
    pledgeRuleId: rule.id,
    matchId: match.id,
    matchEventId: event.id,
    triggerType: rule.triggerType,
    amountCents: rule.amountCents,
    requiresApproval: false
  }));
}

function goalByPlayer(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  const targetId = rule.triggerParams.playerId as string | undefined;
  const targetName = rule.triggerParams.playerName as string | undefined;

  return ownGoals(match)
    .filter((e) => {
      if (targetId) return e.playerId === targetId;
      if (targetName) return e.playerName === targetName;
      return false;
    })
    .map((event) => ({
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: false
    }));
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
npm test
```

Expected: 7 passed (6 new + 1 sanity).

- [ ] **Step 5: Commit**

```bash
git add lib/crawler/triggers.ts tests/crawler/triggers.test.ts
git commit -m "feat(triggers): implement goal_total + goal_by_player with cap support"
```

---

### Task 16: Trigger — Match-Level Outcomes (`win`, `loss`, `draw`, `clean_sheet`)

**Files:**
- Modify: `lib/crawler/triggers.ts`, `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Failing tests anhängen**

Anhängen an `tests/crawler/triggers.test.ts`:

```typescript
describe("evaluateTriggers — match-level outcomes", () => {
  it("win erzeugt 1× Charge bei Sieg", () => {
    const match = loadFixture("win-with-goals"); // heim 3:1
    const r = rule({ triggerType: "win", amountCents: 1000 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
    expect(charges[0].matchEventId).toBeNull();
    expect(charges[0].amountCents).toBe(1000);
  });

  it("win erzeugt 0× Charge bei Unentschieden", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "win", amountCents: 1000 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("draw erzeugt 1× Charge bei Unentschieden", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "draw", amountCents: 200 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("loss erzeugt 1× Charge bei Niederlage (teamSide ist gast in einem heim-Sieg)", () => {
    const match = loadFixture("win-with-goals");
    match.teamSide = "gast"; // gast verliert 1:3
    const r = rule({ triggerType: "loss", amountCents: 100 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("clean_sheet erzeugt 1× Charge bei Sieg + 0 Gegentore", () => {
    const match = loadFixture("clean-sheet"); // heim 2:0
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("clean_sheet erzeugt 0× Charge wenn Gegentor", () => {
    const match = loadFixture("win-with-goals"); // heim 3:1
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("clean_sheet erzeugt 0× Charge bei Niederlage 0:1", () => {
    const match: MatchInput = {
      id: "synthetic_0_1",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 0,
      events: [
        { id: "e1", type: "tor", minute: 50, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — 7 new failures**

```bash
npm test
```

- [ ] **Step 3: Implementation in lib/crawler/triggers.ts**

Erweitere `evaluateRule`:

```typescript
function evaluateRule(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  switch (rule.triggerType) {
    case "goal_total":
      return goalTotal(match, rule);
    case "goal_by_player":
      return goalByPlayer(match, rule);
    case "win":
      return outcome(match, rule, isWin);
    case "loss":
      return outcome(match, rule, isLoss);
    case "draw":
      return outcome(match, rule, isDraw);
    case "clean_sheet":
      return outcome(match, rule, isCleanSheet);
    default:
      return [];
  }
}

function ownScore(match: MatchInput): number {
  return match.teamSide === "heim" ? match.ergebnisHeim : match.ergebnisGast;
}

function opponentScore(match: MatchInput): number {
  return match.teamSide === "heim" ? match.ergebnisGast : match.ergebnisHeim;
}

function isWin(m: MatchInput): boolean {
  return ownScore(m) > opponentScore(m);
}

function isLoss(m: MatchInput): boolean {
  return ownScore(m) < opponentScore(m);
}

function isDraw(m: MatchInput): boolean {
  return ownScore(m) === opponentScore(m);
}

function isCleanSheet(m: MatchInput): boolean {
  return isWin(m) && opponentScore(m) === 0;
}

function outcome(
  match: MatchInput,
  rule: PledgeRuleInput,
  predicate: (m: MatchInput) => boolean
): ChargeProposal[] {
  if (!predicate(match)) return [];
  return [
    {
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: null,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: false
    }
  ];
}
```

- [ ] **Step 4: Run — all passing**

```bash
npm test
```

Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/crawler/triggers.ts tests/crawler/triggers.test.ts
git commit -m "feat(triggers): implement win/loss/draw/clean_sheet"
```

---

### Task 17: Trigger — `comeback_win` und `hattrick`

**Files:**
- Modify: `lib/crawler/triggers.ts`, `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Failing tests anhängen**

```typescript
describe("evaluateTriggers — comeback_win", () => {
  it("erzeugt Charge wenn zur HZ hinten + am Ende vorne", () => {
    const match = loadFixture("comeback-win"); // HZ 0:2, FT 3:2
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
  });

  it("erzeugt 0 bei normalem Sieg ohne Halbzeitrückstand", () => {
    const match = loadFixture("win-with-goals"); // HZ 2:0
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("erzeugt 0 wenn Halbzeit-Daten fehlen", () => {
    const match: MatchInput = {
      ...loadFixture("comeback-win"),
      halbzeitHeim: null,
      halbzeitGast: null
    };
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — hattrick", () => {
  it("erzeugt 1 Charge wenn ein Spieler ≥3 Tore", () => {
    const match = loadFixture("hattrick"); // Schmidt 3 Tore
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 1 Charge auch wenn 2 Spieler je 3 Tore (Rule fires einmal pro Match)", () => {
    const match: MatchInput = {
      ...loadFixture("hattrick"),
      events: [
        ...loadFixture("hattrick").events,
        { id: "x1", type: "tor", minute: 70, side: "heim", playerName: "Maier", playerId: "p_maier", source: "scraped" },
        { id: "x2", type: "tor", minute: 85, side: "heim", playerName: "Maier", playerId: "p_maier", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn kein Spieler ≥3 Tore", () => {
    const match = loadFixture("win-with-goals"); // Schmidt 2 Tore, Maier 1
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("hattrick zählt nur Tore der eigenen Mannschaft", () => {
    const match: MatchInput = {
      id: "synthetic",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 3,
      halbzeitHeim: 0,
      halbzeitGast: 2,
      events: [
        { id: "g1", type: "tor", minute: 10, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" },
        { id: "g2", type: "tor", minute: 30, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" },
        { id: "g3", type: "tor", minute: 60, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — 7 failures**

```bash
npm test
```

- [ ] **Step 3: Implementation**

Erweitere `evaluateRule`:

```typescript
    case "comeback_win":
      return outcome(match, rule, isComebackWin);
    case "hattrick":
      return outcome(match, rule, isHattrick);
```

Add helpers:

```typescript
function ownHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitHeim : m.halbzeitGast;
}

function opponentHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitGast : m.halbzeitHeim;
}

function isComebackWin(m: MatchInput): boolean {
  if (!isWin(m)) return false;
  const ownHT = ownHalftime(m);
  const oppHT = opponentHalftime(m);
  if (ownHT === null || oppHT === null) return false;
  return ownHT < oppHT;
}

function isHattrick(m: MatchInput): boolean {
  const goalsByPlayer = new Map<string, number>();
  for (const e of m.events) {
    if (e.type !== "tor" || e.side !== m.teamSide) continue;
    const key = e.playerId ?? e.playerName ?? "unknown";
    goalsByPlayer.set(key, (goalsByPlayer.get(key) ?? 0) + 1);
  }
  for (const count of goalsByPlayer.values()) {
    if (count >= 3) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run — all passing**

```bash
npm test
```

Expected: 21 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/crawler/triggers.ts tests/crawler/triggers.test.ts
git commit -m "feat(triggers): implement comeback_win + hattrick"
```

---

### Task 18: Trigger — `goal_diff_min` und `goals_scored_min`

**Files:**
- Modify: `lib/crawler/triggers.ts`, `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Failing tests anhängen**

```typescript
describe("evaluateTriggers — goal_diff_min", () => {
  it("erzeugt Charge wenn Tordifferenz ≥ min_diff", () => {
    const match = loadFixture("clean-sheet"); // 2:0 → diff 2
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 2 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn unter min_diff", () => {
    const match = loadFixture("win-with-goals"); // 3:1 → diff 2
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 3 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("min_diff zählt absolute Differenz — auch bei Niederlage feuern? Nein, nur bei Sieg", () => {
    const match: MatchInput = { ...loadFixture("win-with-goals"), teamSide: "gast" }; // gast verliert 1:3 → diff 2
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 2 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — goals_scored_min", () => {
  it("erzeugt Charge wenn eigene Tore ≥ min_goals", () => {
    const match = loadFixture("hattrick"); // 4 Tore heim
    const r = rule({
      triggerType: "goals_scored_min",
      triggerParams: { minGoals: 4 },
      amountCents: 1200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn unter min_goals", () => {
    const match = loadFixture("win-with-goals"); // 3 Tore heim
    const r = rule({
      triggerType: "goals_scored_min",
      triggerParams: { minGoals: 5 },
      amountCents: 1200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — 5 failures**

```bash
npm test
```

- [ ] **Step 3: Implementation**

Erweitere `evaluateRule`:

```typescript
    case "goal_diff_min":
      return outcome(match, rule, (m) => {
        const minDiff = Number(rule.triggerParams.minDiff ?? 0);
        return isWin(m) && ownScore(m) - opponentScore(m) >= minDiff;
      });
    case "goals_scored_min":
      return outcome(match, rule, (m) => {
        const minGoals = Number(rule.triggerParams.minGoals ?? 0);
        return ownScore(m) >= minGoals;
      });
```

- [ ] **Step 4: Run + Commit**

```bash
npm test
git add lib/crawler/triggers.ts tests/crawler/triggers.test.ts
git commit -m "feat(triggers): implement goal_diff_min + goals_scored_min"
```

Expected: 26 passed.

---

### Task 19: Trigger — Manuelle Events (`special_goal`, `yellow_card`, `red_card`, `assist`, `man_of_match`, `custom`)

**Files:**
- Modify: `lib/crawler/triggers.ts`, `tests/crawler/triggers.test.ts`

Manuelle Trigger arbeiten direkt auf `MatchEventInput` mit `source: "manual"` und entsprechendem `type`/`subtype`. Sie erzeugen pro passendem Event eine Charge mit `requiresApproval: true`.

- [ ] **Step 1: Failing tests anhängen**

```typescript
describe("evaluateTriggers — manual triggers", () => {
  it("special_goal feuert pro manuell-gemeldetem Spezialtor (mit subtype-filter)", () => {
    const match: MatchInput = {
      id: "synthetic_special",
      teamSide: "heim",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      halbzeitHeim: 1,
      halbzeitGast: 0,
      events: [
        { id: "s1", type: "spezial", subtype: "kopfball",  minute: 12, side: "heim", playerName: "S", playerId: "p_s", source: "manual" },
        { id: "s2", type: "spezial", subtype: "hackentor", minute: 45, side: "heim", playerName: "M", playerId: "p_m", source: "manual" },
        { id: "s3", type: "spezial", subtype: "kopfball",  minute: 70, side: "heim", playerName: "S", playerId: "p_s", source: "manual" }
      ]
    };
    const r = rule({
      triggerType: "special_goal",
      triggerParams: { subtype: "kopfball" },
      amountCents: 1000
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(2);
    charges.forEach((c) => {
      expect(c.requiresApproval).toBe(true);
      expect(c.matchEventId).not.toBeNull();
    });
  });

  it("special_goal ignoriert Events der Gegenseite", () => {
    const match: MatchInput = {
      id: "syn",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 1,
      events: [
        { id: "x", type: "spezial", subtype: "kopfball", minute: 20, side: "gast", playerName: "G", playerId: "p_g", source: "manual" }
      ]
    };
    const r = rule({ triggerType: "special_goal", triggerParams: { subtype: "kopfball" }, amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("yellow_card / red_card feuern pro karte-Event mit subtype", () => {
    const match: MatchInput = {
      id: "syn",
      teamSide: "heim",
      ergebnisHeim: 1,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 0,
      events: [
        { id: "k1", type: "karte", subtype: "gelb", minute: 30, side: "heim", playerName: "A", playerId: "p_a", source: "manual" },
        { id: "k2", type: "karte", subtype: "rot",  minute: 80, side: "heim", playerName: "B", playerId: "p_b", source: "manual" }
      ]
    };
    const yellow = rule({ triggerType: "yellow_card", amountCents: 100 });
    const red = rule({ triggerType: "red_card", amountCents: 500 });
    const charges = evaluateTriggers(match, [yellow, red]);
    expect(charges.filter((c) => c.triggerType === "yellow_card")).toHaveLength(1);
    expect(charges.filter((c) => c.triggerType === "red_card")).toHaveLength(1);
    expect(charges.every((c) => c.requiresApproval)).toBe(true);
  });

  it("custom feuert pro Event mit type=spezial + matching subtype-Pattern", () => {
    const match: MatchInput = {
      id: "syn",
      teamSide: "heim",
      ergebnisHeim: 2,
      ergebnisGast: 0,
      halbzeitHeim: 1,
      halbzeitGast: 0,
      events: [
        { id: "c1", type: "spezial", subtype: "bizeps-tor", minute: 50, side: "heim", playerName: "X", playerId: "p_x", source: "manual" }
      ]
    };
    const r = rule({
      triggerType: "custom",
      triggerParams: { subtype: "bizeps-tor" },
      amountCents: 200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — 4 failures**

```bash
npm test
```

- [ ] **Step 3: Implementation**

Erweitere `evaluateRule`:

```typescript
    case "special_goal":
      return manualEvents(match, rule, "spezial", rule.triggerParams.subtype as string | undefined);
    case "yellow_card":
      return manualEvents(match, rule, "karte", "gelb");
    case "red_card":
      return manualEvents(match, rule, "karte", "rot");
    case "assist":
    case "man_of_match":
      // Werden als type='spezial' mit subtype=trigger_type gemeldet
      return manualEvents(match, rule, "spezial", rule.triggerType);
    case "custom":
      return manualEvents(match, rule, "spezial", rule.triggerParams.subtype as string | undefined);
```

Add helper:

```typescript
function manualEvents(
  match: MatchInput,
  rule: PledgeRuleInput,
  type: MatchEventInput["type"],
  subtype: string | undefined
): ChargeProposal[] {
  return match.events
    .filter(
      (e) =>
        e.source === "manual" &&
        e.side === match.teamSide &&
        e.type === type &&
        (subtype === undefined || e.subtype === subtype)
    )
    .map((event) => ({
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: true
    }));
}
```

- [ ] **Step 4: Run + Commit**

```bash
npm test
git add lib/crawler/triggers.ts tests/crawler/triggers.test.ts
git commit -m "feat(triggers): implement manual triggers (special_goal, cards, assist, mom, custom)"
```

Expected: 30 passed.

---

### Task 20: Integration-Test der Engine — mehrere Pledges parallel

**Files:**
- Modify: `tests/crawler/triggers.test.ts`

- [ ] **Step 1: Cross-Cutting Integration-Test anhängen**

```typescript
describe("evaluateTriggers — multiple pledge-rules in einem Match", () => {
  it("aggregiert Charges aus 4 unterschiedlichen Rules korrekt", () => {
    const match = loadFixture("comeback-win"); // heim 3:2, HZ 0:2; Schmidt 2 Tore, Maier 1, Weber/Becker gegnerische Tore

    const goalTotal = rule({ id: "rA", triggerType: "goal_total", amountCents: 500 });
    const winRule = rule({ id: "rB", triggerType: "win", amountCents: 1000 });
    const comeback = rule({ id: "rC", triggerType: "comeback_win", amountCents: 2000 });
    const schmidtGoals = rule({
      id: "rD",
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 300
    });

    const charges = evaluateTriggers(match, [goalTotal, winRule, comeback, schmidtGoals]);

    // 3 Tore → 3 goal_total + 1 win + 1 comeback_win + 2 goals (Schmidt) = 7 charges
    expect(charges).toHaveLength(7);

    // Sum check
    const total = charges.reduce((acc, c) => acc + c.amountCents, 0);
    expect(total).toBe(3 * 500 + 1000 + 2000 + 2 * 300);
  });

  it("zwei Rules mit unterschiedlichen Caps werden unabhängig gekappt", () => {
    const match = loadFixture("hattrick"); // 4 Tore heim, Schmidt 3
    const allGoals = rule({
      id: "rA",
      triggerType: "goal_total",
      amountCents: 500,
      perMatchCapCents: 1000 // → 2 charges
    });
    const schmidtGoals = rule({
      id: "rB",
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 400,
      perMatchCapCents: 1000 // 3 × 400 = 1200, cap 1000 → 2 charges (1200>1000) → eigentlich 2 × 400 = 800
    });
    const charges = evaluateTriggers(match, [allGoals, schmidtGoals]);
    expect(charges.filter((c) => c.pledgeRuleId === "rA")).toHaveLength(2); // 1000 cap, 2×500
    expect(charges.filter((c) => c.pledgeRuleId === "rB")).toHaveLength(2); // 2×400=800 unter 1000, 3.×400=1200 wäre über → stop bei 2
  });
});
```

- [ ] **Step 2: Run — alles soll bestehen**

```bash
npm test
```

Expected: 32 passed.

- [ ] **Step 3: Coverage-Report (optional check)**

```bash
npm test -- --coverage
```

Expected: `lib/crawler/triggers.ts` Coverage > 90%.

- [ ] **Step 4: Commit**

```bash
git add tests/crawler/triggers.test.ts
git commit -m "test(triggers): add cross-cutting integration tests for multiple rules"
```

---

**Phase C complete checkpoint:** Trigger-Engine deckt alle 16 Trigger-Types ab. >30 Unit-Tests, alle grün, Coverage >90%. Engine ist pure function — keine DB-Abhängigkeit, kann jederzeit isoliert wiederverwendet werden.

---

## Phase D — Crawler-Port (Fußball.de Playwright-Scraper)

Goal: Den bestehenden [reference/kickpact-legacy/crawler.js](../../reference/kickpact-legacy/crawler.js) als TypeScript-Modul `lib/crawler/fussballde.ts` portieren. Die alte JS-Datei bleibt als Vorlage — wir kopieren NICHT, sondern schreiben sauberen TS-Code mit typisierter Output-Struktur.

### Task 21: Playwright installieren + Crawler-Modul-Skeleton

**Files:**
- Create: `lib/crawler/fussballde.ts`

- [ ] **Step 1: Playwright Browsers installieren**

```bash
npx playwright install chromium
```

Expected: Chromium-Build wird heruntergeladen (~150 MB), keine Errors.

- [ ] **Step 2: lib/crawler/fussballde.ts mit Types + Skeleton-Funktionen**

```typescript
import { chromium, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface VereinHit {
  name: string;
  slug: string;
  vereinId: string;
  url: string;
}

export interface MannschaftHit {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
}

export interface SpielListItem {
  spielId: string;
  slug: string;
  datum: string; // DD.MM.YYYY
  heim: string;
  gast: string;
  ergebnis: string;
  vergangen: boolean;
  url: string;
}

export interface SpielDetails {
  spielId: string;
  heim: string;
  gast: string;
  ergebnis: { heim: number; gast: number };
  halbzeit: { heim: number; gast: number } | null;
  events: ScrapedEvent[];
}

export interface ScrapedEvent {
  typ: "TOR" | "AUSWECHSLUNG";
  minute: number | null;
  side: "heim" | "gast" | "unbekannt";
  spielerId?: string;
  spielerName?: string;
  rein?: { id: string; name: string };
  raus?: { id: string; name: string };
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function searchVereine(suchbegriff: string): Promise<VereinHit[]> {
  throw new Error("not implemented");
}

export async function getMannschaften(
  vereinId: string,
  slug: string
): Promise<MannschaftHit[]> {
  throw new Error("not implemented");
}

export async function getSpiele(
  teamId: string,
  slug: string,
  saison: string
): Promise<SpielListItem[]> {
  throw new Error("not implemented");
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Type-Check**

```bash
npx tsc --noEmit
```

Expected: keine Errors.

- [ ] **Step 4: Commit**

```bash
git add lib/crawler/fussballde.ts
git commit -m "feat(crawler): add playwright scraper module skeleton + types"
```

---

### Task 22: Implement `searchVereine` + `getMannschaften`

**Files:**
- Modify: `lib/crawler/fussballde.ts`
- Create: `tests/crawler/fussballde.test.ts` (skip-by-default, manual smoke tests)

- [ ] **Step 1: Implementation portieren aus [reference/kickpact-legacy/crawler.js](../../reference/kickpact-legacy/crawler.js):**

Ersetze `searchVereine` und `getMannschaften` in `lib/crawler/fussballde.ts`:

```typescript
export async function searchVereine(suchbegriff: string): Promise<VereinHit[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(suchbegriff)}/restriction/-1#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const results: VereinHit[] = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/verein/"]').forEach((link) => {
        const href = link.href || link.getAttribute("href") || "";
        const m = href.match(/\/verein\/([^/]+)\/-\/id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[2])) {
          seen.add(m[2]);
          const name = link.textContent?.replace(/\s+/g, " ").trim() || m[1];
          results.push({ name, slug: m[1], vereinId: m[2], url: href });
        }
      });
      return results;
    });
  });
}

export async function getMannschaften(
  vereinId: string,
  slug: string
): Promise<MannschaftHit[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/verein/${slug}/-/id/${vereinId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const results: MannschaftHit[] = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/mannschaft/"]').forEach((link) => {
        const href = link.href || link.getAttribute("href") || "";
        const m = href.match(/\/mannschaft\/([^/]+)\/-\/saison\/(\d+)\/team-id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[3])) {
          seen.add(m[3]);
          const name = link.textContent?.replace(/\s+/g, " ").trim() || m[1];
          results.push({
            name,
            slug: m[1],
            saison: m[2],
            teamId: m[3],
            url: href
          });
        }
      });
      return results;
    });
  });
}
```

**Note for the engineer:** Die Anonyme-Function-im-evaluate-Block läuft im Browser-Kontext, nicht in Node — die TS-Interface-Imports sind also nicht erreichbar. Drum die `: VereinHit[]`/`: MannschaftHit[]`-Annotations im `page.evaluate`-Callback sind nur als TypeScript-Hints für die Return-Inferenz erlaubt, weil Playwright die Function als String serialisiert.

Falls TS streiket, ersetzen durch:

```typescript
return await page.evaluate(() => {
  const results: Array<{ name: string; slug: string; vereinId: string; url: string }> = [];
  // ... rest
});
```

- [ ] **Step 2: Smoke-Test-Datei (skip-by-default)**

Datei `tests/crawler/fussballde.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";

// Smoke-Tests gegen live Fußball.de. Werden NICHT im normalen Lauf ausgeführt.
// Manuell starten mit: RUN_CRAWLER_SMOKE=1 npm test -- fussballde
const SHOULD_RUN = process.env.RUN_CRAWLER_SMOKE === "1";
const itSmoke = SHOULD_RUN ? it : it.skip;

describe("fussballde crawler — live smoke", () => {
  itSmoke("findet Vereine zur Suche 'Heidelberg'", async () => {
    const results = await searchVereine("Heidelberg");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      name: expect.any(String),
      slug: expect.any(String),
      vereinId: expect.stringMatching(/^[A-Z0-9]+$/),
      url: expect.stringContaining("fussball.de")
    });
  }, 60_000);

  itSmoke("findet Mannschaften eines existierenden Vereins", async () => {
    // erst einen Verein suchen, dann seine Mannschaften
    const vereine = await searchVereine("Heidelberg");
    const ersterVerein = vereine[0];
    expect(ersterVerein).toBeDefined();
    const mannschaften = await getMannschaften(ersterVerein.vereinId, ersterVerein.slug);
    expect(mannschaften.length).toBeGreaterThan(0);
  }, 90_000);
});
```

- [ ] **Step 3: Verify normal test run skips them**

```bash
npm test
```

Expected: 32 passed, 2 skipped.

- [ ] **Step 4: Manual smoke test**

```bash
RUN_CRAWLER_SMOKE=1 npm test -- fussballde
```

Expected: beide Tests grün, Output dauert 30–90s. (Falls Tests rot wegen Fußball.de-HTML-Änderung: bug-fix-loop, kein Plan-Update.)

- [ ] **Step 5: Commit**

```bash
git add lib/crawler/fussballde.ts tests/crawler/fussballde.test.ts
git commit -m "feat(crawler): implement searchVereine + getMannschaften with smoke tests"
```

---

### Task 23: Implement `getSpiele`

**Files:**
- Modify: `lib/crawler/fussballde.ts`, `tests/crawler/fussballde.test.ts`

Die `getSpiele`-Funktion ist komplex weil sie auf einem AJAX-Endpoint operiert und Datums-Header-Rows aus der Tabelle parst. Vorlage in alter [crawler.js Zeile 86–201](../../reference/kickpact-legacy/crawler.js).

- [ ] **Step 1: Implementation portieren**

Ersetze `getSpiele` in `lib/crawler/fussballde.ts`:

```typescript
export async function getSpiele(
  teamId: string,
  slug: string,
  saison: string
): Promise<SpielListItem[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const ajaxUrl = `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`;
    try {
      await page.goto(ajaxUrl, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch {
      // fallback: bleiben auf Main-Page
    }

    const raw = await page.evaluate(() => {
      const results: Array<{
        spielId: string;
        slug: string;
        datum: string;
        heim: string;
        gast: string;
        ergebnis: string;
        vergangen: boolean;
        url: string;
      }> = [];
      const seen = new Set<string>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parseDatum = (d: string): Date | null => {
        const parts = d.split(".");
        if (parts.length !== 3) return null;
        const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
        return new Date(`${year}-${parts[1]}-${parts[0]}`);
      };

      const allTrs = [...document.querySelectorAll("tr")];
      let currentDatum = "";
      allTrs.forEach((tr) => {
        if (tr.classList.contains("row-headline") || tr.classList.contains("row-competition")) {
          const txt = tr.textContent?.replace(/\s+/g, " ").trim() || "";
          const dm = txt.match(/(\d{2}\.\d{2}\.\d{4})/);
          const dm2 = txt.match(/(\d{2}\.\d{2}\.\d{2})(?!\d)/);
          if (dm) currentDatum = dm[1];
          else if (dm2) currentDatum = dm2[1];
          return;
        }

        const link = tr.querySelector<HTMLAnchorElement>('a[href*="/spiel/"]');
        if (!link) return;
        const href = link.href || "";
        const m = href.match(/\/spiel\/([^/]+)\/-\/spiel\/([A-Z0-9]+)/);
        if (!m || seen.has(m[2])) return;
        if (!currentDatum) return;

        const matchDate = parseDatum(currentDatum);
        if (!matchDate || matchDate >= today) return;
        seen.add(m[2]);

        const tds = [...tr.querySelectorAll("td")].map((td) =>
          (td.textContent || "").replace(/\s+/g, " ").trim()
        );
        const teamTds = tds.filter((t) => t && t !== ":" && t !== "Zum Spiel");

        results.push({
          spielId: m[2],
          slug: m[1],
          datum: currentDatum,
          heim: teamTds[0] || "",
          gast: teamTds[1] || "",
          ergebnis: "",
          vergangen: true,
          url: href
        });
      });

      return results;
    });

    // Sort descending
    raw.sort((a, b) => {
      const parse = (d: string): number => {
        const p = d.split(".");
        if (p.length !== 3) return 0;
        const y = p[2].length === 2 ? "20" + p[2] : p[2];
        return new Date(`${y}-${p[1]}-${p[0]}`).getTime();
      };
      return parse(b.datum) - parse(a.datum);
    });

    return raw;
  });
}
```

- [ ] **Step 2: Smoke-Test anhängen**

Anhängen an `tests/crawler/fussballde.test.ts`:

```typescript
import { getSpiele } from "@/lib/crawler/fussballde";

describe("getSpiele — live smoke", () => {
  itSmoke("liefert vergangene Spiele einer existierenden Mannschaft", async () => {
    const vereine = await searchVereine("Heidelberg");
    const v = vereine[0];
    const mannschaften = await getMannschaften(v.vereinId, v.slug);
    const m = mannschaften[0];
    const spiele = await getSpiele(m.teamId, m.slug, m.saison);
    // Mannschaften die spielen haben i.d.R. >=1 vergangenes Spiel,
    // bei Vor-Saison-Start ist 0 OK.
    expect(spiele.length).toBeGreaterThanOrEqual(0);
    if (spiele.length > 0) {
      expect(spiele[0]).toMatchObject({
        spielId: expect.stringMatching(/^[A-Z0-9]+$/),
        datum: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
        heim: expect.any(String),
        gast: expect.any(String)
      });
    }
  }, 120_000);
});
```

- [ ] **Step 3: Smoke**

```bash
RUN_CRAWLER_SMOKE=1 npm test -- fussballde
```

Expected: alle 3 Smoke-Tests grün.

- [ ] **Step 4: Commit**

```bash
git add lib/crawler/fussballde.ts tests/crawler/fussballde.test.ts
git commit -m "feat(crawler): implement getSpiele"
```

---

### Task 24: Implement `getSpielDetails`

**Files:**
- Modify: `lib/crawler/fussballde.ts`, `tests/crawler/fussballde.test.ts`

Diese Funktion ist die komplexeste — parsed `.match-course .row-event`-Rows aus der Match-Detail-Seite, extrahiert Spieler-Links und resolved Namen via Sub-Page-Lookups mit Cache. Vorlage in alter [crawler.js Zeile 237–411](../../reference/kickpact-legacy/crawler.js).

- [ ] **Step 1: Implementation**

Ersetze `getSpielDetails` in `lib/crawler/fussballde.ts`:

```typescript
const playerNameCache = new Map<string, string>();

function extractPlayerIdFromUrl(url: string): string | null {
  const m = url.match(/\/(?:player-id|userid)\/([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

async function resolvePlayerName(page: Page, playerUrl: string): Promise<string> {
  const id = extractPlayerIdFromUrl(playerUrl);
  if (!id) return playerUrl;
  if (playerNameCache.has(id)) return playerNameCache.get(id)!;

  try {
    await page.goto(playerUrl, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1000);
    const name = await page.evaluate(() => {
      const title = document.title;
      const m = title.match(/^(.+?)\s*(?:Basisprofil|Profil|\|)/i);
      if (m) return m[1].trim();
      return title.split("|")[0].trim();
    });
    playerNameCache.set(id, name || id);
    return playerNameCache.get(id)!;
  } catch {
    playerNameCache.set(id, id);
    return id;
  }
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/spiel/${slug || "spiel"}/-/spiel/${spielId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const raw = await page.evaluate(() => {
      const result = {
        heim: "",
        gast: "",
        ergebnisHeim: 0,
        ergebnisGast: 0,
        halbzeitHeim: null as number | null,
        halbzeitGast: null as number | null,
        rawEvents: [] as Array<{
          typ: "TOR" | "AUSWECHSLUNG";
          minute: number | null;
          side: "heim" | "gast" | "unbekannt";
          playerLinks: string[];
        }>,
        spielerUrls: [] as string[]
      };

      result.heim = document.querySelector(".team-home .team-name")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      result.gast = document.querySelector(".team-away .team-name")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

      const matchCourse = document.querySelector(".match-course");
      const rowEvents = matchCourse ? [...matchCourse.querySelectorAll(".row-event")] : [];
      rowEvents.forEach((row) => {
        const isRight = row.classList.contains("event-right");
        const isLeft = row.classList.contains("event-left");
        const minuteText = row.querySelector(".valign-inner")?.textContent?.replace(/\s+/g, "").replace("'", "").trim();
        const isGoal = row.querySelector(".hexagon.green") !== null;
        const isSubstitute = row.querySelector(".icon-substitute") !== null;
        const playerLinks = [...row.querySelectorAll<HTMLAnchorElement>('a[href*="spielerprofil"]')]
          .map((a) => a.href)
          .filter((h) => h.includes("/player-id/") || h.includes("/userid/"));

        const side: "heim" | "gast" | "unbekannt" = isRight ? "gast" : isLeft ? "heim" : "unbekannt";
        const minute = minuteText ? parseInt(minuteText, 10) : null;

        if ((isGoal || isSubstitute) && playerLinks.length > 0) {
          result.rawEvents.push({
            typ: isGoal ? "TOR" : "AUSWECHSLUNG",
            minute,
            side,
            playerLinks
          });
          playerLinks.forEach((u) => {
            if (!result.spielerUrls.includes(u)) result.spielerUrls.push(u);
          });
        }
      });

      const goals = result.rawEvents.filter((e) => e.typ === "TOR");
      result.ergebnisHeim = goals.filter((g) => g.side === "heim").length;
      result.ergebnisGast = goals.filter((g) => g.side === "gast").length;

      const firstHalfGoals = goals.filter((g) => g.minute !== null && g.minute <= 45);
      result.halbzeitHeim = firstHalfGoals.filter((g) => g.side === "heim").length;
      result.halbzeitGast = firstHalfGoals.filter((g) => g.side === "gast").length;

      return result;
    });

    // Resolve player names sequentially (cached)
    for (const u of raw.spielerUrls) {
      const id = extractPlayerIdFromUrl(u);
      if (!id || playerNameCache.has(id)) continue;
      await page.waitForTimeout(800);
      await resolvePlayerName(page, u);
    }

    // Build typed events
    const events: ScrapedEvent[] = raw.rawEvents.map((ev) => {
      if (ev.typ === "TOR" && ev.playerLinks[0]) {
        const id = extractPlayerIdFromUrl(ev.playerLinks[0]);
        return {
          typ: "TOR",
          minute: ev.minute,
          side: ev.side,
          spielerId: id ?? undefined,
          spielerName: id ? playerNameCache.get(id) ?? id : undefined
        };
      }
      if (ev.typ === "AUSWECHSLUNG" && ev.playerLinks.length >= 2) {
        const reinId = extractPlayerIdFromUrl(ev.playerLinks[0]);
        const rausId = extractPlayerIdFromUrl(ev.playerLinks[1]);
        return {
          typ: "AUSWECHSLUNG",
          minute: ev.minute,
          side: ev.side,
          rein: {
            id: reinId ?? "",
            name: reinId ? playerNameCache.get(reinId) ?? reinId : ""
          },
          raus: {
            id: rausId ?? "",
            name: rausId ? playerNameCache.get(rausId) ?? rausId : ""
          }
        };
      }
      return { typ: ev.typ, minute: ev.minute, side: ev.side };
    });

    events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

    return {
      spielId,
      heim: raw.heim,
      gast: raw.gast,
      ergebnis: { heim: raw.ergebnisHeim, gast: raw.ergebnisGast },
      halbzeit:
        raw.halbzeitHeim !== null && raw.halbzeitGast !== null
          ? { heim: raw.halbzeitHeim, gast: raw.halbzeitGast }
          : null,
      events
    };
  });
}
```

- [ ] **Step 2: Smoke-Test anhängen**

Anhängen an `tests/crawler/fussballde.test.ts`:

```typescript
import { getSpielDetails } from "@/lib/crawler/fussballde";

describe("getSpielDetails — live smoke", () => {
  itSmoke("liefert Match-Details (Ergebnis + Events) für ein echtes vergangenes Spiel", async () => {
    const vereine = await searchVereine("Heidelberg");
    const v = vereine[0];
    const mannschaften = await getMannschaften(v.vereinId, v.slug);
    const m = mannschaften[0];
    const spiele = await getSpiele(m.teamId, m.slug, m.saison);
    if (spiele.length === 0) return; // skip wenn Mannschaft noch nicht gespielt hat
    const first = spiele[0];
    const details = await getSpielDetails(first.spielId, first.slug);
    expect(details.spielId).toBe(first.spielId);
    expect(typeof details.ergebnis.heim).toBe("number");
    expect(typeof details.ergebnis.gast).toBe("number");
    expect(Array.isArray(details.events)).toBe(true);
  }, 180_000);
});
```

- [ ] **Step 3: Smoke**

```bash
RUN_CRAWLER_SMOKE=1 npm test -- fussballde
```

Expected: 4 Smoke-Tests grün (oder skip-mit-return wenn keine vergangenen Spiele).

- [ ] **Step 4: Commit**

```bash
git add lib/crawler/fussballde.ts tests/crawler/fussballde.test.ts
git commit -m "feat(crawler): implement getSpielDetails with player-name resolution"
```

---

**Phase D complete checkpoint:** Crawler-Modul kann gegen live Fußball.de Vereine suchen, Mannschaften, Spiele und Match-Details liefern. Alle 4 Funktionen typsicher. Smoke-Tests laufen on-demand.

---

## Phase E — Inngest Crawl-Job

Goal: Inngest-Function `crawl-matches`, die alle 6h läuft, alle aktiven Teams aus der DB lädt, ihre vergangenen Spiele scraped und neue Matches+Events idempotent persistiert. Triggert `match-evaluation`-Event pro neuem Match (dort weiterverarbeitet in Phase F).

### Task 25: DB-Helper für Crawler-Persistence

**Files:**
- Create: `lib/db/queries/crawler.ts`

- [ ] **Step 1: Crawler-Persistence-Layer**

Datei `lib/db/queries/crawler.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  matches,
  matchEvents,
  players,
  type matchStatusEnum
} from "@/lib/db/schema";
import type { SpielDetails, SpielListItem, ScrapedEvent } from "@/lib/crawler/fussballde";

export interface ActiveTeam {
  id: string;
  fussballdeTeamId: string;
  fussballdeSlug: string;
  saison: string;
}

export async function getActiveTeams(): Promise<ActiveTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
      saison: teams.saison,
      isActive: teams.isActive
    })
    .from(teams)
    .where(eq(teams.isActive, true));
  return rows
    .filter((r) => r.fussballdeTeamId && r.fussballdeSlug)
    .map((r) => ({
      id: r.id,
      fussballdeTeamId: r.fussballdeTeamId!,
      fussballdeSlug: r.fussballdeSlug!,
      saison: r.saison
    }));
}

export async function findMatchByFussballdeId(
  fussballdeSpielId: string
): Promise<{ id: string } | null> {
  const [m] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.fussballdeSpielId, fussballdeSpielId))
    .limit(1);
  return m ?? null;
}

function parseDateDdMmYyyy(s: string): Date {
  const [dd, mm, yyyy] = s.split(".");
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
}

export async function insertMatchWithEvents(args: {
  teamId: string;
  listItem: SpielListItem;
  details: SpielDetails;
}): Promise<{ matchId: string; newEventCount: number }> {
  const { teamId, listItem, details } = args;

  // Insert match
  const [matchRow] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: details.spielId,
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
      ergebnisHeim: details.ergebnis.heim,
      ergebnisGast: details.ergebnis.gast,
      halbzeitHeim: details.halbzeit?.heim ?? null,
      halbzeitGast: details.halbzeit?.gast ?? null,
      status: "finished"
    })
    .returning({ id: matches.id });

  if (!matchRow) throw new Error("insertMatch failed");

  // Persist players + events
  let newEventCount = 0;
  for (const ev of details.events) {
    if (ev.typ === "TOR" && ev.spielerId) {
      const playerId = await upsertPlayer(teamId, ev.spielerId, ev.spielerName ?? ev.spielerId);
      await db.insert(matchEvents).values({
        matchId: matchRow.id,
        minute: ev.minute,
        type: "tor",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.spielerName,
        playerId,
        source: "scraped"
      });
      newEventCount++;
    } else if (ev.typ === "AUSWECHSLUNG" && ev.rein && ev.raus) {
      const reinId = await upsertPlayer(teamId, ev.rein.id, ev.rein.name);
      await db.insert(matchEvents).values({
        matchId: matchRow.id,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "ein",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.rein.name,
        playerId: reinId,
        source: "scraped"
      });
      const rausId = await upsertPlayer(teamId, ev.raus.id, ev.raus.name);
      await db.insert(matchEvents).values({
        matchId: matchRow.id,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "aus",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.raus.name,
        playerId: rausId,
        source: "scraped"
      });
      newEventCount += 2;
    }
  }

  return { matchId: matchRow.id, newEventCount };
}

async function upsertPlayer(teamId: string, fussballdeId: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.fussballdePlayerId, fussballdeId)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(players)
    .values({ teamId, fussballdePlayerId: fussballdeId, name })
    .returning({ id: players.id });
  return created.id;
}
```

- [ ] **Step 2: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/db/queries/crawler.ts
git commit -m "feat(db): add crawler persistence helpers"
```

---

### Task 26: Inngest `crawl-matches` Function

**Files:**
- Create: `lib/inngest/functions/crawl-matches.ts`
- Modify: `lib/inngest/functions/index.ts`

- [ ] **Step 1: crawl-matches Function**

Datei `lib/inngest/functions/crawl-matches.ts`:

```typescript
import { inngest } from "@/lib/inngest/client";
import { getSpiele, getSpielDetails } from "@/lib/crawler/fussballde";
import {
  getActiveTeams,
  findMatchByFussballdeId,
  insertMatchWithEvents
} from "@/lib/db/queries/crawler";

export const crawlMatches = inngest.createFunction(
  { id: "crawl-matches", concurrency: { limit: 2 } },
  [{ cron: "0 */6 * * *" }, { event: "crawler/manual" }],
  async ({ step, logger }) => {
    const teams = await step.run("load-active-teams", () => getActiveTeams());
    logger.info(`crawl-matches: ${teams.length} aktive Teams`);

    let totalNewMatches = 0;
    for (const team of teams) {
      const spiele = await step.run(`get-spiele-${team.id}`, () =>
        getSpiele(team.fussballdeTeamId, team.fussballdeSlug, team.saison)
      );

      for (const spiel of spiele) {
        const exists = await step.run(`check-${spiel.spielId}`, () =>
          findMatchByFussballdeId(spiel.spielId)
        );
        if (exists) continue;

        const details = await step.run(`details-${spiel.spielId}`, () =>
          getSpielDetails(spiel.spielId, spiel.slug)
        );

        const { matchId } = await step.run(`persist-${spiel.spielId}`, () =>
          insertMatchWithEvents({ teamId: team.id, listItem: spiel, details })
        );

        await step.sendEvent("emit-match-finished", {
          name: "match/finished",
          data: { matchId, teamId: team.id }
        });

        totalNewMatches++;
      }
    }

    return { newMatches: totalNewMatches };
  }
);
```

- [ ] **Step 2: Function-Registry erweitern**

`lib/inngest/functions/index.ts`:

```typescript
import { crawlMatches } from "./crawl-matches";

export const functions = [crawlMatches];
```

- [ ] **Step 3: Type-Check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manueller Smoketest (mit DB-Setup)**

Manueller Schritt — erstmal eine Test-Team-Row in DB anlegen:

```bash
npm run db:studio
# In Studio: clubs-Tabelle, INSERT eine Test-Row mit:
#   id=clubtest, slug=fc-test, name="FC Test", fussballde_verein_id=NULL
# teams-Tabelle, INSERT eine Test-Row mit:
#   club_id=clubtest, name="1. Herren", saison=2526,
#   fussballde_team_id=<echte-team-id-aus-fussball.de>,
#   fussballde_slug=<echter-slug>, is_active=true
# Stoppen mit Strg-C
```

Tipp: Echten Team-ID/Slug via Crawler:

```bash
node --experimental-vm-modules -e '
import("./lib/crawler/fussballde.ts").then(async (m) => {
  const v = await m.searchVereine("FC Heidelberg");
  console.log(v[0]);
  const mm = await m.getMannschaften(v[0].vereinId, v[0].slug);
  console.log(mm[0]);
});'
```

Dann:

```bash
# Terminal A
npm run dev

# Terminal B
npm run inngest:dev
```

Im Inngest-Dev-UI (http://localhost:8288) den `crawl-matches`-Job manuell triggern mit Event-Name `crawler/manual`. Beobachten: Steps laufen durch, am Ende sind in der DB neue `matches`- und `match_events`-Rows.

- [ ] **Step 5: Commit**

```bash
git add lib/inngest/functions/
git commit -m "feat(inngest): add crawl-matches function with 6h schedule"
```

---

**Phase E complete checkpoint:** `crawl-matches` läuft erfolgreich gegen eine echte Mannschaft, persistiert idempotent Spiele + Events, emittiert `match/finished`-Events für die nächste Phase. Inngest-Dev-UI zeigt Step-Trace.

---

## Phase F — Evaluate-Match Pipeline + Integration-Test

Goal: Inngest-Function `evaluate-match`, die auf `match/finished` reagiert, Pledge-Rules für das betroffene Team lädt, die Trigger-Engine aus Phase C ruft und ChargeProposals als `charges`-Rows persistiert (idempotent, mit Cap-Respektierung auf Monats-Ebene). End-to-End-Pipeline-Test verifiziert: Fixture-Pledge in DB + Crawler-Match in DB → korrekte Charges in DB.

### Task 27: Pledge-Loader für Evaluation

**Files:**
- Create: `lib/db/queries/evaluation.ts`

- [ ] **Step 1: Pledge-Rule-Loader**

Datei `lib/db/queries/evaluation.ts`:

```typescript
import { and, eq, gte, lte, sum, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pledges,
  pledgeRules,
  matches,
  charges,
  type PledgeRuleInput
} from "@/lib/db/schema";
import type { PledgeRuleInput as EnginePledgeRule } from "@/lib/crawler/triggers";

export async function loadActivePledgeRulesForTeam(
  teamId: string,
  asOf: Date
): Promise<EnginePledgeRule[]> {
  const rows = await db
    .select({
      ruleId: pledgeRules.id,
      pledgeId: pledgeRules.pledgeId,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.status, "active"),
        lte(pledges.startsAt, asOf),
        gte(pledges.endsAt, asOf)
      )
    );

  return rows.map((r) => ({
    id: r.ruleId,
    pledgeId: r.pledgeId,
    triggerType: r.triggerType,
    triggerParams: (r.triggerParams ?? {}) as Record<string, unknown>,
    amountCents: r.amountCents,
    perMatchCapCents: r.perMatchCapCents
  }));
}

export async function getMatch(matchId: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  return m ?? null;
}

/**
 * Liefert die Summe aller `confirmed` + `pending_approval` Charges
 * für einen Pledge im laufenden Monat (basierend auf asOf).
 */
export async function getMonthlyChargedCents(pledgeId: string, asOf: Date): Promise<number> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeId, pledgeId),
        gte(charges.createdAt, monthStart),
        sql`${charges.createdAt} < ${monthEnd}`,
        sql`${charges.status} IN ('confirmed', 'pending_approval', 'invoiced')`
      )
    );
  return row?.total ?? 0;
}

export async function getPledgeMonthlyCap(pledgeId: string): Promise<number | null> {
  const [p] = await db
    .select({ cap: pledges.monthlyCapCents })
    .from(pledges)
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  return p?.cap ?? null;
}
```

- [ ] **Step 2: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/db/queries/evaluation.ts
git commit -m "feat(db): add evaluation query helpers (pledge-rule-loader, monthly-cap)"
```

---

### Task 28: Inngest `evaluate-match` Function

**Files:**
- Create: `lib/inngest/functions/evaluate-match.ts`
- Modify: `lib/inngest/functions/index.ts`

Die Function:
1. Lädt Match + alle MatchEvents aus DB
2. Bestimmt `teamSide` (welche Seite ist `match.teamId`?) — derived aus matching der Heim/Gast-Namen zur Team-Name aus DB
3. Baut `MatchInput` für die Trigger-Engine
4. Lädt aktive Pledge-Rules für das Team
5. Ruft `evaluateTriggers()` aus Phase C
6. Persistiert Proposals als `charges`-Rows mit Monthly-Cap-Check
7. Idempotent durch UNIQUE-Constraints aus Phase B

- [ ] **Step 1: Implementation**

Datei `lib/inngest/functions/evaluate-match.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, charges } from "@/lib/db/schema";
import { evaluateTriggers, type MatchInput, type ChargeProposal } from "@/lib/crawler/triggers";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents,
  getPledgeMonthlyCap
} from "@/lib/db/queries/evaluation";

export const evaluateMatch = inngest.createFunction(
  { id: "evaluate-match", concurrency: { limit: 4 } },
  { event: "match/finished" },
  async ({ event, step, logger }) => {
    const { matchId, teamId } = event.data as { matchId: string; teamId: string };

    const matchData = await step.run("load-match", async () => {
      const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
      if (!m) throw new Error(`match ${matchId} not found`);
      const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
      const [t] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!t) throw new Error(`team ${teamId} not found`);
      return { m, events, t };
    });

    // Determine teamSide via name-matching
    const teamName = matchData.t.name.toLowerCase();
    const heimMatch = matchData.m.heimName.toLowerCase().includes(teamName.split(" ")[0]);
    const teamSide: "heim" | "gast" = heimMatch ? "heim" : "gast";

    const input: MatchInput = {
      id: matchData.m.id,
      teamSide,
      ergebnisHeim: matchData.m.ergebnisHeim ?? 0,
      ergebnisGast: matchData.m.ergebnisGast ?? 0,
      halbzeitHeim: matchData.m.halbzeitHeim,
      halbzeitGast: matchData.m.halbzeitGast,
      events: matchData.events.map((e) => ({
        id: e.id,
        type: e.type,
        subtype: e.subtype,
        minute: e.minute,
        side: e.side,
        playerName: e.playerName,
        playerId: e.playerId,
        source: e.source
      }))
    };

    const rules = await step.run("load-rules", () =>
      loadActivePledgeRulesForTeam(teamId, matchData.m.datum)
    );
    logger.info(`evaluate-match ${matchId}: ${rules.length} active rules`);

    const proposals = evaluateTriggers(input, rules);

    let inserted = 0;
    let cappedOut = 0;
    for (const p of proposals) {
      const wasInserted = await step.run(`insert-charge-${p.pledgeRuleId}-${p.matchEventId ?? "match"}`, async () => {
        // Monthly-cap check: charged so far this month + p.amount > pledge.monthlyCap?
        const cap = await getPledgeMonthlyCap(p.pledgeId);
        if (cap !== null) {
          const alreadyCharged = await getMonthlyChargedCents(p.pledgeId, matchData.m.datum);
          if (alreadyCharged + p.amountCents > cap) return false;
        }

        try {
          await db.insert(charges).values({
            pledgeId: p.pledgeId,
            pledgeRuleId: p.pledgeRuleId,
            matchId: p.matchId,
            matchEventId: p.matchEventId,
            triggerType: p.triggerType,
            amountCents: p.amountCents,
            status: p.requiresApproval ? "pending_approval" : "confirmed",
            confirmedAt: p.requiresApproval ? null : new Date()
          });
          return true;
        } catch (err) {
          // UNIQUE-violation → already-evaluated; idempotent skip
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("unique") || msg.includes("duplicate")) return false;
          throw err;
        }
      });
      if (wasInserted) inserted++;
      else cappedOut++;
    }

    return { proposals: proposals.length, inserted, cappedOrSkipped: cappedOut };
  }
);
```

- [ ] **Step 2: Registry erweitern**

`lib/inngest/functions/index.ts`:

```typescript
import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";

export const functions = [crawlMatches, evaluateMatch];
```

- [ ] **Step 3: Type-Check + Commit**

```bash
npx tsc --noEmit
git add lib/inngest/functions/
git commit -m "feat(inngest): add evaluate-match function with monthly-cap enforcement"
```

---

### Task 29: End-to-End Integration-Test (synthetisches Match → Charges in DB)

**Files:**
- Create: `tests/inngest/evaluate-match.test.ts`

Dieser Test ist **kein** UI-Test und **kein** live-fußball.de-Test — er prüft die DB-gestützte Pipeline mit synthetischen Daten. Erfordert Test-DB-Setup.

- [ ] **Step 1: Test-DB-Strategie wählen + Setup-Helper**

Wir nutzen die Neon-`dev`-Branch als Test-DB (vorausgesetzt manueller Branch-Setup). Alternativ: lokaler Postgres-Container.

Datei `tests/setup/db.ts`:

```typescript
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  subscriptions,
  teamLicenses
} from "@/lib/db/schema";

export async function resetTestDb() {
  // Cascade-Deletes; Reihenfolge respektiert FK
  await db.delete(charges);
  await db.delete(matchEvents);
  await db.delete(matches);
  await db.delete(pledgeRules);
  await db.delete(pledges);
  await db.delete(sponsors);
  await db.delete(teamLicenses);
  await db.delete(subscriptions);
  await db.delete(clubMemberships);
  await db.delete(teams);
  await db.delete(clubs);
  await db.delete(users);
}
```

- [ ] **Step 2: Test-File**

Datei `tests/inngest/evaluate-match.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { evaluateTriggers } from "@/lib/crawler/triggers";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";
import { eq } from "drizzle-orm";

const SHOULD_RUN = process.env.RUN_DB_INTEGRATION === "1";
const itDb = SHOULD_RUN ? it : it.skip;

describe("evaluate-match — end-to-end pipeline", () => {
  beforeEach(async () => {
    if (!SHOULD_RUN) return;
    await resetTestDb();
  });

  itDb("3 Tore + 1 Sieg-Pledge → 4 charges in DB", async () => {
    // Setup user, club, team
    const [u] = await db
      .insert(users)
      .values({ id: "u_test1", email: "test1@example.com" })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ id: "c_test1", slug: "test-fc", name: "Test FC" })
      .returning();
    const [t] = await db
      .insert(teams)
      .values({
        clubId: c.id,
        name: "1. Herren",
        saison: "2526",
        fussballdeTeamId: "TEAM_X",
        fussballdeSlug: "test-fc-1",
        isActive: true
      })
      .returning();

    // Sponsor + Pledge
    const [s] = await db
      .insert(sponsors)
      .values({
        userId: u.id,
        displayName: "Tante Erna",
        type: "familie"
      })
      .returning();
    const [p] = await db
      .insert(pledges)
      .values({
        sponsorId: s.id,
        teamId: t.id,
        status: "active",
        startsAt: new Date("2026-01-01"),
        endsAt: new Date("2026-12-31"),
        monthlyCapCents: null
      })
      .returning();
    await db.insert(pledgeRules).values([
      {
        pledgeId: p.id,
        triggerType: "goal_total",
        triggerParamsJson: {},
        amountCents: 500,
        requiresApproval: false
      },
      {
        pledgeId: p.id,
        triggerType: "win",
        triggerParamsJson: {},
        amountCents: 1000,
        requiresApproval: false
      }
    ]);

    // Match: 1. Herren spielt heim 3:1
    const matchDate = new Date("2026-05-10T15:00:00Z");
    const [m] = await db
      .insert(matches)
      .values({
        teamId: t.id,
        fussballdeSpielId: "SPIEL_X",
        datum: matchDate,
        heimName: "1. Herren",
        gastName: "FC Gegner",
        ergebnisHeim: 3,
        ergebnisGast: 1,
        halbzeitHeim: 2,
        halbzeitGast: 0,
        status: "finished"
      })
      .returning();

    // Tore-Events
    await db.insert(matchEvents).values([
      { matchId: m.id, type: "tor", minute: 12, side: "heim", playerName: "S", source: "scraped" },
      { matchId: m.id, type: "tor", minute: 33, side: "heim", playerName: "M", source: "scraped" },
      { matchId: m.id, type: "tor", minute: 60, side: "gast", playerName: "G", source: "scraped" },
      { matchId: m.id, type: "tor", minute: 87, side: "heim", playerName: "S", source: "scraped" }
    ]);

    // Manuelle Pipeline-Simulation (statt Inngest aufzurufen):
    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id));
    const rules = await loadActivePledgeRulesForTeam(t.id, matchDate);
    expect(rules).toHaveLength(2);

    const proposals = evaluateTriggers(
      {
        id: m.id,
        teamSide: "heim",
        ergebnisHeim: 3,
        ergebnisGast: 1,
        halbzeitHeim: 2,
        halbzeitGast: 0,
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          subtype: e.subtype,
          minute: e.minute,
          side: e.side,
          playerName: e.playerName,
          playerId: e.playerId,
          source: e.source
        }))
      },
      rules
    );

    // 3 Tore + 1 Sieg = 4 Charges
    expect(proposals).toHaveLength(4);

    // Persistiere
    for (const prop of proposals) {
      await db.insert(charges).values({
        pledgeId: prop.pledgeId,
        pledgeRuleId: prop.pledgeRuleId,
        matchId: prop.matchId,
        matchEventId: prop.matchEventId,
        triggerType: prop.triggerType,
        amountCents: prop.amountCents,
        status: "confirmed",
        confirmedAt: new Date()
      });
    }

    const chargeRows = await db.select().from(charges);
    expect(chargeRows).toHaveLength(4);
    const total = chargeRows.reduce((a, c) => a + c.amountCents, 0);
    expect(total).toBe(3 * 500 + 1000);
  }, 30_000);

  itDb("Idempotenz: zweimaliger Eval-Lauf erzeugt nicht doppelt Charges", async () => {
    // (gleiche Setup wie oben, dann 2x dieselben Proposals inserten)
    // Erwarteter Effekt: 2. Insert wirft auf UNIQUE-Constraint, wird vom evaluate-match
    // gefangen, Charges bleiben bei 4.
    // Detail-Setup analog zum vorigen Test; hier nur Assertion-Stub.
    expect(true).toBe(true); // Placeholder — Engineer implementiert analog zur 1. Test
  });
});
```

- [ ] **Step 3: Test-Run (skip ohne Env)**

```bash
npm test
```

Expected: 32 unit-tests passed + 2 skipped (DB-integration).

- [ ] **Step 4: Test-Run mit DB**

Manueller Schritt: Neon-Test-Branch in `.env.local` setzen (oder Test-Branch `DATABASE_URL` via separates env-File).

```bash
RUN_DB_INTEGRATION=1 npm test -- evaluate-match
```

Expected: 1 Test grün (placeholder-Test im 2. Block überspringt fürs erste).

- [ ] **Step 5: 2. Idempotenz-Test richtig implementieren**

Ersetze den Placeholder im 2. `itDb` mit einer vollen Wiederholung des Setup-Blocks + zweimaligem Insert in einer Schleife mit try/catch auf UNIQUE-Violations. Code-Skizze:

```typescript
  itDb("Idempotenz: zweimaliger Eval-Lauf erzeugt nicht doppelt Charges", async () => {
    // [Setup wie im 1. Test — copy-paste, ohne Helper-Funktion]
    // [Insert charges aus proposals]
    // 2. Run:
    let collisions = 0;
    for (const prop of proposals) {
      try {
        await db.insert(charges).values({
          pledgeId: prop.pledgeId,
          pledgeRuleId: prop.pledgeRuleId,
          matchId: prop.matchId,
          matchEventId: prop.matchEventId,
          triggerType: prop.triggerType,
          amountCents: prop.amountCents,
          status: "confirmed",
          confirmedAt: new Date()
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("unique") || msg.includes("duplicate")) collisions++;
        else throw e;
      }
    }
    expect(collisions).toBe(4); // alle 4 Proposals waren bereits vorhanden
    const chargeRows = await db.select().from(charges);
    expect(chargeRows).toHaveLength(4); // immer noch 4, nicht 8
  }, 30_000);
```

- [ ] **Step 6: Re-Run mit DB**

```bash
RUN_DB_INTEGRATION=1 npm test -- evaluate-match
```

Expected: beide DB-Tests grün.

- [ ] **Step 7: Commit**

```bash
git add tests/setup/db.ts tests/inngest/evaluate-match.test.ts
git commit -m "test(pipeline): add end-to-end integration test (engine + DB persistence + idempotency)"
```

---

**Phase F complete checkpoint:** Komplette Pipeline (Crawler → DB → Trigger-Engine → Charges) durch Integration-Test verifiziert. Cap-Logik (per_match + monthly) im Evaluate-Job durchgesetzt. Idempotenz über UNIQUE-Constraints abgedeckt.

---

## Plan Self-Review

**1. Spec coverage:**

- ✅ Section 3 Stack — Phase A Tasks 2–6 deckt Next.js, Tailwind, Drizzle, Inngest, Vitest.
- ✅ Section 4 Architektur — Phase A + B + E baut die genau dort beschriebenen Komponenten.
- ✅ Section 5 Datenmodell — Phase B Tasks 9–13 deckt alle 19 Tabellen + Relations + Constraints.
- ✅ Section 5.3 Trigger-Type-Katalog — Phase C deckt alle 16 Types (Auto + Manuell).
- ✅ Section 5.4 Approval-Lifecycle — die Charge-Status `pending_approval` ist gesetzt in Phase F Task 28; vollständige Approval-UI + Reminder-Cron sind in Plan 3.
- ✅ Section 6.4 Spiel-Auswertung — Phase E + F.
- ✅ Section 11 Migrationspfad — alter Code wandert in Task 1 nach `reference/kickpact-legacy/`.
- ❌ Sections 6.1–6.3, 6.5–6.9 (UI-Flows, Manual-Event-Editor, Approval, Invoicing, Stripe, Saison-Ende) — **bewusst nicht in diesem Plan**, sind Inhalt von Plan 2, 3, 4, 5.
- ❌ Section 7 Auth — Better-Auth-**Schema**-Tabellen sind in Phase B; Wire-Up + Magic Link + Google OAuth ist Plan 2.
- ❌ Section 8 UI/UX — komplett Plan 6.

Gap-Check OK: Plan 1 ist explicit "Foundation + Engine validated", alle anderen Spec-Sections sind in den späteren Plans 2–6 zugewiesen.

**2. Placeholder scan:**

- Task 22 Step 1 hat eine "Note for the engineer" mit Fallback-Anweisung — kein TBD, sondern explizite Engineer-Anleitung.
- Task 29 Step 5 sagt "implementiere analog zur 1. Test" mit Code-Skizze und konkretem Behavior-Test. Das ist genug Detail.
- Keine "TODO", "TBD", "implement later" Strings im Plan.

**3. Type-Konsistenz:**

- `MatchInput`, `PledgeRuleInput`, `ChargeProposal` in Phase C definiert, identisch in Phase F verwendet.
- `MatchEventInput.type` Enum (`tor` | `auswechslung` | `spezial` | `karte`) konsistent zwischen `lib/db/schema/matches.ts` (Phase B Task 11) und `lib/crawler/triggers.ts` (Phase C Task 14).
- `triggerTypeEnum` in `lib/db/schema/pledges.ts` (Phase B Task 10) und `TriggerType` in `lib/crawler/triggers.ts` enthalten exakt dieselbe Liste.
- `ScrapedEvent.typ` ist `"TOR" | "AUSWECHSLUNG"` (Phase D Task 21), wird in Phase E Task 25 in lowercase `"tor"` | `"auswechslung"` (DB-Enum) gemappt — Konsistenz gewahrt durch explizite Mapping in `insertMatchWithEvents`.

Keine Type-Inkonsistenzen gefunden.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-05-19-kickpact-foundation.md](./2026-05-19-kickpact-foundation.md). Zwei Execution-Optionen:

**1. Subagent-Driven (recommended)** — pro Task ein frischer Subagent, Review zwischen Tasks, schnelle Iteration

**2. Inline Execution** — Tasks im aktuellen Chat-Session ausführen, Batch-Mode mit Checkpoints

Welcher Approach? (Empfehlung: Subagent-Driven, weil Plan 1 ~30 Tasks hat und der Hauptthread sonst sehr lang wird.)

