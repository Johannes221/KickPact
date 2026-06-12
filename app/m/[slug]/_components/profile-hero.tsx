import Link from "next/link";
import { isPlausibleLeague } from "@/lib/utils/league";

interface HeroProps {
  displayName: string;
  clubName: string;
  /**
   * Slug fürs öffentliche Vereinsprofil /v/[slug] — wenn gesetzt (Verein
   * verifiziert), wird der Vereinsname verlinkt.
   */
  clubSlug?: string | null;
  league: string | null;
  clubOrt: string | null;
  saison: string;
  verified: boolean;
  coverUrl: string | null;
  logoUrl: string | null;
}

/**
 * Dunkler „Stadion"-Hero mit Cover-Foto oder CI-grünem Streifen-Platzhalter.
 * Logo-Badge, Name, Meta-Zeile (Verein · Liga · Ort) und Saison-Chip.
 */
export function ProfileHero({
  displayName,
  clubName,
  clubSlug,
  league,
  clubOrt,
  saison,
  verified,
  coverUrl,
  logoUrl
}: HeroProps) {
  // Liga nur zeigen, wenn plausibel (alte Crawls speicherten teils "So").
  const metaRest = [isPlausibleLeague(league) ? league : null, clubOrt]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="relative h-64 overflow-hidden bg-brand-night-navy">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/brand/team-fallback.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/40 to-transparent" />
      <span className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
        Saison {saison}
      </span>
      <div className="absolute inset-x-4 bottom-4">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent text-xl font-black text-brand-night-navy shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl ?? "/brand/team-crest-fallback.png"}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-white">
          {displayName}
        </h1>
        <p className="text-xs text-brand-neutral">
          {clubSlug ? (
            <Link
              href={`/v/${clubSlug}`}
              className="underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              {clubName}
            </Link>
          ) : (
            clubName
          )}
          {metaRest ? ` · ${metaRest}` : null}
          {verified && (
            <>
              {" "}
              · <span className="font-semibold text-accent">✔ Verifiziert</span>
            </>
          )}
        </p>
      </div>
    </header>
  );
}
