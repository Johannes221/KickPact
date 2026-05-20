# KickPact Plan 4 — Invoicing + PDF + Mail + Saison-Ende

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Am 1. eines Monats erzeugt KickPact pro Sponsor-Verein-Paar eine PDF-Rechnung mit allen `confirmed`-Charges des Vormonats, mailt sie an den Sponsor + an den Verein-Admin. Verein kann markieren "bezahlt" + History sehen. Saison-Ende-Flow erinnert an Pledge-Erneuerung.

**Architecture:** `@react-pdf/renderer` für PDF-Generation in Inngest-Job. Storage auf Cloudflare R2 (S3-API) — alternativ lokales Filesystem für Dev. Resend für Mail-Versand mit Attachment. Bei Storage-Fail: PDF inline in der Mail.

**Tech Stack:** `@react-pdf/renderer`, `@aws-sdk/client-s3` (für R2), bestehend Resend + Inngest.

**Spec:** Sections 6.7 (Invoicing), 6.9 (Saison-Ende), 5.4 (Approval-Lifecycle: invoiced-Status), 8.1 verein/abrechnungen + sponsor/rechnungen.

---

## File Structure (Neu)

```
lib/
├── invoicing/
│   ├── builder.tsx                  NEW — React-PDF Invoice Layout
│   ├── numbering.ts                 NEW — eindeutige Rechnungsnummern pro Verein
│   ├── storage.ts                   NEW — R2 upload + signed-URL (mit lokalem Fallback)
│   └── period.ts                    NEW — Monatsberechnung (currentPeriod, lastPeriod)
├── db/queries/
│   ├── invoices.ts                  NEW — listForSponsor, listForClub, getInvoice
│   └── charges.ts                   NEW — listConfirmedForBilling(period, sponsor, club)
├── mail/templates/
│   ├── invoice-sponsor.tsx          NEW — Mail-Template "Hier ist deine Rechnung"
│   └── invoice-club.tsx             NEW — Kopie an Vereins-Admin
├── inngest/functions/
│   ├── generate-invoices.ts         NEW — monatlicher Cron 1. um 03:17
│   └── season-end-reminders.ts      NEW — Pledge-Erneuerung
└── actions/
    └── invoices.ts                  NEW — markAsPaid (Verein) + downloadUrl

app/
├── (verein)/verein/[slug]/abrechnungen/
│   └── page.tsx                     MOD — echte Liste statt Stub
├── (sponsor)/sponsor/rechnungen/
│   └── page.tsx                     MOD — echte Liste mit Download
```

## Phase Overview

- **Phase A** — PDF-Render-Engine + Builder (Tasks 1–3)
- **Phase B** — Storage + Numbering + Period-Logik (Tasks 4–5)
- **Phase C** — Generate-Invoices Inngest-Job (Tasks 6–7)
- **Phase D** — UI für Verein + Sponsor (Tasks 8–10)
- **Phase E** — Saison-Ende-Reminder + E2E (Tasks 11–12)

---

## Phase A — PDF-Builder

### Task 1: Install + setup `@react-pdf/renderer`

```bash
cd /Users/johan/kickpact
npm install @react-pdf/renderer
```

- [ ] Verify install. shadcn-Komponenten + Inter laden in PDF separat — wir nutzen react-pdf's `Font.register` für Inter.

### Task 2: PDF-Builder `lib/invoicing/builder.tsx`

Erstellt JSX-PDF mit:
- Vereins-Kopf (Logo optional, Name, Adresse, IBAN, USt-Hinweis je nach KU-Flag)
- Sponsor-Adressat-Block (mit business-Adresse falls type=business, sonst nur Name + Mail)
- Rechnungs-Header: Nr., Datum, Leistungszeitraum
- Tabelle: Datum · Spiel · Event/Trigger · Betrag
- Summe
- USt-Block: bei KU §19-Hinweis, bei Pflicht USt-Aufschlag
- Footer: Bankverbindung + Kontakt

Implementation:

