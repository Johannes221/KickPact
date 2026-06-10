import {
  evaluateTriggers,
  type MatchInput,
  type PledgeRuleInput,
  type ChargeProposal
} from "@/lib/crawler/triggers";
import { getStatusTableCounts } from "@/lib/db/queries/system-status";

export const revalidate = 30;
export const dynamic = "force-dynamic";

function runDemo() {
  // Synthetic match: heim verliert zur HZ 0:1, gewinnt 3:1 (Comeback!)
  // Schmidt schießt 2 Tore, Maier 1, Müller 1 für Gast.
  const match: MatchInput = {
    id: "demo-match",
    teamSide: "heim",
    ergebnisHeim: 3,
    ergebnisGast: 1,
    halbzeitHeim: 0,
    halbzeitGast: 1,
    events: [
      {
        id: "e1",
        type: "tor",
        minute: 22,
        side: "gast",
        playerName: "Müller",
        playerId: "p_mueller",
        source: "scraped"
      },
      {
        id: "e2",
        type: "tor",
        minute: 51,
        side: "heim",
        playerName: "Schmidt",
        playerId: "p_schmidt",
        source: "scraped"
      },
      {
        id: "e3",
        type: "tor",
        minute: 67,
        side: "heim",
        playerName: "Maier",
        playerId: "p_maier",
        source: "scraped"
      },
      {
        id: "e4",
        type: "tor",
        minute: 88,
        side: "heim",
        playerName: "Schmidt",
        playerId: "p_schmidt",
        source: "scraped"
      }
    ]
  };

  // Pledge "Tante Erna" mit 4 Regeln
  const rules: PledgeRuleInput[] = [
    {
      id: "r-goal",
      pledgeId: "p-erna",
      triggerType: "goal_total",
      triggerParams: {},
      amountCents: 500,
      perMatchCapCents: null
    },
    {
      id: "r-win",
      pledgeId: "p-erna",
      triggerType: "win",
      triggerParams: {},
      amountCents: 1000,
      perMatchCapCents: null
    },
    {
      id: "r-comeback",
      pledgeId: "p-erna",
      triggerType: "comeback_win",
      triggerParams: {},
      amountCents: 2000,
      perMatchCapCents: null
    },
    {
      id: "r-schmidt",
      pledgeId: "p-erna",
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 300,
      perMatchCapCents: null
    }
  ];

  const charges = evaluateTriggers(match, rules);
  const total = charges.reduce((acc, c) => acc + c.amountCents, 0);
  return { match, rules, charges, total };
}

function formatEur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function ruleLabel(r: PledgeRuleInput): string {
  const eur = formatEur(r.amountCents);
  switch (r.triggerType) {
    case "goal_total":
      return `${eur} pro Tor`;
    case "win":
      return `${eur} pro Sieg`;
    case "comeback_win":
      return `${eur} pro Comeback-Sieg`;
    case "goal_by_player":
      return `${eur} pro Tor von Spieler ${r.triggerParams.playerId ?? r.triggerParams.playerName}`;
    case "clean_sheet":
      return `${eur} pro Zu-Null-Sieg`;
    case "hattrick":
      return `${eur} bei Hattrick`;
    default:
      return `${eur} bei ${r.triggerType}`;
  }
}

function chargeLabel(c: ChargeProposal, match: MatchInput): string {
  if (c.matchEventId) {
    const ev = match.events.find((e) => e.id === c.matchEventId);
    if (ev) {
      return `${ev.minute}' ${ev.playerName} — ${c.triggerType}`;
    }
  }
  return `Match-Level: ${c.triggerType}`;
}

