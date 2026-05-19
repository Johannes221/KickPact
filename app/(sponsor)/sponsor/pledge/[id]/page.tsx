import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pledge · KickPact" };

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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div>
        <Link href="/sponsor" className="text-sm text-brand-night-navy/60 hover:text-accent">
          ← Sponsor-Dashboard
        </Link>
        <h1 className="mt-3 font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          {pledge.teamName}
        </h1>
        <p className="mt-1 text-brand-night-navy/60">{pledge.clubName}</p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <StatCard label="Status" value={pledge.status} />
        <StatCard
          label="Laufzeit"
          value={`${pledge.startsAt.toLocaleDateString("de-DE")} – ${pledge.endsAt.toLocaleDateString("de-DE")}`}
        />
        <StatCard
          label="Monats-Cap"
          value={pledge.monthlyCapCents ? eur(pledge.monthlyCapCents) : "ohne Cap"}
        />
      </div>

      <h2 className="mt-12 font-display font-black text-2xl tracking-tight text-brand-night-navy">
        Trigger-Regeln
      </h2>
      <ul className="mt-4 space-y-2">
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

      <div className="mt-10 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6">
        <p className="text-sm text-brand-night-navy/70">
          Pledge ist <strong>{pledge.status}</strong>. Bei jedem neuen Spiel der Mannschaft
          erzeugt KickPact automatisch Charges nach diesen Regeln. Eine Approval-Inbox für
          Spezial-Events + Monats-Rechnungen kommt in Plan 3 + 4.
        </p>
      </div>
    </main>
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