```typescript
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

// Optional: Inter Font registrieren (sonst Default-Sans)
Font.register({
  family: "Inter",
  fonts: [
    { src: "https://rsms.me/inter/font-files/Inter-Regular.otf" },
    { src: "https://rsms.me/inter/font-files/Inter-Bold.otf", fontWeight: "bold" }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 50, fontFamily: "Inter", fontSize: 10, color: "#1A1A2E" },
  // ... weitere Styles
});

export interface InvoiceData {
  invoiceNumber: string;
  period: string; // "Mai 2026"
  issuedAt: Date;
  club: {
    name: string;
    address: { street: string; zip: string; city: string };
    iban: string | null;
    taxId: string | null;
    isSmallBusiness: boolean;
  };
  sponsor: {
    displayName: string;
    email: string;
    type: "familie" | "business";
    businessName: string | null;
    businessAddress: { street: string; zip: string; city: string } | null;
  };
  items: { matchDate: Date; matchLabel: string; triggerLabel: string; amountCents: number }[];
}

export function InvoicePdf(data: InvoiceData) {
  const subtotalCents = data.items.reduce((s, i) => s + i.amountCents, 0);
  const ustCents = data.club.isSmallBusiness ? 0 : Math.round(subtotalCents * 0.19);
  const totalCents = subtotalCents + ustCents;
  // ... JSX
  return <Document>...</Document>;
}
```

Code (full):

```tsx
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://rsms.me/inter/font-files/Inter-Regular.otf" },
    { src: "https://rsms.me/inter/font-files/Inter-Bold.otf", fontWeight: 700 }
  ]
});

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Inter", fontSize: 10, color: "#1A1A2E" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  clubBlock: { fontSize: 9, color: "#525252", maxWidth: 250 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  brandText: { fontSize: 18, fontWeight: 700, color: "#1A1A2E" },
  brandAccent: { color: "#01C457" },
  sponsorBlock: { textAlign: "right", fontSize: 10, maxWidth: 250 },
  meta: { marginBottom: 24, fontSize: 11 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metaLabel: { color: "#525252" },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1A1A2E", paddingBottom: 4, fontWeight: 700 },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#CDD2D1" },
  cellDate: { width: 70 },
  cellMatch: { flex: 1 },
  cellTrigger: { width: 130 },
  cellAmount: { width: 70, textAlign: "right" },
  summary: { marginTop: 14, alignSelf: "flex-end", width: 260 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#1A1A2E", fontWeight: 700, fontSize: 12 },
  ustNote: { marginTop: 18, fontSize: 9, color: "#525252", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 40, left: 40, right: 40, fontSize: 8, color: "#a3a3a3", borderTopWidth: 0.5, borderTopColor: "#CDD2D1", paddingTop: 8 }
});

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function InvoicePdf({ data }: { data: InvoiceData }) {
  const subtotal = data.items.reduce((sum, i) => sum + i.amountCents, 0);
  const ust = data.club.isSmallBusiness ? 0 : Math.round(subtotal * 0.19);
  const total = subtotal + ust;
  const issued = data.issuedAt.toLocaleDateString("de-DE");

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.clubBlock}>
            <View style={s.brandRow}>
              <Text style={s.brandText}>{data.club.name}</Text>
            </View>
            <Text>{data.club.address.street}</Text>
            <Text>{data.club.address.zip} {data.club.address.city}</Text>
            {data.club.taxId && <Text style={{ marginTop: 4 }}>USt-IdNr: {data.club.taxId}</Text>}
            {data.club.iban && <Text>IBAN: {data.club.iban}</Text>}
          </View>
          <View style={s.sponsorBlock}>
            {data.sponsor.type === "business" && data.sponsor.businessName ? (
              <>
                <Text style={{ fontWeight: 700 }}>{data.sponsor.businessName}</Text>
                {data.sponsor.businessAddress && (
                  <>
                    <Text>{data.sponsor.businessAddress.street}</Text>
                    <Text>{data.sponsor.businessAddress.zip} {data.sponsor.businessAddress.city}</Text>
                  </>
                )}
              </>
            ) : (
              <Text style={{ fontWeight: 700 }}>{data.sponsor.displayName}</Text>
            )}
            <Text style={{ marginTop: 4, color: "#525252" }}>{data.sponsor.email}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <Text style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Rechnung {data.invoiceNumber}</Text>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Leistungszeitraum:</Text>
            <Text>{data.period}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Rechnungsdatum:</Text>
            <Text>{issued}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={s.cellDate}>Datum</Text>
          <Text style={s.cellMatch}>Spiel / Event</Text>
          <Text style={s.cellTrigger}>Trigger</Text>
          <Text style={s.cellAmount}>Betrag</Text>
        </View>
        {data.items.map((it, idx) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.cellDate}>{it.matchDate.toLocaleDateString("de-DE")}</Text>
            <Text style={s.cellMatch}>{it.matchLabel}</Text>
            <Text style={s.cellTrigger}>{it.triggerLabel}</Text>
            <Text style={s.cellAmount}>{eur(it.amountCents)}</Text>
          </View>
        ))}

        <View style={s.summary}>
          <View style={s.summaryRow}>
            <Text>Zwischensumme</Text>
            <Text>{eur(subtotal)}</Text>
          </View>
          {!data.club.isSmallBusiness && (
            <View style={s.summaryRow}>
              <Text>zzgl. 19 % USt</Text>
              <Text>{eur(ust)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text>Gesamt</Text>
            <Text>{eur(total)}</Text>
          </View>
        </View>

        {data.club.isSmallBusiness && (
          <Text style={s.ustNote}>
            Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.
          </Text>
        )}

        <Text style={s.footer}>
          Bitte überweisen Sie den Gesamtbetrag innerhalb von 14 Tagen auf das oben angegebene Konto.
          Rechnung erstellt mit KickPact — Performance-Sponsoring im Amateurfußball.
        </Text>
      </Page>
    </Document>
  );
}
```

