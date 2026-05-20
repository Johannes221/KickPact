import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { listForSponsor } from "@/lib/db/queries/invoices";
import { SponsorInvoicesList } from "./_components/sponsor-invoices-list";

export const metadata = { title: "Rechnungen · KickPact" };

export default async function RechnungenPage() {
  const user = await requireUser();
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (!sponsor) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 md:mb-10">
          <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
            Rechnungen
          </h1>
        </div>
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <p className="text-sm md:text-base text-brand-night-navy/70">
            Du brauchst zuerst ein Sponsor-Profil und mindestens einen aktiven Pledge,
            bevor Rechnungen hier erscheinen.
          </p>
        </div>
      </div>
    );
  }

  const invoicesList = await listForSponsor(sponsor.id);
  const totalCents = invoicesList.reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Deine Rechnungen
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          {invoicesList.length === 0
            ? "Noch keine Rechnungen — kommt zum 1. des Monats."
            : `${invoicesList.length} Rechnung${invoicesList.length === 1 ? "" : "en"} · Gesamt ${eur(totalCents)}`}
        </p>
      </div>

      {invoicesList.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <div className="text-3xl md:text-4xl mb-2 md:mb-3">📄</div>
          <p className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Noch keine Rechnung
          </p>
          <p className="mt-1.5 md:mt-2 text-sm text-brand-night-navy/60 max-w-md">
            Sobald deine Mannschaft Spiele gespielt hat und deine Pledges getriggert wurden,
            kommt am 1. des Folgemonats die Rechnung — direkt vom Verein, KickPact leitet sie
            an dich weiter.
          </p>
        </div>
      ) : (
        <SponsorInvoicesList invoices={invoicesList} />
      )}
    </div>
  );
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
