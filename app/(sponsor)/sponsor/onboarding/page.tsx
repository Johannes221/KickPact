import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { SponsorTypeForm } from "./_components/sponsor-type-form";
import { SignupCompletedTracker } from "@/components/analytics/signup-completed-tracker";

export const metadata = { title: "Sponsor-Profil · KickPact" };

export default async function SponsorOnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const user = await requireUser();
  const { invitation } = await searchParams;

  // ── Skip-If-Profile-Exists ────────────────────────────────────────────────
  // Sponsor mit fertigem Profil soll das Onboarding-Formular nie erneut
  // sehen — sonst Duplicate-Insert beim Submit.
  const existing = await findSponsorForUser(user.id);
  if (existing) {
    redirect(
      invitation
        ? `/sponsor/pledge/new?invitation=${invitation}`
        : "/sponsor"
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Feuert signup_completed einmal pro Session — Sponsor-Onboarding ist
          der erste authentifizierte Touchpoint für Sponsor-Signups. */}
      <SignupCompletedTracker />
      <h1 className="font-display font-bold text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Willkommen bei <span className="text-accent">KickPact</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
        Sag der Mannschaft kurz, wer hinter ihr steht. Dauert keine Minute.
      </p>
      <p className="mt-3 rounded-md border border-brand-neutral/40 bg-brand-off-white px-3 py-2 text-xs md:text-sm text-brand-night-navy/70">
        👨‍👩‍👧 Ein Konto pro Familie — teilt euch einfach einen Zugang, die
        Zahlungsübersicht kommt gesammelt.
      </p>
      <div className="mt-6 md:mt-10">
        <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
          <SponsorTypeForm />
        </Suspense>
      </div>
    </div>
  );
}
