import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listPledgesForSponsor } from "@/lib/db/queries/pledges";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Meine Wetten · KickPact" };

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function PledgeListPage() {
  const user = await requireUser();

  const sponsor = await findSponsorForUser(user.id);
  const myPledges = sponsor ? await listPledgesForSponsor(sponsor.id) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        className="md:hidden"
        title="Meine Wetten"
        subtitle="Hier siehst du alle deine aktiven und vergangenen Sponsoring-Versprechen."
      />
      <div className="hidden md:block">
        <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-brand-night-navy">
          Meine <span className="text-accent">Wetten</span>
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
          Hier siehst du alle deine aktiven und vergangenen Sponsoring-Versprechen.
        </p>
      </div>

      <div className="mt-6 md:mt-10 space-y-3">
        {myPledges.length === 0 ? (
          <Card className="border-brand-neutral/40">
            <CardContent className="p-6 text-center text-brand-night-navy/60 text-sm">
              <p className="font-semibold text-brand-night-navy">Noch keine Wetten.</p>
              <p className="mt-1">
                Du brauchst einen Einladungslink deines Vereins, um eine Wette einzurichten.
                Frag deinen Ansprechpartner im Verein nach dem Link.
              </p>
            </CardContent>
          </Card>
        ) : (
          myPledges.map((p) => (
            <Link
              key={p.id}
              href={`/sponsor/pledge/${p.id}`}
              className="block rounded-xl bg-white shadow-ios-card p-4 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-brand-night-navy">{p.teamName}</div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5">{p.clubName}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-brand-night-navy/60">
                <span>
                  {p.startsAt.toLocaleDateString("de-DE")} –{" "}
                  {p.endsAt.toLocaleDateString("de-DE")}
                </span>
                {p.monthlyCapCents && (
                  <span>Cap: {eur(p.monthlyCapCents)} / Monat</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="mt-8 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
        <strong className="text-brand-night-navy">Neue Wette einrichten?</strong>
        <p className="mt-1">
          Wetten werden über den Einladungslink eines Vereins erstellt. Bitte deinen
          Ansprechpartner im Verein, dir den Link zu schicken.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:  { label: "Aktiv",        cls: "bg-emerald-100 text-emerald-800" },
    paused:  { label: "Pausiert",     cls: "bg-amber-100 text-amber-800" },
    ended:   { label: "Beendet",      cls: "bg-neutral-100 text-neutral-600" },
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " + entry.cls}>
      {entry.label}
    </span>
  );
}