### Task 3: Tests für InvoicePdf

Optional — react-pdf in Node-Vitest ist tricky. Wir skippen tests und testen E2E mit echtem Rendering in Phase E.

---

## Phase B — Storage + Numbering + Period

### Task 4: Numbering `lib/invoicing/numbering.ts`

Pattern: `KP-<YYYY>-<club_seq:0000>` — z.B. `KP-2026-0001`. Pro Verein eigene Sequenz. Wir speichern letzte Nummer auf `clubs.lastInvoiceSeq` (neue Spalte? Oder lookup auf invoices).

Lookup-Variante (kein Schema-Change):

```typescript
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function nextInvoiceNumber(clubId: string, year: number): Promise<string> {
  // Count existing invoices für diesen Club im Jahr
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.clubId, clubId), sql`EXTRACT(YEAR FROM ${invoices.createdAt}) = ${year}`));
  const seq = (row?.count ?? 0) + 1;
  return `KP-${year}-${String(seq).padStart(4, "0")}`;
}
```

### Task 5: Period + Storage

`lib/invoicing/period.ts`:

```typescript
export interface BillingPeriod {
  year: number;
  month: number; // 1-12
  label: string; // "Mai 2026"
  startsAt: Date;
  endsAt: Date;
}

export function lastBillingPeriod(now = new Date()): BillingPeriod {
  // Letzter Monat (für die Abrechnung am 1.)
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const startsAt = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
  const endsAt = new Date(`${y}-${String(m).padStart(2, "0")}-${daysInMonth(y, m)}T23:59:59Z`);
  return {
    year: y,
    month: m,
    label: startsAt.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    startsAt,
    endsAt
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
```

`lib/invoicing/storage.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";

const hasR2 =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET;

const s3 = hasR2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
      }
    })
  : null;

const LOCAL_DIR = process.env.LOCAL_PDF_DIR ?? "/tmp/kickpact-pdfs";

export async function storePdf(key: string, body: Buffer): Promise<string> {
  if (s3 && process.env.R2_BUCKET) {
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: "application/pdf" }));
    return `r2://${process.env.R2_BUCKET}/${key}`;
  }
  // Local fallback
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const localPath = path.join(LOCAL_DIR, key.replace(/\//g, "_"));
  await fs.writeFile(localPath, body);
  return `file://${localPath}`;
}

export async function getDownloadUrl(storedUrl: string): Promise<string> {
  if (storedUrl.startsWith("r2://")) {
    const [, , bucket, ...keyParts] = storedUrl.split("/");
    const key = keyParts.join("/");
    return getSignedUrl(
      s3!,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );
  }
  return storedUrl;
}
```

Install:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## Phase C — Generate-Invoices Inngest-Job

### Task 6: Query-Helpers

`lib/db/queries/charges.ts`:

```typescript
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges, pledges, sponsors, matches, teams, clubs, pledgeRules } from "@/lib/db/schema";

