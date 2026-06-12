import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getClubIdForTeam } from "@/lib/db/queries/pledges";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { getTeamDataCoverage } from "@/lib/db/queries/crawler";
import type { Coverage } from "@/lib/triggers/coverage";
import { canCreateSeasonWagerPure } from "@/lib/billing/wager-window";
import {
  getActiveSeason,
  getSeasonWindowForTeam
} from "@/lib/billing/wager-window-server";
import { PledgeBuilder } from "./_components/pledge-builder";

export const metadata = { title: "Sponsoring einrichten · KickPact" };

export default async function NewPledgePage({
  searchParams
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  await requireUser();
  const { invitation: invitationToken } = await searchParams;

  // A7 (Audit 2026-06-11): Saison-Trigger-Window (Cutoff 5. Spieltag) schon in
  // Step 2 kommunizieren statt erst am Wizard-Ende serverseitig abzulehnen.
  // createPledge prüft weiterhin hart — das hier ist UX.
  // W1.2: Quelle ist die TEAM-Saison der Einladung (wie in createPledge);
  // nur ohne auflösbare Mannschaft fällt der Status auf getActiveSeason zurück.
  const now = new Date();
  let seasonWindowOpen = canCreateSeasonWagerPure(await getActiveSeason(now), now);

  // Read-Only-Gate prüfen (best-effort): wenn wir den Token zu einer Mannschaft
  // auflösen können, holen wir das Gate und blocken UI-seitig direkt mit Banner.
  // Server-Action `createPledge` enforced das Gate nochmal hart, das hier ist UX.
  let gateBanner: React.ReactNode = null;
  // Daten-Coverage der Mannschaft → steuert, welche Wett-Typen der Builder
  // anbietet (Spieler-Wetten nur bei `full`). `createPledge` enforced das Gate
  // server-seitig hart; dies hier ist Komfort. NULL = unklassifiziert → alles.
  let dataCoverage: Coverage | null = null;
  if (invitationToken) {
    const invitation = await findInvitationByToken(invitationToken);
    if (invitation && invitation.teamId) {
      seasonWindowOpen = canCreateSeasonWagerPure(
        await getSeasonWindowForTeam(invitation.teamId, now),
        now
      );
      dataCoverage = await getTeamDataCoverage(invitation.teamId);
      const clubId = await getClubIdForTeam(invitation.teamId);
      if (clubId) {
        const gate = await getSubscriptionGate(clubId);
        if (gate.isReadOnly) {
          gateBanner = (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5 md:p-6">
              <p className="text-sm md:text-base text-rose-900">
                <strong>Diese Mannschaft ist aktuell pausiert.</strong> Sponsoring
                ist wieder möglich, sobald die Mannschaft das Abo reaktiviert hat.
              </p>
              <Link
                href="/"
                className="mt-3 inline-flex items-center text-sm font-semibold text-rose-900 underline"
              >
                Zur Startseite →
              </Link>
            </div>
          );
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display font-bold text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Sponsoring <span className="text-accent">einrichten</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
        Wähle Ereignisse, lege Beträge fest. Wir zeigen dir live, worauf du dich maximal einlässt.
      </p>
      <div className="mt-6 md:mt-10">
        {gateBanner ?? (
          <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
            <PledgeBuilder
              dataCoverage={dataCoverage}
              seasonWindowOpen={seasonWindowOpen}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
