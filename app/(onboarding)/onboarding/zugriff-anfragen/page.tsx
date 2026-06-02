import Link from "next/link";
import { redirect } from "next/navigation";
import { Hourglass, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getAccessRequestPageData } from "@/lib/db/queries/membership-requests";
import { RequestForm } from "./_components/request-form";

export const metadata = { title: "Zugriff anfragen · KickPact" };

export default async function ZugriffAnfragenPage({
  searchParams
}: {
  searchParams: Promise<{ clubSlug?: string; teamId?: string }>;
}) {
  const { clubSlug, teamId } = await searchParams;
  if (!clubSlug) redirect("/onboarding");

  const user = await requireUser();

  const data = await getAccessRequestPageData(user.id, clubSlug, teamId);
  if (!data) redirect("/onboarding");
  const { club, teamRows, fixedTeam, pendingReq, alreadyMember } = data;

  const targetLabel = fixedTeam ? fixedTeam.name : club.name;

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Zugriff anfragen
        </div>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          {fixedTeam ? `${fixedTeam.name}` : club.name}
        </h1>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          {fixedTeam
            ? "Diese Mannschaft wird schon bei KickPact betreut. Stell eine Anfrage — die Admins entscheiden, ob du Zugriff bekommst."
            : "Dieser Verein ist schon bei KickPact. Stell eine Anfrage — die Admins entscheiden, ob du Zugriff bekommst."}
        </p>
      </div>

      {alreadyMember ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                Du bist bereits dabei
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/70">
                Du hast schon Zugriff auf {targetLabel}. Kein erneuter Antrag
                nötig.
              </p>
              <Link
                href="/select-role"
                className="mt-3 inline-flex items-center text-sm font-semibold text-accent hover:underline"
              >
                Zu meinen Rollen →
              </Link>
            </div>
          </div>
        </div>
      ) : pendingReq ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-start gap-3">
            <Hourglass className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" aria-hidden />
            <div>
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                Zugriff bereits angefragt
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/70">
                Deine Anfrage für {targetLabel} liegt schon bei den Admins. Du
                musst nichts weiter tun — sobald sie freigegeben ist, taucht die
                Mannschaft in deinem Rollen-Menü auf.
              </p>
              <Link
                href="/select-role"
                className="mt-3 inline-flex items-center text-sm font-semibold text-accent hover:underline"
              >
                Zu meinen Rollen →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <RequestForm
          clubSlug={club.slug}
          clubName={club.name}
          teams={teamRows}
          fixedTeam={fixedTeam}
        />
      )}
    </main>
  );
}
