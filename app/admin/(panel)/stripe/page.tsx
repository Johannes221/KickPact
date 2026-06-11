import Link from "next/link";
import { TriangleAlert, RefreshCw, MailOpen, type LucideIcon } from "lucide-react";
import {
  listPastDueSubscriptions,
  listIncompleteSubscriptions,
  listRecentStripeEvents
} from "@/lib/db/queries/subscriptions";

export const metadata = { title: "Stripe · Admin · KickPact" };
export const dynamic = "force-dynamic";

export default async function StripePage() {
  const pastDue = await listPastDueSubscriptions();
  const incomplete = await listIncompleteSubscriptions();
  const recentEvents = await listRecentStripeEvents(10);

  return (
    <div className="space-y-8">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Tile label="Past Due" value={pastDue.length.toString()} icon={TriangleAlert} />
        <Tile label="Incomplete" value={incomplete.length.toString()} icon={RefreshCw} />
        <Tile label="Letzte 10 Webhooks" value={recentEvents.length.toString()} icon={MailOpen} />
      </div>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Past-Due Subscriptions ({pastDue.length})
        </h3>
        {pastDue.length > 0 && (
          <p className="mb-2 text-xs text-brand-night-navy/60">
            Hinweis: Für read-only Vereine (past_due jenseits der Grace /
            cancelled) werden Spiel-Auswertungen zurückgestellt
            (Log: <code>match/evaluation-deferred</code>). Nach Reaktivierung
            die betroffenen Mannschaften über „Spieldaten erneut einlesen"
            re-scrapen, damit die zurückgestellten Charges entstehen.
          </p>
        )}
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Verein</th>
                <th className="px-3 py-2 text-left font-semibold">Cycle</th>
                <th className="px-3 py-2 text-left font-semibold">Period bis</th>
                <th className="px-3 py-2 text-left font-semibold">Letztes Update</th>
                <th className="px-3 py-2 text-left font-semibold">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {pastDue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine past-due Subs — sauber.
                  </td>
                </tr>
              )}
              {pastDue.map((p) => (
                <tr key={p.clubId}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/vereine/${p.clubSlug}`}
                      className="font-semibold hover:text-accent transition-colors"
                    >
                      {p.clubName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{p.billingCycle}</td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {p.currentPeriodEnd
                      ? new Date(p.currentPeriodEnd).toLocaleDateString("de-DE")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-brand-night-navy/60 font-mono">
                    {new Date(p.updatedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2">
                    {p.stripeSubscriptionId ? (
                      <a
                        href={`https://dashboard.stripe.com/subscriptions/${p.stripeSubscriptionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-accent hover:underline"
                      >
                        Stripe ↗
                      </a>
                    ) : (
                      <span className="text-xs text-brand-night-navy/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Incomplete Subscriptions ({incomplete.length})
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Verein</th>
                <th className="px-3 py-2 text-left font-semibold">Letztes Update</th>
                <th className="px-3 py-2 text-left font-semibold">Customer-ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {incomplete.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine.
                  </td>
                </tr>
              )}
              {incomplete.map((i) => (
                <tr key={i.clubId}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/vereine/${i.clubSlug}`}
                      className="font-semibold hover:text-accent transition-colors"
                    >
                      {i.clubName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-brand-night-navy/60">
                    {new Date(i.updatedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {i.stripeCustomerId ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Letzte 10 Stripe-Webhooks
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Verarbeitet</th>
                <th className="px-3 py-2 text-left font-semibold">Event-Type</th>
                <th className="px-3 py-2 text-left font-semibold">Event-ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {recentEvents.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Noch keine Webhooks verarbeitet.
                  </td>
                </tr>
              )}
              {recentEvents.map((e) => (
                <tr key={e.eventId}>
                  <td className="px-3 py-2 text-xs font-mono tabular-nums text-brand-night-navy/70">
                    {new Date(e.processedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{e.eventType}</td>
                  <td className="px-3 py-2 text-xs font-mono text-brand-night-navy/60">
                    {e.eventId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-brand-night-navy/50">
          Hinweis: Webhook-Latenz (Stripe-Server → Verarbeitung) wird aktuell
          nicht getrackt. Für tieferes Debugging das Stripe-Dashboard öffnen.
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
      {Icon && (
        <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent-dark">
          <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
        </span>
      )}
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1 font-display font-black text-2xl text-brand-night-navy tabular-nums">
        {value}
      </div>
    </div>
  );
}
