import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, subscriptions, teamLicenses, teams } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  PLANS,
  PLAN_ORDER,
  CYCLE_LABELS,
  TRIAL_DAYS,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";
import { highestPlanFrom } from "@/lib/mail/reply-to-pure";
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

  // Höchstes Tier aller Teams → bestimmt aktuell sichtbaren Plan-Badge
  const licenseRows = await db
    .select({ plan: teamLicenses.plan })
    .from(teamLicenses)
    .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
    .where(eq(teams.clubId, club.id));
  const currentPlan: PlanKey =
    licenseRows.length > 0
      ? highestPlanFrom(licenseRows.map((r) => r.plan as PlanKey))
      : "basic";
  const currentCycle: BillingCycle = (sub?.billingCycle as BillingCycle) ?? "monthly";

  const stripeReady = isStripeConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Abo
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          {sub
            ? "Aktueller Plan, Billing-Cycle, Renewal & Upgrade-Pfade."
            : `Wähle einen Plan, ${TRIAL_DAYS} Tage gratis testen, monatlich kündbar.`}
        </p>
      </div>

      {sub ? (
        <CurrentSubscriptionCard
          sub={sub}
          currentPlan={currentPlan}
          currentCycle={currentCycle}
        />
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
          <p className="text-sm text-brand-night-navy/80">
            Noch kein Abo. Wähle einen Plan unten — die ersten {TRIAL_DAYS} Tage
            sind gratis, keine Zahlungsdaten beim Test nötig.
          </p>
        </div>
      )}

      {!stripeReady && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5">
          <p className="text-sm text-amber-900">
            <strong>Hinweis:</strong> Stripe ist noch nicht konfiguriert. Sobald
            die Keys gesetzt sind, kannst du hier den Checkout starten. Bis
            dahin ist der Trial unbeschränkt nutzbar.
          </p>
        </div>
      )}

      {/* Upgrade-Pfade — nur sichtbar wenn nicht schon höchstes Tier */}
      {sub && currentPlan !== "verein" && (
        <UpgradePathsCard
          currentPlan={currentPlan}
          clubSlug={slug}
          stripeReady={stripeReady}
          currentStatus={sub.status}
          currentCycle={currentCycle}
        />
      )}

      {/* Plan-Wahl (für Erstbucher oder Wechsel) */}
      <div>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-3">
          {sub ? "Plan wechseln" : "Plan wählen"}
        </h3>
        <div className="grid gap-3 md:gap-4 md:grid-cols-3 items-stretch">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            return (
              <div
                key={key}
                className={
                  "flex flex-col rounded-2xl border p-4 md:p-5 " +
                  (key === "pro"
                    ? "border-accent bg-accent/5"
                    : "border-brand-neutral/40 bg-white")
                }
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
                    {plan.label}
                  </h3>
                  {key === "pro" && (
                    <span className="rounded-full bg-accent text-white text-[0.55rem] uppercase tracking-widest font-bold px-2 py-1">
                      empfohlen
                    </span>
                  )}
                </div>
                <div className="mt-2 md:mt-3 flex items-baseline gap-2">
                  <span className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
                    {plan.cycles[currentCycle].display}
                  </span>
                  <span className="text-xs text-brand-night-navy/60">
                    {plan.cycles[currentCycle].caption}
                  </span>
                </div>
                <ul className="mt-3 md:mt-4 flex-1 space-y-1.5 text-xs md:text-sm text-brand-night-navy/80">
                  {plan.features.slice(0, 4).map((f) => (
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
                    currentStatus={sub?.status ?? null}
                    cycle={currentCycle}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub,
  currentPlan,
  currentCycle
}: {
  sub: typeof subscriptions.$inferSelect;
  currentPlan: PlanKey;
  currentCycle: BillingCycle;
}) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5 space-y-3">
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        Aktueller Status
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PlanBadge plan={currentPlan} />
        <CycleBadge cycle={currentCycle} />
        <StatusPill status={sub.status} />
      </div>
      <div className="text-xs md:text-sm text-brand-night-navy/60 space-y-1">
        {sub.trialEndsAt && sub.status === "trialing" && (
          <div>
            Trial endet am{" "}
            <strong>{new Date(sub.trialEndsAt).toLocaleDateString("de-DE")}</strong>
          </div>
        )}
        {sub.currentPeriodEnd && sub.status === "active" && (
          <div>
            Nächste Abbuchung am{" "}
            <strong>
              {new Date(sub.currentPeriodEnd).toLocaleDateString("de-DE")}
            </strong>
          </div>
        )}
        {sub.status === "paused" && sub.pausedUntil && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-amber-900">
            <strong>Sommerpause aktiv.</strong> Pausiert bis{" "}
            {new Date(sub.pausedUntil).toLocaleDateString("de-DE")}. Crawler
            stoppt, kein €-Charge — Saison-Pass läuft automatisch am 1.8.
            weiter.
          </div>
        )}
      </div>
    </div>
  );
}

