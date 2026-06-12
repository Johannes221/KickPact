import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { SponsorProfileForm } from "./_components/sponsor-profile-form";
import { BillingCycleCard } from "./_components/billing-cycle-card";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Profil · KickPact" };

export default async function SponsorProfilPage() {
  const user = await requireUser();

  const sponsor = await findSponsorForUser(user.id);

  if (!sponsor) redirect("/sponsor/onboarding");

  const addr = sponsor.businessAddressJson as
    | { street?: string; zip?: string; city?: string }
    | null;

  return (
    <div className="max-w-xl space-y-8">
      <PageHeader
        className="md:hidden"
        title="Mein Profil"
        subtitle={
          sponsor.type === "business"
            ? "Firmendaten erscheinen auf Rechnungen."
            : "Dein Anzeigename für Vereine."
        }
      />
      <div className="hidden md:block">
        <h2 className="text-2xl md:text-3xl font-bold text-brand-night-navy">
          Mein Profil
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          {sponsor.type === "business"
            ? "Firmendaten erscheinen auf Rechnungen."
            : "Dein Anzeigename für Vereine."}
        </p>
      </div>

      <SponsorProfileForm
        sponsorType={sponsor.type}
        defaultValues={
          sponsor.type === "familie"
            ? {
                type: "familie",
                displayName: sponsor.displayName,
                role: sponsor.role ?? "",
                description: sponsor.description ?? ""
              }
            : {
                type: "business",
                displayName: sponsor.displayName,
                businessName: sponsor.businessName ?? "",
                street: addr?.street ?? "",
                zip: addr?.zip ?? "",
                city: addr?.city ?? "",
                businessTaxId: sponsor.businessTaxId ?? ""
              }
        }
      />

      {/* Paket A.5 (Spec §1.2): Abrechnungs-Rhythmus Monatlich/Saisonende */}
      <BillingCycleCard currentCycle={sponsor.billingCycle} />
    </div>
  );
}
