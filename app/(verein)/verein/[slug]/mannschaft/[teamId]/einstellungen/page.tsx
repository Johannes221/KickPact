import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";

export const metadata = { title: "Einstellungen · Mannschaft · KickPact" };

/**
 * Team-Einstellungen Index. Aktuell eine Liste an Sub-Bereichen — der erste ist
 * die manuelle Saison-Ergebnis-Pflege (Fallback wenn Crawler keine Daten liefert).
 * Weitere Sub-Bereiche (z.B. Trainer-Rollen, Lizenzdetails) folgen.
 */
export default async function TeamEinstellungenPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertClubAccess(slug, "admin");

  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const base = `/verein/${slug}/mannschaft/${teamId}/einstellungen`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Einstellungen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Konfiguration für {team.name}.
        </p>
      </div>

      <ul className="space-y-3">
        <li>
          <Link
            href={`${base}/saison`}
            className="block rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
                  Saison-Ergebnis manuell setzen
                </h3>
                <p className="mt-1 text-sm text-brand-night-navy/60">
                  Endstand, Auf-/Abstieg und Pokal-Runde eintragen. Nur nötig, wenn der
                  Fußball.de-Crawler keine Daten liefert.
                </p>
              </div>
              <span className="text-brand-night-navy/30" aria-hidden>
                →
              </span>
            </div>
          </Link>
        </li>
      </ul>
    </div>
  );
}
