import Link from "next/link";
import { listInvoicesForAdmin, type InvoiceStatus } from "@/lib/db/queries/invoice-admin";
import { InvoiceTriggerButton } from "./_components/invoice-trigger-button";
import { InvoiceRowActions } from "@/components/admin/invoice-row-actions";

export const metadata = { title: "Rechnungen · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  paid: "Bezahlt",
  withheld: "Zurückgehalten"
};

const STATUS_PILL: Record<InvoiceStatus, string> = {
  draft: "bg-brand-neutral/30 text-brand-night-navy/60",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  withheld: "bg-amber-100 text-amber-700"
};

const FILTERS: Array<{ value: InvoiceStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "sent", label: "Versendet" },
  { value: "paid", label: "Bezahlt" },
  { value: "withheld", label: "Zurückgehalten" },
  { value: "draft", label: "Entwurf" }
];

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function pdfHref(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  if (pdfUrl.startsWith("local://")) {
    return `/api/invoices/pdf?key=${encodeURIComponent(pdfUrl.slice("local://".length))}`;
  }
  return pdfUrl;
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminRechnungenPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = (FILTERS.find((f) => f.value === params.status)?.value ?? "all") as
    | InvoiceStatus
    | "all";
  const search = params.q?.trim() || undefined;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { invoices, total } = await listInvoicesForAdmin({
    status: statusFilter === "all" ? undefined : statusFilter,
    search,
    limit: PAGE_SIZE,
    offset
  });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Manuelle Rechnungsgenerierung
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 space-y-3">
          <p className="text-sm text-brand-night-navy/70">
            Triggert das{" "}
            <code className="font-mono text-xs bg-brand-neutral/30 px-1 py-0.5 rounded">
              invoices/manual-run
            </code>{" "}
            Inngest-Event (idempotent; ohne Zeitraum = letzter Monat).
          </p>
          <InvoiceTriggerButton />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Rechnungen ({total})
          </h3>
          <form method="GET" className="flex gap-2">
            {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            <input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Verein, Sponsor, Periode…"
              className="rounded-lg border border-brand-neutral/40 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-night-navy px-3 py-1.5 text-sm font-semibold text-white"
            >
              Suchen
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = f.value === statusFilter;
            const href = `/admin/rechnungen${qs({
              status: f.value === "all" ? undefined : f.value,
              q: search
            })}`;
            return (
              <Link
                key={f.value}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-brand-night-navy text-white"
                    : "bg-brand-off-white text-brand-night-navy/70 hover:bg-white border border-brand-neutral/40"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-neutral/30 text-left text-xs uppercase tracking-widest text-brand-night-navy/50">
                <th className="px-4 py-3 font-semibold">Periode</th>
                <th className="px-4 py-3 font-semibold">Verein</th>
                <th className="px-4 py-3 font-semibold">Sponsor</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Betrag</th>
                <th className="px-4 py-3 font-semibold">PDF</th>
                <th className="px-4 py-3 font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-night-navy/50">
                    Keine Rechnungen.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const href = pdfHref(inv.pdfUrl);
                return (
                  <tr key={inv.id} className="border-b border-brand-neutral/20 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{inv.period}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/vereine/${inv.clubSlug}`} className="hover:underline">
                        {inv.clubName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-brand-night-navy/70">
                      {inv.sponsorName}
                      <span className="text-brand-night-navy/60"> · {inv.sponsorEmail}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_PILL[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                      {inv.reversalOfInvoiceId && (
                        <span className="ml-1 rounded-md bg-brand-night-navy/10 px-1.5 py-0.5 text-[0.7rem] font-semibold text-brand-night-navy/70">
                          Storno
                        </span>
                      )}
                      {inv.cancelledAt && (
                        <span className="ml-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[0.7rem] font-semibold text-rose-700">
                          storniert
                        </span>
                      )}
                      {inv.markedPaidBySponsorAt && !inv.paidMarkedAt && (
                        <span className="ml-1 text-[0.7rem] text-amber-700">Sponsor-Claim</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{eur(inv.totalCents)}</td>
                    <td className="px-4 py-3">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          PDF
                        </a>
                      ) : (
                        <span className="text-brand-night-navy/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceRowActions
                        invoiceId={inv.id}
                        paid={Boolean(inv.paidMarkedAt)}
                        canStorno={
                          (inv.status === "sent" || inv.status === "paid") &&
                          !inv.cancelledAt &&
                          !inv.reversalOfInvoiceId
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-brand-night-navy/50">
            Seite {page} von {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/rechnungen${qs({ status: statusFilter === "all" ? undefined : statusFilter, q: search, page: String(page - 1) })}`}
                className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
              >
                Zurück
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/rechnungen${qs({ status: statusFilter === "all" ? undefined : statusFilter, q: search, page: String(page + 1) })}`}
                className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
              >
                Weiter
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
