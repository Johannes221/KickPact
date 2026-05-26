import { eq, and, desc, sum, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { charges } from "@/lib/db/schema/charges";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getTriggerLabel, categorizeTrigger } from "@/lib/billing/trigger-labels";

export const metadata = { title: "Pacts · KickPact" };

type FilterStatus = "all" | "active" | "paused" | "ended";
type FilterKind = "all" | "auto" | "manual" | "season";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function statusBadge(s: string): { label: string; cls: string } {
  if (s === "active") return { label: "Aktiv", cls: "bg-accent/10 text-accent-dark" };
  if (s === "paused") return { label: "Pausiert", cls: "bg-amber-100 text-amber-700" };
  return { label: "Beendet", cls: "bg-neutral-100 text-neutral-600" };
}

export default async function PactsPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const { slug, teamId } = await params;
  const sp = await searchParams;
  const status: FilterStatus = (sp.status as FilterStatus) ?? "active";
  const kind: FilterKind = (sp.kind as FilterKind) ?? "all";

  const { club } = await assertTeamPageAccess(slug, teamId, "viewer");
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return <div className="text-sm text-brand-alert-red">Mannschaft nicht gefunden.</div>;
  }

  // Rules + Pledge-Status + Sponsor + Σ confirmed Charges pro Rule
  const rows = await db
    .select({
      pledgeId: pledges.id,
      ruleId: pledgeRules.id,
      pledgeStatus: pledges.status,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents,
      monthlyCapCents: pledges.monthlyCapCents,
      sponsorDisplayName: sponsors.displayName,
      chargedSum: sql<number>`COALESCE((SELECT SUM(amount_cents) FROM ${charges} c WHERE c.pledge_rule_id = ${pledgeRules.id} AND c.status = 'confirmed'), 0)`
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(pledges.teamId, team.id))
    .orderBy(desc(pledgeRules.amountCents));

  // Server-side filter
  const filtered = rows.filter((r) => {
    if (status !== "all" && r.pledgeStatus !== status) return false;
    if (kind !== "all" && categorizeTrigger(r.triggerType) !== kind) return false;
    return true;
  });

  const base = `/verein/${slug}/mannschaft/${teamId}/pacts`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">Pacts</h1>
        <p className="text-sm text-brand-night-navy/60 mt-1">
          Alle Sponsoring-Vereinbarungen auf diese Mannschaft. Sortiert nach Betrag.
        </p>
      </div>

      {/* Filter-Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status */}
        <div className="flex gap-1 rounded-xl border border-brand-neutral/30 bg-brand-off-white p-1">
          {(["active", "paused", "ended", "all"] as FilterStatus[]).map((s) => (
            <Link
              key={s}
              href={`${base}?status=${s}&kind=${kind}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                status === s
                  ? "bg-white text-brand-night-navy shadow-sm"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy"
              }`}
            >
              {s === "all" ? "Alle" : statusBadge(s).label}
            </Link>
          ))}
        </div>
        {/* Kind */}
        <div className="flex gap-1 rounded-xl border border-brand-neutral/30 bg-brand-off-white p-1">
          {(["all", "auto", "manual", "season"] as FilterKind[]).map((k) => (
            <Link
              key={k}
              href={`${base}?status=${status}&kind=${k}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                kind === k
                  ? "bg-white text-brand-night-navy shadow-sm"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy"
              }`}
            >
              {k === "all" ? "Alle" : k === "auto" ? "Auto" : k === "manual" ? "Manuell" : "Saison"}
            </Link>
          ))}
        </div>
        <div className="text-xs text-brand-night-navy/50 ml-auto">{filtered.length} Pacts</div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white p-8 text-center text-sm text-brand-night-navy/60">
          Noch keine Pacts in diesem Filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl border border-brand-neutral/30 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-brand-neutral/30 text-xs uppercase tracking-wider text-brand-night-navy/50 text-left">
                  <th className="px-4 py-3 font-semibold">Sponsor</th>
                  <th className="px-4 py-3 font-semibold">Ereignis</th>
                  <th className="px-4 py-3 font-semibold text-right">Betrag</th>
                  <th className="px-4 py-3 font-semibold text-right">Per Match</th>
                  <th className="px-4 py-3 font-semibold text-right">Bisher</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sb = statusBadge(r.pledgeStatus);
                  return (
                    <tr key={r.ruleId} className="border-b border-brand-neutral/15 last:border-0 hover:bg-brand-off-white/40">
                      <td className="px-4 py-3 font-medium">{r.sponsorDisplayName || "—"}</td>
                      <td className="px-4 py-3 text-brand-night-navy/80">
                        {getTriggerLabel(r.triggerType, r.triggerParams as Record<string, unknown>)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{eur(r.amountCents)}</td>
                      <td className="px-4 py-3 text-right text-brand-night-navy/60">
                        {r.perMatchCapCents != null ? eur(r.perMatchCapCents) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{eur(Number(r.chargedSum))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${sb.cls}`}>
                          {sb.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => {
              const sb = statusBadge(r.pledgeStatus);
              return (
                <div key={r.ruleId} className="rounded-2xl border border-brand-neutral/30 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.sponsorDisplayName || "—"}</div>
                      <div className="text-sm text-brand-night-navy/70 mt-0.5">
                        {getTriggerLabel(r.triggerType, r.triggerParams as Record<string, unknown>)}
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${sb.cls}`}>
                      {sb.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div>
                      <div className="text-brand-night-navy/50 uppercase tracking-wider">Betrag</div>
                      <div className="font-semibold">{eur(r.amountCents)}</div>
                    </div>
                    <div>
                      <div className="text-brand-night-navy/50 uppercase tracking-wider">Per Match</div>
                      <div>{r.perMatchCapCents != null ? eur(r.perMatchCapCents) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-brand-night-navy/50 uppercase tracking-wider">Bisher</div>
                      <div className="font-semibold tabular-nums">{eur(Number(r.chargedSum))}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
