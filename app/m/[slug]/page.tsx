import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";
import { getPublicTeamInsights } from "@/lib/db/queries/team-public-insights";
import {
  getPreviousSeasonDisplay,
  listAvailableSeasonsForTeam,
  listMatchesForTeam,
  type PreviousSeasonDisplay
} from "@/lib/db/queries/matches";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { saisonLabel } from "@/lib/utils/saison";
import { SeasonSwitcher } from "@/components/shared/season-switcher";
import { ProfileHero } from "./_components/profile-hero";
import { InsightsStrip } from "./_components/insights-strip";
import { GalleryStrip } from "./_components/gallery-strip";
import { SponsorInquiryForm } from "./_components/sponsor-inquiry-form";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ saison?: string }>;
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicTeamProfileBySlug(slug);
  // Kein eigener Brand-Suffix — das Layout-Template (`%s – KickPact`) hängt
  // die Marke an. Vorher entstand „… | KickPact – KickPact".
  if (!profile) return { title: "Profil nicht gefunden" };
  const title = `${profile.displayName} – Sponsoring`;
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
      images: [profile.coverUrl ? `${base}${profile.coverUrl}` : `${base}/brand/team-fallback.jpg`]
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
export default async function PublicTeamProfilePage({
  params,
  searchParams
}: PageProps) {
  const { slug } = await params;
  const { saison: saisonParam } = (await searchParams) ?? {};
  const profile = await getPublicTeamProfileBySlug(slug);
  if (!profile) notFound();

  const insights = profile.showInsights
    ? await getPublicTeamInsights(
        profile.teamId,
        profile.teamName,
        profile.clubName
      )
    : null;
  // „Letzte Saison": Vorsaison-Historie (Backfill), solange die aktuelle
  // Saison < 3 gespielte Spiele hat. Wie die Insights nur sichtbar, wenn die
  // Mannschaft Performance-Daten öffentlich zeigt (showInsights).
  const previousSeason = profile.showInsights
    ? await getPreviousSeasonDisplay(profile.teamId)
    : null;
  // W1.3 Saison-Switcher: Spiele-Sektion mit wählbarer ANZEIGE-Saison
  // (?saison=…), Default = aktuelle team.saison. Nur mit showInsights.
  const availableSeasons = profile.showInsights
    ? await listAvailableSeasonsForTeam(profile.teamId)
    : [];
  const selectedSaison =
    saisonParam && availableSeasons.includes(saisonParam)
      ? saisonParam
      : profile.saison;
  const seasonMatches = profile.showInsights
    ? await listMatchesForTeam(profile.teamId, 50, { saison: selectedSaison })
    : [];
  // Jüngste verfügbare Saison VOR der aktuellen (EmptyState-Sprung).
  const previousSeasonView =
    availableSeasons.find((s) => s < profile.saison) ?? null;
  const verified = !!(profile.teamVerifiedAt || profile.clubVerifiedAt);

  return (
    <main className="mx-auto max-w-screen-sm bg-white pb-12">
      <ProfileHero
        displayName={profile.displayName}
        clubName={profile.clubName}
        clubSlug={profile.clubSlug}
        league={profile.league}
        clubOrt={profile.clubOrt}
        saison={profile.saison}
        verified={verified}
        coverUrl={profile.coverUrl}
        logoUrl={profile.logoUrl}
      />

      {insights && <InsightsStrip insights={insights} />}

      {/* Teaser (Phase 3): Bilanz der Vorsaison — die Vollanzeige übernimmt
          der Saison-Switcher in der Spiele-Sektion (W1.3). */}
      {previousSeason && selectedSaison === profile.saison && (
        <PreviousSeasonSection
          data={previousSeason}
          switcherHref={`/m/${slug}?saison=${previousSeason.prevSaison}#spiele`}
        />
      )}

      {/* Spiele-Sektion mit Saison-Switcher (W1.3) — nur wenn es überhaupt
          Spiele (irgendeiner Saison) gibt. */}
      {profile.showInsights &&
        (seasonMatches.length > 0 || availableSeasons.length > 1) && (
          <MatchesSection
            slug={slug}
            matches={seasonMatches}
            teamNames={[profile.teamName, profile.clubName]}
            selectedSaison={selectedSaison}
            currentSaison={profile.saison}
            availableSeasons={availableSeasons}
            previousSeasonView={previousSeasonView}
          />
        )}

      <GalleryStrip images={profile.gallery} teamName={profile.displayName} />

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

      <p className="mt-8 px-4 text-center text-xs text-brand-night-navy/60">
        Performance-Sponsoring im Amateurfußball ·{" "}
        <a href="/" className="underline hover:text-accent-dark">
          KickPact
        </a>
      </p>
    </main>
  );
}

