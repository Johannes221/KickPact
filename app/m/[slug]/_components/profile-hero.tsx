interface HeroProps {
  displayName: string;
  clubName: string;
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
  league,
  clubOrt,
  saison,
  verified,
  coverUrl,
  logoUrl
}: HeroProps) {
  const meta = [clubName, league, clubOrt].filter(Boolean).join(" · ");
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
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,#01C457 0 2px,transparent 2px 20px)"
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/40 to-transparent" />
      <span className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
        Saison {saison}
      </span>
      <div className="absolute inset-x-4 bottom-4">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent text-xl font-black text-brand-night-navy shadow-lg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-full w-full object-cover"
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-white">
          {displayName}
        </h1>
        <p className="text-xs text-brand-neutral">
          {meta}
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
