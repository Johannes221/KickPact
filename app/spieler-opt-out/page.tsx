import { inspectPlayerOptOutToken } from "@/lib/actions/team-lifecycle";
import { OptOutConfirm } from "./_components/opt-out-confirm";

export const metadata = {
  title: "Spieler-Opt-out · KickPact",
  robots: { index: false, follow: false }
};

/**
 * Public Spieler-Opt-out-Page.
 *
 * Aufruf: `/spieler-opt-out?token=<HMAC-Token>` (kein Login nötig)
 *
 * Flow:
 *   1. Token wird server-side inspiziert (zeigt Spielername + Team)
 *   2. User bestätigt → POST via Server-Action `confirmPlayerOptOut`
 *   3. Nach Bestätigung: Anonymisierungs-Confirmation + Hinweis Kontakt
 */
export default async function SpielerOptOutPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display font-black text-3xl text-brand-night-navy">
          Spieler-Opt-out
        </h1>
        <p className="mt-4 text-sm text-brand-night-navy/70">
          Dieser Link ist unvollständig. Bitte nutze den vollständigen Link aus
          deiner E-Mail oder bitte deinen Verein um einen neuen.
        </p>
      </main>
    );
  }

  const inspection = await inspectPlayerOptOutToken(token);

  if (!inspection.ok) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display font-black text-3xl text-brand-night-navy">
          Spieler-Opt-out
        </h1>
        <div className="mt-6 rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
          {inspection.error}
        </div>
        <p className="mt-4 text-sm text-brand-night-navy/60">
          Bitte den Verein um einen neuen Link, falls dieser nicht mehr
          funktioniert.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display font-black text-3xl text-brand-night-navy">
        Spieler-Opt-out
      </h1>

      {inspection.alreadyBlocked ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            Du bist bereits anonymisiert. Dein Name erscheint in KickPact als
            „Anonymisiert" und der Crawler ignoriert Updates zu dir.
          </div>
          <p className="text-sm text-brand-night-navy/60">
            Falls du es dir anders überlegst: kontaktiere{" "}
            <strong>{inspection.clubName}</strong> direkt — wir speichern keine
            Kontaktdaten der Spieler.
          </p>
        </div>
      ) : (
        <OptOutConfirm
          token={token}
          playerName={inspection.playerName}
          teamName={inspection.teamName}
          clubName={inspection.clubName}
        />
      )}
    </main>
  );
}
