import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { SponsorTypeForm } from "./_components/sponsor-type-form";

export const metadata = { title: "Sponsor-Profil · KickPact" };

export default async function SponsorOnboardingPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Willkommen bei <span className="text-accent">KickPact</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
        Kurze Frage: Bist du Familie/Freund oder Unternehmen?
      </p>
      <div className="mt-6 md:mt-10">
        <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
          <SponsorTypeForm />
        </Suspense>
      </div>
    </div>
  );
}
