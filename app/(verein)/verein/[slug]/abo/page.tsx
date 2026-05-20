import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { isStripeConfigured } from "@/lib/stripe/client";
import { PLANS, TRIAL_DAYS } from "@/lib/stripe/pricing";
import { CheckoutButtons } from "./_components/checkout-buttons";

export const metadata = { title: "Abo · KickPact" };

export default async function AboPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "admin");

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);

  const stripeReady = isStripeConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Abo
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Wähle einen Plan, {TRIAL_DAYS} Tage gratis testen, monatlich kündbar.
        </p>
      </div>

      {sub ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
          <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Aktueller Status
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <StatusPill status={sub.status} />
            {sub.trialEndsAt && sub.status === "trialing" && (
              <span className="text-xs md:text-sm text-brand-night-navy/60">
                Trial endet am {new Date(sub.trialEndsAt).toLocaleDateString("de-DE")}
              </span>
            )}
            {sub.currentPeriodEnd && sub.status === "active" && (
              <span className="text-xs md:text-sm text-brand-night-navy/60">
                Nächste Abbuchung {new Date(sub.currentPeriodEnd).toLocaleDateString("de-DE")}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
          <p className="text-sm text-brand-night-navy/80">
            Noch kein Abo. Wähle einen Plan unten — die ersten {TRIAL_DAYS} Tage sind gratis,
            keine Zahlungsdaten beim Test nötig.
          </p>
        </div>
      )}

      {!stripeReady && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5">
          <p className="text-sm text-amber-900">
            <strong>Hinweis:</strong> Stripe ist noch nicht konfiguriert. Sobald die Keys
            gesetzt sind, kannst du hier den Checkout starten. Bis dahin ist der Trial
            unbeschränkt nutzbar.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((plan) => (
          <div
            key={plan.key}
            className={
              "rounded-2xl border p-4 md:p-5 " +
              (plan.key === "pro"
                ? "border-accent bg-accent/5"
                : "border-brand-neutral/40 bg-white")
            }
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
                {plan.label}
              </h3>
              {plan.key === "pro" && (
                <span className="rounded-full bg-accent text-white text-[0.55rem] uppercase tracking-widest font-bold px-2 py-1">
                  empfohlen
                </span>
              )}
            </div>
            <div className="mt-2 md:mt-3 flex items-baseline gap-2">
              <span className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
                {(plan.amountCents / 100).toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR"
                })}
              </span>
              <span className="text-xs text-brand-night-navy/60">
                / {plan.unit === "team" ? "Mannschaft" : "Verein"} / Monat
              </span>
            </div>
            <ul className="mt-3 md:mt-4 space-y-1.5 text-xs md:text-sm text-brand-night-navy/80">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-1.5">
                  <span className="text-accent">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 md:mt-5">
              <CheckoutButtons
                clubSlug={slug}
                plan={plan.key}
                stripeReady={stripeReady}
                hasSubscription={!!sub}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    trialing: { label: "Trial", cls: "bg-accent/10 text-accent-dark ring-1 ring-accent/30" },
    active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
    past_due: { label: "Zahlung überfällig", cls: "bg-amber-100 text-amber-900" },
    cancelled: { label: "Gekündigt", cls: "bg-neutral-100 text-neutral-700" },
    incomplete: { label: "Unvollständig", cls: "bg-neutral-100 text-neutral-700" }
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}
