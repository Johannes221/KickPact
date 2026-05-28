import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams, clubs, charges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PledgeStatusToggle } from "./_components/pledge-status-toggle";
import { PledgeCapEditor } from "./_components/pledge-cap-editor";

export const metadata = { title: "Pact · KickPact" };

const TRIGGER_LABELS: Record<string, string> = {
  goal_total: "Pro Tor",
  goal_by_player: "Pro Tor eines Spielers",
  win: "Pro Sieg",
  loss: "Pro Niederlage",
  draw: "Pro Unentschieden",
  clean_sheet: "Pro Zu-Null-Sieg",
  comeback_win: "Pro Comeback-Sieg",
  hattrick: "Pro Hattrick",
  goal_diff_min: "Pro hohem Sieg",
  goals_scored_min: "Pro Spiel mit X+ Toren",
  special_goal: "Pro Spezial-Tor",
  yellow_card: "Pro gelber Karte",
  red_card: "Pro roter Karte",
  assist: "Pro Vorlage",
  man_of_match: "Pro 'Spieler des Spiels'",
  custom: "Custom-Event"
};

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

  const [pledge] = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      startsAt: pledges.startsAt,
      endsAt: pledges.endsAt,
      monthlyCapCents: pledges.monthlyCapCents,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      sponsorUserId: sponsors.userId
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.id, id))
    .limit(1);

  if (!pledge || pledge.sponsorUserId !== user.id) {
    redirect("/sponsor");
  }

  const rules = await db.select().from(pledgeRules).where(eq(pledgeRules.pledgeId, id));

  const recentCharges = await db
    .select({
      id: charges.id,
      amountCents: charges.amountCents,
      status: charges.status,
      createdAt: charges.createdAt,
      matchId: charges.matchId
    })
    .from(charges)
    .where(eq(charges.pledgeId, id))
    .orderBy(desc(charges.createdAt))
    .limit(10);

  const totalConfirmedCents = recentCharges
    .filter((c) => c.status === "confirmed" || c.status === "invoiced")
    .reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <Link href="/sponsor" className="text-sm text-brand-night-navy/60 hover:text-accent">
          ← Sponsor-Dashboard
        </Link>
        <h1 className="mt-2 md:mt-3 font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
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

      <h2 className="mt-8 md:mt-12 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
        Ereignisse
      </h2>
      <ul className="mt-3 md:mt-4 space-y-2">
        {rules.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-brand-neutral/40 bg-white p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-brand-night-navy">
                {TRIGGER_LABELS[r.triggerType] ?? r.triggerType}
              </div>
              {r.perMatchCapCents && (
                <div className="text-xs text-brand-night-navy/40 mt-0.5">
                  Max {eur(r.perMatchCapCents)} pro Spiel
                </div>
              )}
              {r.requiresApproval && (
                <span className="mt-1 inline-flex items-center text-[0.6rem] uppercase tracking-widest font-bold text-accent-dark bg-accent/10 px-1.5 py-0.5 rounded">
                  Bestätigung erforderlich
                </span>
              )}
            </div>
            <div className="font-mono tabular-nums text-lg font-semibold text-brand-night-navy">
              {eur(r.amountCents)}
            </div>
          </li>
        ))}
      </ul>

      {/* Charges-Summary */}
      <div className="mt-8 md:mt-12 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
            Charge-Verlauf
          </h2>
          <span className="font-mono tabular-nums text-brand-night-navy/60 text-sm">
            Gesamt bestätigt:{" "}
            <strong className="text-brand-night-navy">{eur(totalConfirmedCents)}</strong>
          </span>
        </div>

        {recentCharges.length === 0 ? (
          <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5 text-sm text-brand-night-navy/60">
            Noch keine Charges. Sobald die Mannschaft spielt und Trigger zünden, erscheinen sie hier.
          </div>
        ) : (
          <ul className="space-y-2">
            {recentCharges.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between"
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
        <div className="font-display font-black text-xl tracking-tight text-brand-night-navy capitalize">
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
