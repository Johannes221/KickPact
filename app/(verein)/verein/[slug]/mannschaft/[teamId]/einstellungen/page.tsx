import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getDocumentSignedUrl } from "@/lib/storage/documents";
import { TeamStammdatenForm } from "./_components/team-stammdaten-form";
import { TeamLifecyclePanel } from "./_components/team-lifecycle-panel";
import { EinstellungenForm } from "../../../einstellungen/_components/einstellungen-form";

export const metadata = { title: "Einstellungen · Mannschaft · KickPact" };

/**
 * Team-Einstellungen.
 *
 * Drei Sektionen:
 *   - Stammdaten (Name + Logo)
 *   - Lifecycle (Deaktivieren / Reaktivieren)
 *   - Sub-Bereiche (Saison-Ergebnis)
 */
export default async function TeamEinstellungenPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "trainer");

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      isActive: teams.isActive,
      logoUrl: teams.logoUrl,
      saison: teams.saison
    })
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

  // Logo-URL ggf. via signed URL für R2 auflösen
  let logoDisplayUrl: string | null = null;
  if (team.logoUrl) {
    try {
      logoDisplayUrl = await getDocumentSignedUrl(team.logoUrl, 3600);
    } catch {
      logoDisplayUrl = null;
    }
  }

  // Rechnungs-/Zahlungsdaten leben auf der club-Row (eine Billing-Entität pro
  // Club). Bei Mannschafts-Lizenz ist die Mannschaft diese Entität — daher
  // hier im Mannschafts-Kontext editierbar, statt im Vereins-Dashboard.
  const [clubData] = await db
    .select({
      name: clubs.name,
      ort: clubs.ort,
      addressJson: clubs.addressJson,
      isSmallBusiness: clubs.isSmallBusiness,
      taxId: clubs.taxId,
      iban: clubs.iban
    })
    .from(clubs)
    .where(eq(clubs.id, club.id))
    .limit(1);
  const billingAddr = clubData?.addressJson as
    | { street?: string; zip?: string; city?: string }
    | null
    | undefined;

  const base = `/verein/${slug}/mannschaft/${teamId}/einstellungen`;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Einstellungen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Konfiguration für {team.name}.
        </p>
      </div>

      {/* Stammdaten */}
      <section className="space-y-4 rounded-2xl border border-brand-neutral/40 bg-white p-5">
        <header>
          <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
            Stammdaten
          </h3>
          <p className="mt-0.5 text-sm text-brand-night-navy/60">
            Name und Logo der Mannschaft.
          </p>
        </header>
        <TeamStammdatenForm
          teamId={team.id}
          initialName={team.name}
          logoUrl={logoDisplayUrl}
        />
      </section>

      {/* Rechnungs- & Zahlungsdaten (Absender, Adresse, Steuer, IBAN).
          Erscheinen auf den PDF-Rechnungen an die Sponsoren. */}
      {clubData && (
        <section className="space-y-4">
          <header>
            <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
              Rechnungs- &amp; Zahlungsdaten
            </h3>
            <p className="mt-0.5 text-sm text-brand-night-navy/60">
              Absender, Adresse, Steuer-Status und IBAN für die Rechnungen an
              deine Sponsoren.
            </p>
          </header>
          <EinstellungenForm
            slug={slug}
            variant="mannschaft"
            defaultValues={{
              name: clubData.name,
              ort: clubData.ort ?? "",
              street: billingAddr?.street ?? "",
              zip: billingAddr?.zip ?? "",
              city: billingAddr?.city ?? "",
              isSmallBusiness: clubData.isSmallBusiness,
              taxId: clubData.taxId ?? "",
              iban: clubData.iban ?? ""
            }}
          />
        </section>
      )}

      {/* Lifecycle */}
      <section className="space-y-4 rounded-2xl border border-brand-neutral/40 bg-white p-5">
        <header>
          <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
            Lifecycle
          </h3>
          <p className="mt-0.5 text-sm text-brand-night-navy/60">
            Deaktiviere die Mannschaft, wenn sie nicht mehr aktiv ist.
            Der Crawler überspringt sie und neue Pacts sind blockiert.
          </p>
        </header>
        <TeamLifecyclePanel teamId={team.id} isActive={team.isActive} />
      </section>

      {/* Weitere Sub-Bereiche */}
      <section>
        <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy mb-3">
          Weitere Bereiche
        </h3>
        <ul className="space-y-3">
          <li>
            <Link
              href={`${base}/saison`}
              className="block rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
                    Saison-Ergebnis manuell setzen
                  </h4>
                  <p className="mt-1 text-sm text-brand-night-navy/60">
                    Endstand, Auf-/Abstieg und Pokal-Runde eintragen. Nur nötig,
                    wenn der Fußball.de-Crawler keine Daten liefert.
                  </p>
                </div>
                <span className="text-brand-night-navy/30" aria-hidden>
                  →
                </span>
              </div>
            </Link>
          </li>
          <li>
            <Link
              href={`/verein/${slug}/mannschaft/${teamId}/spieler`}
              className="block rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
                    Spieler & DSGVO-Opt-out
                  </h4>
                  <p className="mt-1 text-sm text-brand-night-navy/60">
                    Spieler-Roster verwalten, Opt-out-Links generieren,
                    Spieler anonymisieren.
                  </p>
                </div>
                <span className="text-brand-night-navy/30" aria-hidden>
                  →
                </span>
              </div>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