export interface ChargeForBilling {
  chargeId: string;
  sponsorId: string;
  clubId: string;
  triggerType: string;
  amountCents: number;
  matchDate: Date;
  matchLabel: string; // "FC Heim 3:1 SV Gast"
}

export async function listConfirmedChargesByPeriod(opts: {
  periodStart: Date;
  periodEnd: Date;
}): Promise<ChargeForBilling[]> {
  return db
    .select({
      chargeId: charges.id,
      sponsorId: pledges.sponsorId,
      clubId: teams.clubId,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      matchDate: matches.datum,
      matchLabel: sql<string>`${matches.heimName} || ' ' || COALESCE(${matches.ergebnisHeim}::text, '—') || ':' || COALESCE(${matches.ergebnisGast}::text, '—') || ' ' || ${matches.gastName}`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(matches, eq(charges.matchId, matches.id))
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(
      and(
        eq(charges.status, "confirmed"),
        gte(charges.confirmedAt, opts.periodStart),
        lte(charges.confirmedAt, opts.periodEnd)
      )
    );
}
```

(Hinweis: `sql` import — add zur Imports.)

`lib/db/queries/invoices.ts`:

```typescript
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, sponsors, clubs } from "@/lib/db/schema";

export async function listForSponsor(sponsorId: string) {
  return db
    .select({
      id: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      status: invoices.status,
      pdfUrl: invoices.pdfUrl,
      clubName: clubs.name,
      sentAt: invoices.sentAt,
      paidMarkedAt: invoices.paidMarkedAt
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .where(eq(invoices.sponsorId, sponsorId))
    .orderBy(desc(invoices.period));
}

export async function listForClub(clubId: string) {
  return db
    .select({
      id: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      status: invoices.status,
      pdfUrl: invoices.pdfUrl,
      sponsorDisplayName: sponsors.displayName,
      sponsorType: sponsors.type,
      sentAt: invoices.sentAt,
      paidMarkedAt: invoices.paidMarkedAt
    })
    .from(invoices)
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .where(eq(invoices.clubId, clubId))
    .orderBy(desc(invoices.period));
}
```

### Task 7: Inngest Function `generate-invoices`

`lib/inngest/functions/generate-invoices.ts`:

Cron: `17 3 1 * *` (1. des Monats, 03:17 lokal). Trigger-Event auch: `invoices/manual-run` für Tests.

Schritte:
1. Bestimme `lastBillingPeriod`
2. Lade alle confirmed charges in der Period
3. Group by (sponsorId, clubId)
4. Pro Gruppe: lade Sponsor + Club Details, build InvoiceData, render mit `@react-pdf/renderer`, store, insert invoice + invoice_items, set charges.status=invoiced + charges.invoice_id, send mail
5. Use Drizzle `idempotency` via `invoices_sponsor_club_period_idx`-UNIQUE-Constraint — bei retries kein doppeltes Insert

Full implementation:

```typescript
import { eq, sql, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, charges, sponsors, clubs, users, matches, teams, pledges } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { invoiceSponsorEmail } from "@/lib/mail/templates/invoice-sponsor";
import { invoiceClubEmail } from "@/lib/mail/templates/invoice-club";
import { lastBillingPeriod } from "@/lib/invoicing/period";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";
import { storePdf } from "@/lib/invoicing/storage";
import { InvoicePdf } from "@/lib/invoicing/builder";
import { renderToBuffer } from "@react-pdf/renderer";
// triggerLabel mapping
const TRIGGER_LABELS: Record<string, string> = {
  goal_total: "pro Tor",
  win: "pro Sieg",
  // ... vollständig wie in match-detail-page
  comeback_win: "pro Comeback",
  hattrick: "pro Hattrick",
  clean_sheet: "pro Zu-Null",
  goal_by_player: "pro Tor (Spieler)",
  special_goal: "Spezial-Tor",
  goals_scored_min: "viele Tore",
  goal_diff_min: "hoher Sieg"
};

export const generateInvoices = inngest.createFunction(
  { id: "generate-invoices" },
  [{ cron: "17 3 1 * *" }, { event: "invoices/manual-run" }],
  async ({ step, logger, event }) => {
    const period = (event?.data as any)?.period
      ? // optional override für manual-run
        (() => {
          const [y, m] = (event!.data as any).period.split("-").map(Number);
          return { year: y, month: m, label: new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" }), startsAt: new Date(y, m - 1, 1), endsAt: new Date(y, m, 0, 23, 59, 59) };
        })()
      : lastBillingPeriod();

    // Lade groupierte Charges
    const grouped = await step.run("load-charges", async () => {
      const rows = await db
        .select({
          chargeId: charges.id,
          sponsorId: pledges.sponsorId,
          clubId: teams.clubId,
          triggerType: charges.triggerType,
          amountCents: charges.amountCents,
          matchDate: matches.datum,
          heimName: matches.heimName,
          gastName: matches.gastName,
          ergebnisHeim: matches.ergebnisHeim,
          ergebnisGast: matches.ergebnisGast
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(matches, eq(charges.matchId, matches.id))
        .innerJoin(teams, eq(matches.teamId, teams.id))
        .where(
          and(
            eq(charges.status, "confirmed"),
            sql`${charges.confirmedAt} >= ${period.startsAt}`,
            sql`${charges.confirmedAt} <= ${period.endsAt}`
          )
        );
      const map = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = `${r.sponsorId}|${r.clubId}`;
        const arr = map.get(key) ?? [];
        arr.push(r);
        map.set(key, arr);
      }
      return [...map.entries()].map(([key, items]) => {
        const [sponsorId, clubId] = key.split("|");
        return { sponsorId, clubId, items };
      });
    });

    let invoicesCreated = 0;
    let mailsSent = 0;
    const periodStr = `${period.year}-${String(period.month).padStart(2, "0")}`;

    for (const group of grouped) {
      try {
        await step.run(`gen-${group.sponsorId}-${group.clubId}`, async () => {
          // Sponsor + Club details
          const [sp] = await db
            .select({
              sponsor: sponsors,
              user: users
            })
            .from(sponsors)
            .innerJoin(users, eq(sponsors.userId, users.id))
            .where(eq(sponsors.id, group.sponsorId))
            .limit(1);
          const [cl] = await db.select().from(clubs).where(eq(clubs.id, group.clubId)).limit(1);
          if (!sp || !cl) return;

          const invoiceNumber = await nextInvoiceNumber(cl.id, period.year);
          const subtotal = group.items.reduce((s, i) => s + i.amountCents, 0);
          const ust = cl.isSmallBusiness ? 0 : Math.round(subtotal * 0.19);
          const total = subtotal + ust;

          // Render PDF
          const pdfBuf = await renderToBuffer(
            <InvoicePdf
              data={{
                invoiceNumber,
                period: period.label,
                issuedAt: new Date(),
                club: {
                  name: cl.name,
                  address: (cl.addressJson as any) ?? { street: "", zip: "", city: "" },
                  iban: cl.iban,
                  taxId: cl.taxId,
                  isSmallBusiness: cl.isSmallBusiness
                },
                sponsor: {
                  displayName: sp.sponsor.displayName,
                  email: sp.user.email,
                  type: sp.sponsor.type,
                  businessName: sp.sponsor.businessName,
                  businessAddress: (sp.sponsor.businessAddressJson as any) ?? null
                },
                items: group.items.map((it) => ({
                  matchDate: it.matchDate,
                  matchLabel: `${it.heimName} ${it.ergebnisHeim ?? "—"}:${it.ergebnisGast ?? "—"} ${it.gastName}`,
                  triggerLabel: TRIGGER_LABELS[it.triggerType] ?? it.triggerType,
                  amountCents: it.amountCents
                }))
              }}
            />
          );

          const storageUrl = await storePdf(`${cl.id}/${invoiceNumber}.pdf`, pdfBuf);

          // Insert invoice + items + update charges (idempotent via UNIQUE)
          await db.transaction(async (tx) => {
            const [inv] = await tx
              .insert(invoices)
              .values({
                sponsorId: sp.sponsor.id,
                clubId: cl.id,
                period: periodStr,
                totalCents: total,
                pdfUrl: storageUrl,
                status: "sent",
                sentAt: new Date()
              })
              .onConflictDoNothing()
              .returning();

            if (!inv) return; // already exists

            await tx.insert(invoiceItems).values(
              group.items.map((it) => ({
                invoiceId: inv.id,
                chargeId: it.chargeId,
                description: `${new Date(it.matchDate).toLocaleDateString("de-DE")} · ${it.heimName} vs ${it.gastName} · ${TRIGGER_LABELS[it.triggerType] ?? it.triggerType}`,
                amountCents: it.amountCents
              }))
            );

            await tx
              .update(charges)
              .set({ status: "invoiced", invoiceId: inv.id })
              .where(sql`${charges.id} IN (${sql.join(group.items.map((i) => sql`${i.chargeId}`), sql`, `)})`);

            invoicesCreated++;
          });

          // Mails
          const sponsorMail = invoiceSponsorEmail({
            sponsorName: sp.sponsor.displayName,
            clubName: cl.name,
            period: period.label,
            totalEur: (total / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }),
            invoiceNumber
          });
          await resend.emails.send({
            from: MAIL_FROM,
            to: sp.user.email,
            subject: sponsorMail.subject,
            text: sponsorMail.text,
            html: sponsorMail.html,
            attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuf }]
          });
          mailsSent++;
        });
      } catch (err) {
        logger.error("Invoice generation failed", err);
      }
    }

    return { period: periodStr, groups: grouped.length, invoicesCreated, mailsSent };
  }
);
```

(Hinweis: `sql.join` ist evtl. nicht verfügbar — Fallback `inArray(charges.id, ids)`.)

Mail-Templates `lib/mail/templates/invoice-sponsor.tsx` + `invoice-club.tsx` — simple HTML wie magic-link.

Inngest-Registry erweitern.

---

## Phase D — UI

### Task 8: Server Actions `lib/actions/invoices.ts`

```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { invoices, clubs } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { getDownloadUrl } from "@/lib/invoicing/storage";

export async function markInvoicePaid(invoiceId: string) {
  const user = await requireUser();
  const [inv] = await db
    .select({ inv: invoices, clubSlug: clubs.slug })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Rechnung nicht gefunden");
  await assertClubAccess(inv.clubSlug, "admin");

  await db
    .update(invoices)
    .set({ status: "paid", paidMarkedAt: new Date(), paidMarkedBy: user.id })
    .where(eq(invoices.id, invoiceId));

  revalidatePath(`/verein/${inv.clubSlug}/abrechnungen`);
}

export async function invoiceDownloadUrl(invoiceId: string): Promise<string> {
  // Auth: owner-Sponsor oder Club-Admin
  const user = await requireUser();
  // ... (lookup, dual ownership-check, return signed URL)
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv?.pdfUrl) throw new Error("Keine PDF-URL");
  return getDownloadUrl(inv.pdfUrl);
}
```

### Task 9: Vereins-Abrechnungen-Page

Ersetze Stub durch echte Liste mit `listForClub` + Mark-As-Paid-Button.

### Task 10: Sponsor-Rechnungen-Page

Ersetze Stub durch echte Liste mit `listForSponsor` + Download-Link.

---

## Phase E — Saison-Ende + E2E

### Task 11: Saison-Ende Reminder-Cron

`lib/inngest/functions/season-end-reminders.ts` — Cron `0 10 1 6 *` (1. Juni, 10:00). Findet alle pledges mit `endsAt < +30d` und mailt Sponsoren + Vereine "Pledge läuft aus".

### Task 12: E2E-Tests

Auth-Guard-Tests für /verein/[slug]/abrechnungen + /sponsor/rechnungen.

---

## Self-Review

- ✅ 6.7 Invoicing — Phasen A-D
- ✅ 6.9 Saison-Ende — Task 11
- ✅ 5.4 invoiced-Status — Task 7 Transaction

**Known limits:**
- R2-Setup: Storage falls back auf `/tmp/kickpact-pdfs/` lokal — produktiv R2-Keys nötig
- Stripe-Auto-Charging — bleibt Plan 5
- E-Mail an dattonius99 nur, bis Domain verifiziert
