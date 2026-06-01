import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";
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
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    robots: { index: true, follow: true }
  };
}

/**
 * Öffentliche Mannschafts-Profilseite (/m/{slug}). Erreichbar ohne Login.
 * Zeigt Logo, Name, Verein/Ort, Kurzbeschreibung, Ziele + „Sponsoring
 * anfragen". 404, wenn das Team nicht (mehr) öffentlich ist.
 */
export default async function PublicTeamProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getPublicTeamProfileBySlug(slug);
  if (!profile) notFound();

  const isVerified = !!(profile.clubVerifiedAt || profile.teamVerifiedAt);
  const locationLine = [profile.clubName, profile.clubOrt]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-4 md:px-6">
      {/* Hero */}
      <section className="rounded-3xl border border-brand-neutral/40 bg-white p-6 md:p-8">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left sm:gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-brand-neutral/40 bg-brand-off-white flex items-center justify-center">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logoUrl}
                alt={`Logo ${profile.displayName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display font-black text-3xl text-brand-night-navy/30">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="mt-4 sm:mt-0 min-w-0">
            <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy break-words">
              {profile.displayName}
            </h1>
            {locationLine && (
              <p className="mt-1 text-sm text-brand-night-navy/60">
                {locationLine}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center rounded-full bg-brand-off-white border border-brand-neutral/40 px-2.5 py-1 text-xs font-semibold text-brand-night-navy">
                Saison {profile.saison}
              </span>
              {isVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent-dark ring-1 ring-accent/30">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Verifiziert
                </span>
              )}
            </div>
          </div>
        </div>

        {profile.tagline && (
          <p className="mt-5 text-base text-brand-night-navy/80 leading-relaxed">
            {profile.tagline}
          </p>
        )}
      </section>

      {/* Ziele */}
      {profile.goals && (
        <section className="mt-5 rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6">
          <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
            Unsere Ziele
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-brand-night-navy/75 leading-relaxed">
            {profile.goals}
          </p>
        </section>
      )}

      {/* Wie Sponsoring funktioniert (kurzer Trust-Block) */}
      <section className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 p-5 md:p-6">
        <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
          So funktioniert Sponsoring auf KickPact
        </h2>
        <p className="mt-2 text-sm text-brand-night-navy/75 leading-relaxed">
          Du versprichst einen Betrag pro Ereignis — z. B. <strong>5 € pro
          Tor</strong>. KickPact erfasst die Spiele automatisch und rechnet am
          Monatsende per Rechnung ab. Fair, transparent, ohne Aufwand für die
          Mannschaft.
        </p>
      </section>

      {/* CTA: Sponsoring anfragen */}
      <section
        id="anfragen"
        className="mt-5 rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6"
      >
        <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
          Sponsoring anfragen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Hinterlasse deine Kontaktdaten — {profile.displayName} meldet sich bei
          dir.
        </p>
        <div className="mt-4">
          <SponsorInquiryForm
            teamSlug={profile.publicSlug}
            teamName={profile.displayName}
          />
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-brand-night-navy/40">
        Performance-Sponsoring im Amateurfußball ·{" "}
        <a href="/" className="underline hover:text-accent-dark">
          KickPact
        </a>
      </p>
    </main>
  );
}