/**
 * „Letzte Saison"-Teaser fürs öffentliche Profil: S/U/N-Bilanz der Vorsaison.
 * Die vollständigen Spiele zeigt die Spiele-Sektion über den Saison-Switcher
 * (W1.3) — der Block verlinkt nur noch dorthin. Server-rendered, mobil.
 */
function PreviousSeasonSection({
  data,
  switcherHref
}: {
  data: PreviousSeasonDisplay;
  /** Sprung in die Vorsaison-Ansicht der Spiele-Sektion (Saison-Switcher). */
  switcherHref: string;
}) {
  const { record } = data;
  return (
    <section className="px-4 pt-5" aria-label={`Letzte Saison ${data.prevSaisonLabel}`}>
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
        Letzte Saison ({data.prevSaisonLabel})
      </div>
      <div className="rounded-2xl border border-brand-night-navy/10 bg-white p-4">
        <p className="text-sm font-semibold text-brand-night-navy">
          {record.spiele} Spiele · {record.siege} S / {record.unentschieden} U /{" "}
          {record.niederlagen} N · Tore {record.torePlus}:{record.toreMinus}
        </p>
        <Link
          href={switcherHref}
          className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:underline"
        >
          Alle Spiele {data.prevSaisonLabel} ansehen →
        </Link>
      </div>
    </section>
  );
}

/**
 * Spiele-Sektion mit Saison-Switcher (W1.3): kompakte Ergebnis-Zeilen der
 * gewählten ANZEIGE-Saison. Leere aktuelle Saison → Hinweis + Sprung in die
 * Vorsaison. Server-rendered, mobil.
 */
function MatchesSection({
  slug,
  matches,
  teamNames,
  selectedSaison,
  currentSaison,
  availableSeasons,
  previousSeasonView
}: {
  slug: string;
  matches: Awaited<ReturnType<typeof listMatchesForTeam>>;
  teamNames: string[];
  selectedSaison: string;
  currentSaison: string;
  availableSeasons: string[];
  previousSeasonView: string | null;
}) {
  return (
    <section id="spiele" className="px-4 pt-5" aria-label="Spiele">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
        Spiele ({saisonLabel(selectedSaison)})
      </div>
      <div className="rounded-2xl border border-brand-night-navy/10 bg-white p-4">
        <SeasonSwitcher
          className="mb-3"
          seasons={availableSeasons}
          current={selectedSaison}
          hrefFor={(s) =>
            s === currentSaison ? `/m/${slug}#spiele` : `/m/${slug}?saison=${s}#spiele`
          }
        />
        {matches.length === 0 ? (
          <p className="text-xs text-brand-night-navy/70">
            Noch keine Spiele in der Saison {saisonLabel(selectedSaison)}.{" "}
            {previousSeasonView && (
              <Link
                href={`/m/${slug}?saison=${previousSeasonView}#spiele`}
                className="font-semibold text-accent hover:underline"
              >
                Saison {saisonLabel(previousSeasonView)} ansehen →
              </Link>
            )}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {matches.map((m) => {
              const isHeim = detectTeamSide(teamNames, m.heimName) === "heim";
              const gF = isHeim ? (m.ergebnisHeim ?? null) : (m.ergebnisGast ?? null);
              const gA = isHeim ? (m.ergebnisGast ?? null) : (m.ergebnisHeim ?? null);
              const dot =
                gF === null
                  ? "bg-neutral-300"
                  : gF > (gA ?? 0)
                    ? "bg-emerald-500"
                    : gF < (gA ?? 0)
                      ? "bg-rose-400"
                      : "bg-amber-400";
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-xs text-brand-night-navy/80"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                  <span className="min-w-0 truncate text-right" title={m.heimName}>
                    {abbreviateTeamName(m.heimName)}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-brand-night-navy">
                    {m.ergebnisHeim ?? "—"}:{m.ergebnisGast ?? "—"}
                  </span>
                  <span className="min-w-0 truncate" title={m.gastName}>
                    {abbreviateTeamName(m.gastName)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
