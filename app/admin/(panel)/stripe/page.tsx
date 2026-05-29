import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptions, clubs, processedStripeEvents } from "@/lib/db/schema";

export const metadata = { title: "Stripe · Admin · KickPact" };
export const dynamic = "force-dynamic";

export default async function StripePage() {
  // Past-Due subscriptions — joined to clubs for direct drill-down.
  const pastDue = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingCycle: subscriptions.billingCycle,
      updatedAt: subscriptions.updatedAt
    })
    .from(subscriptions)
    .innerJoin(clubs, eq(clubs.id, subscriptions.clubId))
    .where(eq(subscriptions.status, "past_due"))
    .orderBy(desc(subscriptions.updatedAt));

  // Incomplete subscriptions (Stripe-Checkout angefangen, nicht abgeschlossen).
  const incomplete = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      stripeCustomerId: subscriptions.stripeCustomerId,
      updatedAt: subscriptions.updatedAt
    })
    .from(subscriptions)
    .innerJoin(clubs, eq(clubs.id, subscriptions.clubId))
    .where(eq(subscriptions.status, "incomplete"))
    .orderBy(desc(subscriptions.updatedAt));

  // Letzte 10 Webhook-Events. "Latency" zu Stripe können wir nicht messen
  // (wir speichern den Event-Timestamp aus Stripe-Payload nicht separat),
  // also zeigen wir processed_at + event_type als simple Audit-Liste.
  // → siehe Plan 4 Report-Sektion zur pragmatischen Vereinfachung.
  const recentEvents = await db
    .select()
    .from(processedStripeEvents)
    .orderBy(desc(processedStripeEvents.processedAt))
    .limit(10);

  return (
    <div className="space-y-8">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Tile label="Past Due" value={pastDue.length.toString()} emoji="⚠️" />
        <Tile label="Incomplete" value={incomplete.length.toString()} emoji="🔄" />
        <Tile label="Letzte 10 Webhooks" value={recentEvents.length.toString()} emoji="📬" />
      </div>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Past-Due Subscriptions ({pastDue.length})
        </h3>
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

function Tile({ label, value, emoji }: { label: string; value: string; emoji?: string }) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
      {emoji && <div className="text-xl mb-1">{emoji}</div>}
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1 font-display font-black text-2xl text-brand-night-navy tabular-nums">
        {value}
      </div>
    </div>
  );
}
