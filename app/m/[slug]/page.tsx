import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";
import { getPublicTeamInsights } from "@/lib/db/queries/team-public-insights";
import { ProfileHero } from "./_components/profile-hero";
import { InsightsStrip } from "./_components/insights-strip";
import { GalleryStrip } from "./_components/gallery-strip";
import { SponsorInquiryForm } from "./_components/sponsor-inquiry-form";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicTeamProfileBySlug(slug);
  if (!profile) return { title: "Profil nicht gefunden – KickPact" };
  const title = `${profile.displayName} – Sponsoring | KickPact`;
  const description =
    profile.tagline ??
    `Unterstütze ${profile.displayName} (${profile.clubName}) mit performance-basiertem Sponsoring auf KickPact.`;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: profile.coverUrl ? [`${base}${profile.coverUrl}`] : undefined
    },
    robots: { index: true, follow: true }
  };
}

/**
 * Öffentliche Mannschafts-Profilseite (/m/{slug}). Erreichbar ohne Login.
 * Editorial/Stadion-Layout: dunkler Hero, Saison-Insights, Galerie, Über uns,
 * How-it-works und Sponsoring-Anfrage. 404, wenn das Team nicht (mehr)
 * öffentlich ist.
 */
export default async function PublicTeamProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getPublicTeamProfileBySlug(slug);
  if (!profile) notFound();

  const insights = profile.showInsights
    ? await getPublicTeamInsights(
        profile.teamId,
        profile.teamName,
        profile.clubName
      )
    : null;
  const verified = !!(profile.teamVerifiedAt || profile.clubVerifiedAt);

  return (
    <main className="mx-auto max-w-screen-sm bg-white pb-12">
      <ProfileHero
        displayName={profile.displayName}
        clubName={profile.clubName}
        league={profile.league}
        clubOrt={profile.clubOrt}
        saison={profile.saison}
        verified={verified}
        coverUrl={profile.coverUrl}
        logoUrl={profile.logoUrl}
      />

      {insights && <InsightsStrip insights={insights} />}

      <GalleryStrip images={profile.gallery} />

      {(profile.tagline || profile.goals) && (
        <section className="px-4 pt-5">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
            Über uns
          </div>
          {profile.tagline && (
            <p className="text-sm leading-relaxed text-brand-night-navy/90">
              {profile.tagline}
            </p>
          )}
          {profile.goals && (
            <p className="mt-2 whitespace-pre-line text-sm text-brand-night-navy/70">
              🎯 <span className="font-semibold">Unsere Ziele:</span>{" "}
              {profile.goals}
            </p>
          )}
        </section>
      )}

      <section className="px-4 pt-5">
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <h2 className="mb-1 font-display text-sm font-bold text-brand-night-navy">
            So funktioniert Sponsoring auf KickPact
          </h2>
          <p className="text-xs leading-relaxed text-brand-night-navy/70">
            Du versprichst einen Betrag pro Ereignis — z. B.{" "}
            <strong>5 € pro Tor</strong>. KickPact erfasst die Spiele automatisch
            und rechnet am Monatsende per Rechnung ab. Fair, transparent, ohne
            Aufwand für die Mannschaft.
          </p>
        </div>
      </section>

      <section id="anfragen" className="px-4 pt-5">
        <div className="rounded-2xl bg-brand-night-navy/[0.04] p-4">
          <h2 className="mb-1 font-display text-sm font-bold text-brand-night-navy">
            Sponsoring anfragen
          </h2>
          <p className="mb-3 text-xs text-brand-night-navy/60">
            Hinterlasse deine Kontaktdaten — {profile.displayName} meldet sich
            bei dir.
          </p>
          <SponsorInquiryForm
            teamSlug={profile.publicSlug}
            teamName={profile.displayName}
          />
        </div>
      </section>

      <p className="mt-8 px-4 text-center text-xs text-brand-night-navy/40">
        Performance-Sponsoring im Amateurfußball ·{" "}
        <a href="/" className="underline hover:text-accent-dark">
          KickPact
        </a>
      </p>
    </main>
  );
}
