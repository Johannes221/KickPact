import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getTeamPlayerNames } from "@/lib/db/queries/matches";
import {
  getPledgeDetailForSponsorView,
  listActivePledgeRules,
  listRecentChargesForPledge
} from "@/lib/db/queries/pledges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Spieler-Namen für den „Tore von Spieler X"-Picker (DB-Quelle, kein Invite-Token nötig).
  const playerNames = await getTeamPlayerNames(pledge.teamId);

  const recentCharges = await listRecentChargesForPledge(id, 10);

  const totalConfirmedCents = recentCharges
    .filter((c) => c.status === "confirmed" || c.status === "invoiced")
    .reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <Link href="/sponsor" className="text-sm text-brand-night-navy/60 hover:text-accent">
          ← Sponsor-Dashboard
        </Link>
        <h1 className="mt-2 md:mt-3 font-display font-bold text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {pledge.teamName}
        </h1>
        <p className="mt-1 text-sm md:text-base text-brand-night-navy/60">{pledge.clubName}</p>
      </div>

      <div className="mt-6 md:mt-10 grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Status" value={pledge.status} />
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
          <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5 text-sm text-brand-night-navy/60">
            Noch keine Beiträge. Sobald die Mannschaft spielt und Ereignisse zünden, erscheinen sie hier.
          </div>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-brand-neutral/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-display font-bold text-xl tracking-tight text-brand-night-navy capitalize">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ChargeStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_approval: { label: "Wartet", cls: "bg-amber-100 text-amber-800" },
    confirmed: { label: "Bestätigt", cls: "bg-emerald-100 text-emerald-800" },
    invoiced: { label: "Abgerechnet", cls: "bg-blue-100 text-blue-800" },
    cancelled: { label: "Storniert", cls: "bg-rose-100 text-rose-700" }
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span
      className={"ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " + entry.cls}
    >
      {entry.label}
    </span>
  );
}
