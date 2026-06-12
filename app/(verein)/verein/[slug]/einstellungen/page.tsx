import Link from "next/link";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { getClubById } from "@/lib/db/queries/club-admin";
import { EinstellungenForm } from "./_components/einstellungen-form";
import { PublicProfileCard } from "./_components/public-profile-card";

export const metadata = { title: "Einstellungen · KickPact" };

export default async function EinstellungenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "admin");

  const clubData = await getClubById(club.id);

  if (!clubData) return null;

  const addr = clubData.addressJson as
    | { street?: string; zip?: string; city?: string }
    | null
    | undefined;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Einstellungen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Stammdaten erscheinen auf PDF-Rechnungen als Absender.
        </p>
      </div>

      <EinstellungenForm
        slug={slug}
        defaultValues={{
          name: clubData.name,
          ort: clubData.ort ?? "",
          street: addr?.street ?? "",
          zip: addr?.zip ?? "",
          city: addr?.city ?? "",
          isSmallBusiness: clubData.isSmallBusiness,
          taxId: clubData.taxId ?? "",
          iban: clubData.iban ?? "",
          paypalHandle: clubData.paypalHandle ?? "",
          stripePaymentLink: clubData.stripePaymentLink ?? ""
        }}
      />

      {/* Öffentliches Vereinsprofil (/v/[slug], Phase 5 Paket C) */}
      <PublicProfileCard
        slug={slug}
        clubId={clubData.id}
        initialDescription={clubData.descriptionMd ?? ""}
        hasHero={!!clubData.heroUrl}
        isVerified={!!clubData.verifiedAt}
      />

      {/* Abo-Bereich */}
      <section className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-5 md:p-6">
        <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
          Abo &amp; Lizenzen
        </h3>
        <p className="mt-2 text-sm text-brand-night-navy/70">
          Mannschafts-Lizenzen, Stripe-Portal und Abo-Verwaltung.
        </p>
        <Link
          href={`/verein/${slug}/abo`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-night-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-night-navy/90 transition-colors"
        >
          Abo verwalten →
        </Link>
      </section>
    </div>
  );
}
