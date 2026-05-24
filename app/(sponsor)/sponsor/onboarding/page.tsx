import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
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
  // Sponsor mit fertigem Profil soll niemals erneut die "Familie oder
  // Unternehmen?"-Frage sehen — sonst Duplicate-Insert beim Submit.
  const [existing] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);
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
      <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Willkommen bei <span className="text-accent">KickPact</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
        Kurze Frage: Bist du Familie/Freund oder Unternehmen?
      </p>
      <p className="mt-3 rounded-md border border-brand-neutral/40 bg-brand-off-white px-3 py-2 text-xs md:text-sm text-brand-night-navy/70">
        👨‍👩‍👧 Junioren-Spieler im Verein? Familie + Verwandte kannst du als
        Sub-Sponsoren listen — eine Rechnung, automatische Aufteilung.
      </p>
      <div className="mt-6 md:mt-10">
        <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
          <SponsorTypeForm />
        </Suspense>
      </div>
    </div>
  );
}
