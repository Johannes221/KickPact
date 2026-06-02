import { assertTeamPageAccess } from "@/lib/auth/scope";

export const metadata = { title: "Saison-Recap · KickPact" };

/**
 * Saison-Recap-Seite (Feature 3, v1): zeigt eine Vorschau des teilbaren
 * 9:16-Standbilds und bietet den Download an. Das Bild selbst wird von
 * /api/teams/[teamId]/recap-image (next/og) generiert.
 */
export default async function RecapPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  await assertTeamPageAccess(slug, teamId, "viewer");

  const src = `/api/teams/${teamId}/recap-image`;

  return (
    <div className="mx-auto max-w-2xl space-y-5 md:space-y-6">
      <div>
        <h1 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Saison-Recap
        </h1>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Eure Saison als teilbares Bild — lad es runter und post es auf
          Instagram, WhatsApp &amp; Co. Zeigt, was eure Mannschaft erspielt hat.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="overflow-hidden rounded-2xl border border-brand-neutral/40 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Saison-Recap deiner Mannschaft"
            width={300}
            height={533}
            className="block h-auto w-[300px]"
          />
        </div>
        <a
          href={src}
          download="kickpact-saison-recap.png"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Bild herunterladen
        </a>
        <p className="text-xs text-brand-night-navy/50 text-center">
          Tipp: Auf dem Handy lange auf das Bild tippen → „Bild sichern" → direkt
          in deiner Story teilen.
        </p>
      </div>
    </div>
  );
}
