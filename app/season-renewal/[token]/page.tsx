import { inspectSeasonRenewalToken } from "@/lib/actions/season-renewal";
import { RenewalChoice } from "./_components/renewal-choice";

export const metadata = {
  title: "Pledge verlängern · KickPact",
  robots: { index: false, follow: false }
};

/**
 * Plan 3 Teil 2 — Public Saison-Renewal Page (kein Login).
 *
 * URL-Format: `/season-renewal/<HMAC-Token>?action=renew|decline`
 *
 * Flow:
 *   1. Token → inspectSeasonRenewalToken liefert Sponsor + Team-Kontext
 *   2. RenewalChoice rendert 2 Buttons + ggf. Status (already cloned)
 *   3. User klickt → Server-Action confirmSeasonRenewal / decline
 */
export default async function SeasonRenewalPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const { action } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display font-black text-3xl text-brand-night-navy">
          Pledge-Verlängerung
        </h1>
        <p className="mt-4 text-sm text-brand-night-navy/70">
          Dieser Link ist unvollständig. Bitte nutze den vollständigen Link aus
          deiner E-Mail.
        </p>
      </main>
    );
  }

  const inspection = await inspectSeasonRenewalToken(token);

  if (!inspection.ok) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display font-black text-3xl text-brand-night-navy">
          Pledge-Verlängerung
        </h1>
        <div className="mt-6 rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
          {inspection.error}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display font-black text-3xl text-brand-night-navy">
        Pledge verlängern?
      </h1>

      <div className="mt-6 rounded-lg border border-brand-neutral/40 bg-white p-4 space-y-2 text-sm">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Deine Pledge
        </div>
        <p className="text-brand-night-navy">
          Hi <strong>{inspection.sponsorName}</strong>, deine Pledge für{" "}
          <strong>{inspection.teamName}</strong> bei{" "}
          <strong>{inspection.clubName}</strong> läuft mit der Saison{" "}
          <strong>{inspection.currentSaison}</strong> aus.
        </p>
        <p className="text-brand-night-navy/70">
          Möchtest du auf die Saison{" "}
          <strong>{inspection.nextSaison}</strong> verlängern? Wir kopieren alle
          deine bisherigen Trigger + Beträge 1:1.
        </p>
      </div>

      <RenewalChoice
        token={token}
        initialAction={action === "renew" || action === "decline" ? action : undefined}
        nextSaison={inspection.nextSaison}
        nextSeasonTeamExists={inspection.nextSeasonTeamExists}
        alreadyCloned={inspection.alreadyCloned}
      />
    </main>
  );
}
