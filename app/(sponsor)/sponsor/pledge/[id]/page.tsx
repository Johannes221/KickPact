import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getTeamPlayerPool } from "@/lib/db/queries/matches";
import {
  getPledgeDetailForSponsorView,
  listActivePledgeRules,
  listRecentChargesForPledge
} from "@/lib/db/queries/pledges";
import { getTeamDataCoverage } from "@/lib/db/queries/crawler";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { PledgeStatusToggle } from "./_components/pledge-status-toggle";
import { PledgeCapEditor } from "./_components/pledge-cap-editor";
import { PledgeRulesEditor, type EditableRule } from "./_components/pledge-rules-editor";

export const metadata = { title: "Pact · KickPact" };

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function PledgeDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const pledge = await getPledgeDetailForSponsorView(id);

  if (!pledge || pledge.sponsorUserId !== user.id) {
    redirect("/sponsor");
  }

  const ruleRows = await listActivePledgeRules(id);

  const editableRules: EditableRule[] = ruleRows.map((r) => ({
    id: r.id,
    triggerType: r.triggerType,
    amountCents: r.amountCents,
    capCents: r.capCents,
    capPeriod: r.capPeriod,
    params: (r.params ?? {}) as Record<string, unknown>
  }));

  // Spieler-Namen für den „Tore von Spieler X"-Picker — vollständiger Pool
  // (Kader ∪ alle Auftritte), serverseitig vorgeladen.
  const playerNames = await getTeamPlayerPool(pledge.teamId);

  // Spieler-Wetten nur anbieten, wenn fußball.de für die Mannschaft Torschützen
  // liefert (`full`) oder die Mannschaft noch unklassifiziert ist (NULL). Bei
  // `results_only`/`none` werden goal_by_player/hattrick im „Regel hinzufügen"-
  // Dialog ausgeblendet (bestehende Regeln bleiben editierbar).
  const teamCoverage = await getTeamDataCoverage(pledge.teamId);
  const playerBetsAllowed = teamCoverage === "full" || teamCoverage == null;

  const recentCharges = await listRecentChargesForPledge(id, 10);

  const totalConfirmedCents = recentCharges
    .filter((c) => c.status === "confirmed" || c.status === "invoiced")
    .reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        {/* Back nur Desktop — auf Mobile übernimmt die native AppNavBar (Chevron
            + „Pacts"). */}
        <Link
          href="/sponsor/pledge"
          className="hidden md:inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:text-accent-dark"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Pacts
        </Link>
        <h1 className="mt-2 md:mt-3 font-display font-bold text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {pledge.teamName}
        </h1>
        <p className="mt-1 text-sm md:text-base text-brand-night-navy/60">{pledge.clubName}</p>
      </div>

      <div className="mt-6 md:mt-10 grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          label="Status"
          value={
            <Badge tone={(PLEDGE_STATUS[pledge.status] ?? { tone: "neutral" as const }).tone}>
              {(PLEDGE_STATUS[pledge.status] ?? { label: pledge.status }).label}
            </Badge>
          }
        />
        <StatCard
          label="Laufzeit"
          value={`${pledge.startsAt.toLocaleDateString("de-DE")} – ${pledge.endsAt.toLocaleDateString("de-DE")}`}
        />
        {/* Monats-Cap is editable inline for active/paused pledges */}
        <Card className="border-brand-neutral/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
              Monats-Cap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PledgeCapEditor
              pledgeId={pledge.id}
              currentCapCents={pledge.monthlyCapCents ?? null}
              isEnded={pledge.status === "ended"}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <PledgeStatusToggle pledgeId={pledge.id} currentStatus={pledge.status} />
      </div>

      <div className="mt-8 md:mt-12 flex items-baseline justify-between gap-3">
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Regeln
        </h2>
        <span className="text-xs text-brand-night-navy/50">
          Änderungen gelten nur für künftige Spiele.
        </span>
      </div>
      <div className="mt-3 md:mt-4">
        <PledgeRulesEditor
          pledgeId={pledge.id}
          rules={editableRules}
          playerNames={playerNames}
          pledgeEnded={pledge.status === "ended"}
          playerBetsAllowed={playerBetsAllowed}
        />
      </div>

      {/* Beiträge-Summary */}
      <div className="mt-8 md:mt-12 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
            Beitrags-Verlauf
          </h2>
          <span className="font-mono tabular-nums text-brand-night-navy/60 text-sm">
            Gesamt bestätigt:{" "}
            <strong className="text-brand-night-navy">{eur(totalConfirmedCents)}</strong>
          </span>
        </div>

        {recentCharges.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Noch keine Beiträge"
            description="Sobald die Mannschaft spielt und Ereignisse zünden, erscheinen sie hier."
          />
        ) : (
          <ul className="space-y-2">
            {recentCharges.map((c) => (
              <li
                key={c.id}
                className="rounded-lg bg-white shadow-ios-card p-3 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm text-brand-night-navy font-mono tabular-nums">
                    {c.createdAt.toLocaleDateString("de-DE")}
                  </span>
                  <ChargeStatusBadge status={c.status} />
                </div>
                <span className="font-mono tabular-nums font-semibold text-brand-night-navy">
                  {eur(c.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const PLEDGE_STATUS: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
  active: { label: "Aktiv", tone: "success" },
  paused: { label: "Pausiert", tone: "warning" },
  ended: { label: "Beendet", tone: "neutral" }
};

function ChargeStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
    pending_approval: { label: "Wartet", tone: "warning" },
    confirmed: { label: "Bestätigt", tone: "success" },
    invoiced: { label: "Abgerechnet", tone: "info" },
    cancelled: { label: "Storniert", tone: "danger" }
  };
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={entry.tone} className="ml-2">
      {entry.label}
    </Badge>
  );
}
