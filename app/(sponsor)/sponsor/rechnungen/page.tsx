import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Rechnungen · KickPact" };

export default async function RechnungenPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Rechnungen
        </h1>
      </div>
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
        <div className="text-3xl md:text-4xl mb-2 md:mb-3">📄</div>
        <p className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          PDF-Rechnungen kommen in Plan 4
        </p>
        <p className="mt-1.5 md:mt-2 text-sm text-brand-night-navy/60 max-w-md">
          Du erhältst zum Monatsersten eine USt-konforme Rechnung vom Verein per Mail. Die
          History wird hier auflistbar sein.
        </p>
      </div>
    </div>
  );
}
