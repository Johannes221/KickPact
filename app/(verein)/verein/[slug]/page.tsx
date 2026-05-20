import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { teams, clubs, sponsorInvitations } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ClubDashboard({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) return null;

  const teamRows = await db.select().from(teams).where(eq(teams.clubId, club.id));
  const invitations = await db
    .select()
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.createdByUserId, club.id))
    .limit(10);

  return (
    <div className="space-y-6 md:space-y-10">
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Mannschaften" value={String(teamRows.length)} />
        <StatCard label="Aktive Sponsoren" value="—" hint="kommt mit Plan 3" />
        <StatCard label="Spiele ausgewertet" value="—" hint="kommt mit Plan 3" />
      </div>

      <section>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Mannschaften
        </h2>
        <ul className="mt-4 space-y-2">
          {teamRows.length === 0 ? (
            <li className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
              Noch keine Mannschaften — kommt eigentlich nicht vor (Onboarding legt eine an).
            </li>
          ) : (
            teamRows.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-brand-neutral/40 bg-white p-4"
              >
                <div className="font-semibold text-brand-night-navy">{t.name}</div>
                <div className="text-xs text-brand-night-navy/40 mt-0.5">Saison {t.saison}</div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Einladungslinks
        </h2>
        {invitations.length === 0 ? (
          <p className="mt-3 text-sm text-brand-night-navy/60">Keine Einladungen erstellt.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {invitations.map((i) => (
              <li
                key={i.id}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3 font-mono"
              >
                <span className="text-brand-night-navy/70 truncate text-xs">
                  /einladung/{i.token}
                </span>
                <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6">
        <p className="text-sm text-brand-night-navy/70">
          Match-Detail, Manual-Event-Editor, Approval-Übersicht und Monats-Rechnungen
          kommen in Plan 3 + 4.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-brand-neutral/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {value}
        </div>
        {hint && <div className="text-xs text-brand-night-navy/40 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
