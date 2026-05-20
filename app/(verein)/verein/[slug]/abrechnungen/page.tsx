import { assertClubAccess } from "@/lib/auth/scope";

export const metadata = { title: "Abrechnungen · KickPact" };

export default async function AbrechnungenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await assertClubAccess(slug, "viewer");

  return (
    <div className="space-y-6">
      <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
        Abrechnungen
      </h2>
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-8">
        <div className="text-4xl mb-3">📄</div>
        <p className="font-display font-black text-lg tracking-tight text-brand-night-navy">
          PDF-Rechnungen kommen in Plan 4
        </p>
        <p className="mt-2 text-sm text-brand-night-navy/60 max-w-md">
          Monats-Aggregation aller bestätigten Charges + Rendering einer USt-konformen PDF
          per Sponsor + Versand via Resend ist Inhalt vom nächsten Plan.
        </p>
      </div>
    </div>
  );
}