export default async function HomePage() {
  const dbResult = await getStatusTableCounts();
  const demo = runDemo();

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex items-baseline gap-4 flex-wrap">
            <h1 className="font-display text-5xl md:text-6xl tracking-wide">KickPact</h1>
            <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
              Beta · Staging
            </span>
          </div>
          <p className="mt-3 text-base md:text-lg text-neutral-600">
            Performance-basiertes Sponsoring im Amateurfußball. Plan 1–5 implementiert —
            Auth, Onboarding, Match-Pipeline, Invoicing, Saison-Ziele + Sponsor-Discover live.
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            Diese Seite ist ein Live-Status-Dashboard (Counts, Trigger-Engine-Demo).
            Production-Domain kommt mit Stripe-Live-Keys.
          </p>
        </div>
      </section>

      {/* Status-Karten */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="font-display text-2xl tracking-wide">System-Status</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatusCard
            label="Postgres (Neon)"
            value={dbResult.ok ? "online" : "offline"}
            ok={dbResult.ok}
            hint={dbResult.ok ? "21 Tabellen, 17 Enums (incl. Saison + Discover)" : dbResult.error}
          />
          <StatusCard
            label="Trigger-Engine"
            value="54 Tests passing"
            ok={true}
            hint="22 Trigger-Types (16 match + 6 season), alle TDD-validated"
          />
          <StatusCard
            label="Inngest-Jobs"
            value="6 registriert"
            ok={true}
            hint="crawl-matches · evaluate-match · approval-reminders · generate-invoices (monatlich) · season-end-reminders · evaluate-season"
          />
        </div>
      </section>

      {/* DB-Counts */}
      <section className="mx-auto max-w-5xl px-6 pb-10">
        <h2 className="font-display text-2xl tracking-wide">Datenbank</h2>
        {dbResult.ok ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {Object.entries(dbResult.stats).map(([table, count]) => (
              <div
                key={table}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="text-xs uppercase tracking-wider text-neutral-400">
                  {table}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {count}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-red-600">DB nicht erreichbar: {dbResult.error}</p>
        )}
      </section>

      {/* Live-Demo Trigger-Engine */}
      <section className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl tracking-wide">
              Live-Demo · Trigger-Engine
            </h2>
            <span className="text-xs text-neutral-400">
              Diese Berechnung läuft live bei jedem Page-Load
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Input · Spiel
              </h3>
              <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="font-medium">
                  FC Test 1. Herren <span className="text-accent">3</span>:1 SV Gegner
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  Halbzeit: 0:1 (von hinten zurück gekämpft)
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {demo.match.events.map((e) => (
                    <li key={e.id} className="font-mono tabular-nums">
                      <span className="inline-block w-10 text-neutral-400">
                        {e.minute}&apos;
                      </span>
                      <span
                        className={
                          e.side === "heim"
                            ? "font-semibold text-accent"
                            : "text-neutral-500"
                        }
                      >
                        {e.side === "heim" ? "⚽" : "✕"} {e.playerName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Input · Pact &quot;Tante Erna&quot;
              </h3>
              <ul className="mt-2 space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
                {demo.rules.map((r) => (
                  <li key={r.id}>{ruleLabel(r)}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Output · {demo.charges.length} Beiträge generiert
              </h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-100 text-xs uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Event</th>
                      <th className="px-3 py-2 text-right">Betrag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {demo.charges.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{chargeLabel(c, demo.match)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatEur(c.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 text-sm font-semibold">
                    <tr>
                      <td className="px-3 py-2">Summe für dieses Spiel</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">
                        {formatEur(demo.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                Engine evaluiert pure funktional —{" "}
                <code className="rounded bg-neutral-100 px-1">evaluateTriggers(match, rules)</code>{" "}
                aus{" "}
                <code className="rounded bg-neutral-100 px-1">lib/crawler/triggers.ts</code>.
                In Production läuft das in einem Inngest-Job pro neuem Match aus dem
                Match-Crawler, mit Monthly-Cap-Enforcement und Idempotenz über
                UNIQUE-Constraints in Postgres.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="font-display text-2xl tracking-wide">Roadmap</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <span className="font-mono text-xs text-accent">✓ Plan 1</span>{" "}
              Foundation, Schema, Engine, Crawler, Inngest-Pipeline
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Plan 2</span> Better
              Auth (Magic-Link + Google + Apple), Onboarding, Pact-Setup
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Plan 3</span>{" "}
              Vereins-Dashboard, Match-Detail, Manual-Event-Editor, Approval-Inbox
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Plan 4</span>{" "}
              Invoicing (PDF + Mail), Saison-Ende-Reminder
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Plan 5 (A)</span>{" "}
              Stripe-Abo Skeleton, Checkout-Page, Webhook (Keys-Setup pending)
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Extra</span>{" "}
              Saison-Ziele (DB + evaluate-season Cron + Pact-Setup + Trainer-Form)
            </li>
            <li>
              <span className="font-mono text-xs text-accent">✓ Extra</span>{" "}
              Sponsor-Discover (öffentliche Mannschafts-Suche + Inquiry-Flow)
            </li>
            <li>
              <span className="font-mono text-xs text-neutral-400">Plan 5 (B)</span>{" "}
              Past-Due-Read-Only, Trial-Reminder, Vereinslizenz-Subsumption
            </li>
            <li>
              <span className="font-mono text-xs text-neutral-400">Plan 6</span>{" "}
              Production-Domain (kickpact.com), DSGVO/Impressum, E2E
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function StatusCard({
  label,
  value,
  ok,
  hint
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
          aria-hidden
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}
