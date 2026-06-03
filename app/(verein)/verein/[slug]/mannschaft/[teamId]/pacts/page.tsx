import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { listTeamPactRuleRows } from "@/lib/db/queries/team-finances";
import { getTriggerLabel } from "@/lib/billing/trigger-labels";
import { categorize } from "@/lib/billing/trigger-categories";
import { FilterRow, FilterChip } from "@/components/shared/filter-chip";
import { AvailableTriggers } from "./_components/available-triggers";
import { PactsFilterBar } from "./_components/pacts-filter-bar";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export const metadata = { title: "Pacts · KickPact" };

type FilterStatus = "all" | "active" | "paused" | "ended";
type FilterKind = "all" | "auto" | "manual" | "season";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function statusBadge(s: string): { label: string; tone: BadgeProps["tone"] } {
  if (s === "active") return { label: "Aktiv", tone: "success" };
  if (s === "paused") return { label: "Pausiert", tone: "warning" };
  return { label: "Beendet", tone: "neutral" };
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
  const team = await getTeamInClub(teamId, club.id);

  if (!team) {
    return <div className="text-sm text-brand-alert-red">Mannschaft nicht gefunden.</div>;
  }

  // Rules + Pledge-Status + Sponsor + Σ confirmed Charges pro Rule
  const rows = await listTeamPactRuleRows(team.id);

  // Server-side filter
  const filtered = rows.filter((r) => {
    if (status !== "all" && r.pledgeStatus !== status) return false;
    if (kind !== "all" && categorize(r.triggerType) !== kind) return false;
    return true;
  });

  const base = `/verein/${slug}/mannschaft/${teamId}/pacts`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl tracking-tight">Pacts</h1>
        <p className="text-sm text-brand-night-navy/60 mt-1">
          Alle Sponsoring-Vereinbarungen auf diese Mannschaft. Sortiert nach Betrag.
        </p>
      </div>

      {/* Filter mobil: kompakter SegmentedControl + Art-Sheet (iOS-Feeling) */}
      <PactsFilterBar status={status} kind={kind} />

      {/* Filter Desktop: beschriftete Chip-Reihen */}
      <div className="hidden md:block space-y-2">
        <FilterRow label="Status">
          {(["active", "paused", "ended", "all"] as FilterStatus[]).map((s) => (
            <FilterChip
              key={s}
              href={`${base}?status=${s}&kind=${kind}`}
              active={status === s}
            >
              {s === "all" ? "Alle" : statusBadge(s).label}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Art">
          {(["all", "auto", "manual", "season"] as FilterKind[]).map((k) => (
            <FilterChip
              key={k}
              href={`${base}?status=${status}&kind=${k}`}
              active={kind === k}
            >
              {k === "all" ? "Alle" : k === "auto" ? "Auto" : k === "manual" ? "Manuell" : "Saison"}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <div className="text-xs text-brand-night-navy/50">{filtered.length} Pacts</div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-ios-card p-8 text-center text-sm text-brand-night-navy/60">
          Noch keine Pacts in diesem Filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl bg-white shadow-ios-card overflow-x-auto">
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
                        <Badge tone={sb.tone}>{sb.label}</Badge>
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
                <div key={r.ruleId} className="rounded-2xl bg-white shadow-ios-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.sponsorDisplayName || "—"}</div>
                      <div className="text-sm text-brand-night-navy/70 mt-0.5">
                        {getTriggerLabel(r.triggerType, r.triggerParams as Record<string, unknown>)}
                      </div>
                    </div>
                    <Badge tone={sb.tone} className="shrink-0">{sb.label}</Badge>
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

      {/* Transparenz: welche Wetten-Typen Sponsoren überhaupt wählen können. */}
      <AvailableTriggers />
    </div>
  );
}
