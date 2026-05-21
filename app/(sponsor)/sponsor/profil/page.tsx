import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { SponsorProfileForm } from "./_components/sponsor-profile-form";

export const metadata = { title: "Profil · KickPact" };

export default async function SponsorProfilPage() {
  const user = await requireUser();

  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (!sponsor) redirect("/sponsor/onboarding");

  const addr = sponsor.businessAddressJson as
    | { street?: string; zip?: string; city?: string }
    | null;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
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
            ? { type: "familie", displayName: sponsor.displayName }
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
    </div>
  );
}
