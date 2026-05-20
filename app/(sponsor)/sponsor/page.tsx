import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, sponsors, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function SponsorDashboard() {
  const user = await requireUser();
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (!sponsor) {
    return (
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6">
        <p className="text-brand-night-navy">Du hast noch kein Sponsor-Profil.</p>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          Folge einer Einladung von einem Verein, um zu starten.
        </p>
      </div>
    );
  }

  const myPledges = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      teamName: teams.name,
      clubName: clubs.name,
      endsAt: pledges.endsAt,
      monthlyCapCents: pledges.monthlyCapCents
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.sponsorId, sponsor.id));

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
            Deine Pledges
          </h2>
          <span className="text-sm text-brand-night-navy/60">
            {sponsor.displayName} ·{" "}
            <span className="capitalize">{sponsor.type}</span>
          </span>
        </div>
        {myPledges.length === 0 ? (
          <div className="mt-4 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6">
            <p className="text-brand-night-navy/70">Du hast noch keinen Pledge.</p>
            <p className="mt-2 text-sm text-brand-night-navy/60">
              Öffne einen Einladungslink von einem Verein, um einen Pledge anzulegen.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {myPledges.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/sponsor/pledge/${p.id}`}
                  className="block rounded-lg border border-brand-neutral/40 bg-white p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-brand-night-navy">{p.teamName}</div>
                      <div className="text-xs text-brand-night-navy/40 mt-0.5">{p.clubName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-widest font-semibold text-accent-dark">
                        {p.status}
                      </div>
                      <div className="text-xs text-brand-night-navy/40 mt-0.5">
                        bis {p.endsAt.toLocaleDateString("de-DE")}
                      </div>
                    </div>
                  </div>
                  {p.monthlyCapCents && (
                    <div className="mt-2 text-xs text-brand-night-navy/50">
                      Cap: {eur(p.monthlyCapCents)} / Monat
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6">
        <p className="text-sm text-brand-night-navy/70">
          Approval-Inbox für Spezial-Events und Monats-Rechnungen kommen in Plan 3 + 4.
        </p>
      </div>
    </div>
  );
}
