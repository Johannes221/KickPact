import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { PledgeBuilder } from "./_components/pledge-builder";

export const metadata = { title: "Pledge anlegen · KickPact" };

export default async function NewPledgePage({
  searchParams
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  await requireUser();
  const { invitation: invitationToken } = await searchParams;

  // Read-Only-Gate prüfen (best-effort): wenn wir den Token zu einer Mannschaft
  // auflösen können, holen wir das Gate und blocken UI-seitig direkt mit Banner.
  // Server-Action `createPledge` enforced das Gate nochmal hart, das hier ist UX.
  let gateBanner: React.ReactNode = null;
  if (invitationToken) {
    const invitation = await findInvitationByToken(invitationToken);
    if (invitation) {
      const [teamRow] = await db
        .select({ clubId: teams.clubId })
        .from(teams)
        .where(eq(teams.id, invitation.teamId))
        .limit(1);
      if (teamRow) {
        const gate = await getSubscriptionGate(teamRow.clubId);
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
      <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Pledge <span className="text-accent">aufbauen</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
        Wähle Trigger, leg Beträge fest. Wir zeigen dir live, worauf du dich maximal einlässt.
      </p>
      <div className="mt-6 md:mt-10">
        {gateBanner ?? (
          <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
            <PledgeBuilder />
          </Suspense>
        )}
      </div>
    </div>
  );
}
