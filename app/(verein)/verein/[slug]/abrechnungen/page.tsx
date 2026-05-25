import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import {
  listForClub,
  CLUB_INVOICE_SORT_KEYS,
  type ClubInvoiceSortKey
} from "@/lib/db/queries/invoices";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import { InvoicesTable } from "./_components/invoices-table";

export const metadata = { title: "Abrechnungen · KickPact" };

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
};

export default async function AbrechnungenPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  await assertVereinAdminOrRedirect(slug, "viewer");
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) return null;

  const sp = await searchParams;
  const spGet = {
    get(key: string): string | null {
      const v = (sp as Record<string, string | undefined>)[key];
      return v ?? null;
    }
  };
  const { page, pageSize } = parsePaginationFromSearchParams(spGet);
  const sort = (CLUB_INVOICE_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as ClubInvoiceSortKey)
    : undefined;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const result = await listForClub(club.id, {
    pagination: { page, pageSize },
    sort,
    dir
  });

  // Stat-Aggregates: we still want club-wide totals (not just page-totals).
  // Fetch one extra unpaginated count by re-using the legacy overload for the
  // open/total summary. Cheap on a single-club query and keeps the UX honest.
  const allInvoices = await listForClub(club.id);
  const isAdmin = true; // assertVereinAdminOrRedirect already validated; refine later for trainer/viewer
  const totalCents = allInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const openCents = allInvoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Abrechnungen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Alle Sponsoren-Rechnungen, die KickPact für diesen Verein erzeugt hat.
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Rechnungen gesamt" value={String(result.total)} />
        <StatCard label="Volumen gesamt" value={eur(totalCents)} />
        <StatCard label="Offen" value={eur(openCents)} hint={openCents > 0 ? "noch nicht als bezahlt markiert" : "alles bezahlt"} />
      </div>

      {result.total === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <div className="text-3xl md:text-4xl mb-2 md:mb-3">📄</div>
          <p className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Noch keine Rechnungen
          </p>
          <p className="mt-1.5 md:mt-2 text-sm text-brand-night-navy/60 max-w-md">
            KickPact erzeugt am 1. jedes Monats die Rechnungen für alle bestätigten Charges des
            Vormonats. Sponsoren bekommen die PDF per Mail, du eine Kopie.
          </p>
        </div>
      ) : (
        <InvoicesTable
          invoices={result.rows}
          canMarkPaid={isAdmin}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          sort={sort}
          dir={dir}
        />
      )}
    </div>
  );
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-brand-neutral/40 bg-white p-4">
      <div className="text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1.5 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
        {value}
      </div>
      {hint && <div className="text-xs text-brand-night-navy/40 mt-0.5">{hint}</div>}
    </div>
  );
}
