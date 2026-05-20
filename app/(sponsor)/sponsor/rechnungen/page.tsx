import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Rechnungen · KickPact" };

export default async function RechnungenPage() {
  await requireUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          Rechnungen
        </h1>
      </div>
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-8">
        <div className="text-4xl mb-3">📄</div>
        <p className="font-display font-black text-lg tracking-tight text-brand-night-navy">
          PDF-Rechnungen kommen in Plan 4
        </p>
        <p className="mt-2 text-sm text-brand-night-navy/60 max-w-md">
          Du erhältst zum Monatsersten eine USt-konforme Rechnung vom Verein per Mail. Die
          History wird hier auflistbar sein.
        </p>
      </div>
    </main>
  );
}
