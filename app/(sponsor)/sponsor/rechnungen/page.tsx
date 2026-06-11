import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import {
  listForSponsor,
  SPONSOR_INVOICE_SORT_KEYS,
  type SponsorInvoiceSortKey
} from "@/lib/db/queries/invoices";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import { SponsorInvoicesList } from "./_components/sponsor-invoices-list";
import { PageHeader } from "@/components/shared/page-header";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Rechnungen · KickPact" };

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
};

export default async function RechnungenPage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  const sponsor = await findSponsorForUser(user.id);

  if (!sponsor) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 md:mb-10">
          <PageHeader className="md:hidden" title="Rechnungen" />
          <h1 className="hidden md:block text-2xl md:text-4xl lg:text-5xl font-bold text-brand-night-navy">
            Rechnungen
          </h1>
        </div>
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <p className="text-sm md:text-base text-brand-night-navy/70">
            Du brauchst zuerst ein Sponsor-Profil und mindestens einen aktiven Pact,
            bevor Rechnungen hier erscheinen.
          </p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const spGet = {
    get(key: string): string | null {
      const v = (sp as Record<string, string | undefined>)[key];
      return v ?? null;
    }
  };
  const { page, pageSize } = parsePaginationFromSearchParams(spGet);
  const sort = (SPONSOR_INVOICE_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as SponsorInvoiceSortKey)
    : undefined;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const result = await listForSponsor(sponsor.id, {
    pagination: { page, pageSize },
    sort,
    dir
  });

  const totalCents = result.rows.reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 md:mb-10">
        <PageHeader
          className="md:hidden"
          title="Deine Rechnungen"
          subtitle={
            result.total === 0
              ? "Noch keine Rechnungen — kommt zum 1. des Monats."
              : `${result.total} Rechnung${result.total === 1 ? "" : "en"} · Diese Seite ${eur(totalCents)}`
          }
        />
        <div className="hidden md:block">
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-brand-night-navy">
            Deine Rechnungen
          </h1>
          <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
            {result.total === 0
              ? "Noch keine Rechnungen — kommt zum 1. des Monats."
              : `${result.total} Rechnung${result.total === 1 ? "" : "en"} · Diese Seite ${eur(totalCents)}`}
          </p>
        </div>
      </div>

      {result.total === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <div className="text-3xl md:text-4xl mb-2 md:mb-3">📄</div>
          <p className="text-base md:text-lg font-bold text-brand-night-navy">
            Noch keine Rechnung
          </p>
          <p className="mt-1.5 md:mt-2 text-sm text-brand-night-navy/60 max-w-md">
            Sobald deine Mannschaft Spiele gespielt hat und deine Pacts getriggert wurden,
            kommt am 1. des Folgemonats die Rechnung — direkt vom Verein, KickPact leitet sie
            an dich weiter.
          </p>
        </div>
      ) : (
        <SponsorInvoicesList
          invoices={result.rows}
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
