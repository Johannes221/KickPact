import Link from "next/link";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { pledges } from "@/lib/db/schema/pledges";
import { charges } from "@/lib/db/schema/charges";

export const metadata = { title: "Mannschaften · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function MannschaftenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  // Load all active teams
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      isActive: teams.isActive
    })
    .from(teams)
    .where(eq(teams.clubId, club.id))
    .orderBy(teams.name);

  if (teamRows.length === 0) {
    return (
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
        Noch keine Mannschaft angelegt. → <Link href={`/verein/${slug}/einstellungen`} className="text-accent font-semibold">Mannschaft hinzufügen</Link>
      </div>
    );
  }

  const teamIds = teamRows.map((t) => t.id);

  // 30-day window for "letzte Spiele" stats
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Per-team aggregates
  const [activePledgeCounts, recentChargeCents, recentMatchCounts] = await Promise.all([
    db
      .select({
        teamId: pledges.teamId,
        n: sql<number>`count(*)::int`
      })
      .from(pledges)
      .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")))
      .groupBy(pledges.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.n)]))),
    db
      .select({
        teamId: pledges.teamId,
        s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int`
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(inArray(pledges.teamId, teamIds), gte(charges.createdAt, monthAgo)))
      .groupBy(pledges.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.s)]))),
    db
      .select({
        teamId: matches.teamId,
        n: sql<number>`count(*)::int`
      })
      .from(matches)
      .where(and(inArray(matches.teamId, teamIds), gte(matches.datum, monthAgo)))
      .groupBy(matches.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.n)])))
  ]);

  const activeCount = teamRows.filter((t) => t.isActive).length;
  const inactiveCount = teamRows.length - activeCount;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/verein/${slug}`}
            className="text-sm text-brand-night-navy/60 hover:text-accent"
          >
            ← Dashboard
          </Link>
          <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
            Mannschaften
          </h2>
          <p className="text-sm text-brand-night-navy/60">
            {activeCount} aktive{activeCount === 1 ? "" : ""}
            {inactiveCount > 0 && <> · {inactiveCount} inaktiv</>}
          </p>
        </div>
        <Link
          href={`/verein/${slug}/mannschaften/neu`}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
        >
          + Mannschaft hinzufügen
        </Link>
      </div>

      <ul className="space-y-3">
        {teamRows.map((t) => {
          const pledgeCount = activePledgeCounts.get(t.id) ?? 0;
          const cents30d = recentChargeCents.get(t.id) ?? 0;
          const matches30d = recentMatchCounts.get(t.id) ?? 0;

          return (
            <li key={t.id}>
              <Link
                href={`/verein/${slug}/mannschaft/${t.id}`}
                className={
                  "block rounded-2xl border bg-white p-4 md:p-5 transition-all hover:border-accent hover:shadow-md " +
                  (t.isActive ? "border-brand-neutral/40" : "border-brand-neutral/20 opacity-60")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                        {t.name}
                      </h3>
                      {!t.isActive && (
                        <span className="inline-flex items-center rounded-full bg-brand-neutral/30 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-brand-night-navy/60">
                          Inaktiv
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-brand-night-navy/50">Saison {t.saison}</p>
                  </div>
                  <span className="text-brand-night-navy/30 shrink-0" aria-hidden>→</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-brand-off-white px-2 py-2">
                    <div className="font-display font-black text-base text-brand-night-navy">
                      {pledgeCount}
                    </div>
                    <div className="text-[0.6rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                      Sponsoren
                    </div>
                  </div>
                  <div className="rounded-lg bg-brand-off-white px-2 py-2">
                    <div className="font-display font-black text-base text-accent">
                      {eur(cents30d)}
                    </div>
                    <div className="text-[0.6rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                      30 Tage
                    </div>
                  </div>
                  <div className="rounded-lg bg-brand-off-white px-2 py-2">
                    <div className="font-display font-black text-base text-brand-night-navy">
                      {matches30d}
                    </div>
                    <div className="text-[0.6rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                      Spiele
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
