import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicClubProfileBySlug } from "@/lib/db/queries/club-public-profile";
import { saisonLabel } from "@/lib/utils/saison";
import { isPlausibleLeague } from "@/lib/utils/league";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicClubProfileBySlug(slug);
  // Kein eigener Brand-Suffix — das Layout-Template (`%s – KickPact`) hängt
  // die Marke an (gleiches Muster wie /m/[slug], sonst doppelter Suffix).
  if (!profile) return { title: "Verein nicht gefunden" };
  const title = `${profile.name} – Sponsoring`;
  const description =
    profile.descriptionMd?.split("\n")[0]?.slice(0, 160) ||
    `Unterstütze die Mannschaften von ${profile.name} mit performance-basiertem Sponsoring auf KickPact.`;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: [
        profile.heroUrl ? `${base}${profile.heroUrl}` : `${base}/brand/team-fallback.jpg`
      ]
    },
    robots: { index: true, follow: true }
  };
}

/**
 * Öffentliches Vereinsprofil (/v/{slug}, Phase 5 Paket C). Erreichbar ohne
 * Login, nur für verifizierte Vereine (sonst 404). Mobile-first wie /m/:
 * Hero (Bild oder Gradient), Beschreibung, Mannschaftsliste mit Links auf
 * die öffentlichen Team-Profile — der Sponsoring-Flow (Anfrage) lebt dort.
 */
export default async function PublicClubProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getPublicClubProfileBySlug(slug);
  if (!profile) notFound();

  // Plaintext-Absätze (KEIN dangerouslySetInnerHTML) — gleiche Strategie wie
  // /m/ bei langen Texten (whitespace-pre-line).
  const paragraphs = (profile.descriptionMd ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="mx-auto max-w-screen-sm bg-white pb-12">
      {/* Hero */}
      <header className="relative h-56 overflow-hidden bg-brand-night-navy">
        {profile.heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.heroUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-night-navy via-brand-night-navy to-accent/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/40 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent text-xl font-black text-brand-night-navy shadow-lg">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{profile.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-white">
            {profile.name}
          </h1>
          <p className="text-xs text-brand-neutral">
            {[profile.ort, "Verein"].filter(Boolean).join(" · ")} ·{" "}
            <span className="font-semibold text-accent">✔ Verifiziert</span>
          </p>
        </div>
      </header>

      {/* Über den Verein */}
      {paragraphs.length > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
            Über uns
          </div>
          <div className="space-y-3">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="whitespace-pre-line text-sm leading-relaxed text-brand-night-navy/90"
              >
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Mannschaften */}
      <section className="px-4 pt-6">
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
          Mannschaften
        </div>
        {profile.teams.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">
            Noch keine Mannschaften eingetragen.
          </p>
        ) : (
          <ul className="space-y-2">
            {profile.teams.map((t) => {
              const meta = [
                isPlausibleLeague(t.league) ? t.league : null,
                `Saison ${saisonLabel(t.saison)}`
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={t.id}>
                  {t.publicSlug ? (
                    <Link
                      href={`/m/${t.publicSlug}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-brand-night-navy/10 bg-white p-4 transition-colors hover:border-accent/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-brand-night-navy">
                          {t.name}
                        </p>
                        <p className="mt-0.5 text-xs text-brand-night-navy/60">{meta}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent-dark">
                        Sponsern →
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-night-navy/10 bg-brand-night-navy/[0.03] p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-brand-night-navy/80">
                          {t.name}
                        </p>
                        <p className="mt-0.5 text-xs text-brand-night-navy/50">{meta}</p>
                      </div>
                      <span className="shrink-0 text-xs text-brand-night-navy/40">
                        Profil folgt
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section className="px-4 pt-6">
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <h2 className="mb-1 font-display text-sm font-bold text-brand-night-navy">
            So funktioniert Sponsoring auf KickPact
          </h2>
          <p className="text-xs leading-relaxed text-brand-night-navy/70">
            Du versprichst einen Betrag pro Ereignis — z. B. <strong>5 € pro Tor</strong>.
            KickPact erfasst die Spiele automatisch und rechnet am Monatsende per
            Rechnung ab. Wähle oben eine Mannschaft und stelle deine Anfrage direkt auf
            ihrem Profil.
          </p>
        </div>
      </section>

      <p className="mt-8 px-4 text-center text-xs text-brand-night-navy/60">
        Performance-Sponsoring im Amateurfußball ·{" "}
        <a href="/" className="underline hover:text-accent-dark">
          KickPact
        </a>
      </p>
    </main>
  );
}
