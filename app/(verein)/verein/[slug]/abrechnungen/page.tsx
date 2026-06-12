import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { getClubBySlug } from "@/lib/db/queries/club-admin";
import {
  listForClub,
  CLUB_INVOICE_SORT_KEYS,
  type ClubInvoiceSortKey
} from "@/lib/db/queries/invoices";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import {
  buildReminderText,
  invoiceNumberFromPdfUrl
} from "@/lib/invoicing/reminder-text";
import { StatCard } from "@/components/shared/stat-card";
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
  const access = await assertVereinAdminOrRedirect(slug, "viewer");
  const club = await getClubBySlug(slug);
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
  // B7 (Audit 2026-06-11): „Als bezahlt markieren" nur für echte Club-Admins —
  // Trainer/Viewer sehen die Tabelle read-only.
  const isAdmin = access.role === "admin";

  // Zahlungserinnerungs-Vorlage (Phase 5 Paket C): pro offener, versendeter
  // Rechnung server-seitig den fertigen Text bauen — der Client zeigt ihn nur
  // an (Kopieren / mailto). KickPact versendet nichts (keine Auto-Mahnungen).
  const now = Date.now();
  const rowsWithReminder = result.rows.map((row) => {
    if (row.status !== "sent") return { ...row, reminder: null };
    const dueSinceDays = row.sentAt
      ? Math.floor((now - row.sentAt.getTime()) / 86_400_000)
      : 0;
    const { subject, body } = buildReminderText({
      sponsorName: row.sponsorDisplayName,
      invoiceNumber: invoiceNumberFromPdfUrl(row.pdfUrl) ?? `Periode ${row.period}`,
      amountEur: eur(row.totalCents),
      dueSinceDays,
      clubName: club.name,
      paymentOptions: {
        iban: club.iban,
        paypalHandle: club.paypalHandle,
        stripePaymentLink: club.stripePaymentLink
      }
    });
    return { ...row, reminder: { subject, body, sponsorEmail: row.sponsorEmail } };
  });

  const totalCents = allInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const openCents = allInvoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
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
          <p className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Noch keine Rechnungen
          </p>
          <p className="mt-1.5 md:mt-2 text-sm text-brand-night-navy/60 max-w-md">
            KickPact erzeugt am 1. jedes Monats die Rechnungen für alle bestätigten Charges des
            Vormonats. Sponsoren bekommen die PDF per Mail, du eine Kopie.
          </p>
        </div>
      ) : (
        <InvoicesTable
          invoices={rowsWithReminder}
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