function UpgradePathsCard({
  currentPlan,
  clubSlug,
  stripeReady,
  currentStatus,
  currentCycle
}: {
  currentPlan: PlanKey;
  clubSlug: string;
  stripeReady: boolean;
  currentStatus: string;
  currentCycle: BillingCycle;
}) {
  return (
    <div className="rounded-2xl border border-brand-night-navy/15 bg-brand-off-white p-4 md:p-5 space-y-3">
      <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
        Upgrade-Optionen
      </h3>
      {currentPlan === "basic" && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-accent/30 bg-white p-3">
          <div className="text-sm text-brand-night-navy/80">
            <strong>Basic → Pro</strong> · ∞ Sponsoren · ∞ Pledge-Rules ·
            Saison-Wetten · Vereins-Branding auf PDF & Mail.
          </div>
          <CheckoutButtons
            clubSlug={clubSlug}
            plan="pro"
            stripeReady={stripeReady}
            currentStatus={currentStatus}
            cycle={currentCycle}
          />
        </div>
      )}
      {(currentPlan === "basic" || currentPlan === "pro") && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-brand-neutral/40 bg-white p-3">
          <div className="text-sm text-brand-night-navy/80">
            <strong>Vereinslizenz</strong> · alle Mannschaften unter einer
            Lizenz · ab 3 Mannschaften günstiger als 3× Pro · Master-Admin +
            Sammel-PDF.
          </div>
          <CheckoutButtons
            clubSlug={clubSlug}
            plan="verein"
            stripeReady={stripeReady}
            currentStatus={currentStatus}
            cycle={currentCycle}
          />
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: PlanKey }) {
  const map: Record<PlanKey, { label: string; cls: string }> = {
    basic: {
      label: "Basic",
      cls: "bg-brand-neutral/30 text-brand-night-navy"
    },
    pro: { label: "Pro", cls: "bg-accent text-white" },
    verein: { label: "Vereinslizenz", cls: "bg-brand-night-navy text-white" }
  };
  const entry = map[plan];
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}

function CycleBadge({ cycle }: { cycle: BillingCycle }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-off-white border border-brand-neutral/40 px-2.5 py-1 text-xs font-semibold text-brand-night-navy">
      {CYCLE_LABELS[cycle]}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    trialing: {
      label: "Trial",
      cls: "bg-accent/10 text-accent-dark ring-1 ring-accent/30"
    },
    active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
    past_due: {
      label: "Zahlung überfällig",
      cls: "bg-amber-100 text-amber-900"
    },
    paused: { label: "Pausiert", cls: "bg-amber-100 text-amber-900" },
    cancelled: { label: "Gekündigt", cls: "bg-neutral-100 text-neutral-700" },
    incomplete: {
      label: "Unvollständig",
      cls: "bg-neutral-100 text-neutral-700"
    }
  };
  const entry = map[status] ?? {
    label: status,
    cls: "bg-neutral-100 text-neutral-700"
  };
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
