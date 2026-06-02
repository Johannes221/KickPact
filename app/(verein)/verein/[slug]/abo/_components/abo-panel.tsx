import {
  getSubscriptionForClub,
  listTeamLicensePlansForClub,
  type SubscriptionRow
} from "@/lib/db/queries/subscriptions";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  CYCLE_LABELS,
  normalizeBillingCycle,
  TRIAL_DAYS,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";
import { highestPlanFrom } from "@/lib/mail/reply-to-pure";
import { getDowngradeImpact } from "@/lib/db/queries/downgrade-impact";
import type { DowngradeImpact } from "@/lib/billing/downgrade-impact";
import { CheckoutButtons } from "./checkout-buttons";
import { AboCycleToggle } from "./abo-cycle-toggle";

/**
 * Abo-Verwaltung (Status + Upgrade-Pfade + Plan-Wahl). Die Subscription lebt
 * auf Club-Ebene (eine pro Club, n Team-Licenses dranhängend), daher arbeitet
 * dieses Panel mit `clubId`/`clubSlug`.
 *
 * Wird aus zwei Kontexten gerendert:
 *  - Vereins-Abo (`/verein/[slug]/abo`) bei Vereinslizenz.
 *  - Mannschafts-Abo (`/verein/[slug]/mannschaft/[teamId]/abo`) bei basic/pro,
 *    wo die Mannschaft der primäre Kontext ist (kein Vereins-Header).
 */
export async function AboPanel({
  clubId,
  clubSlug
}: {
  clubId: string;
  clubSlug: string;
}) {
  const sub = await getSubscriptionForClub(clubId);

  // Höchstes Tier aller Teams → bestimmt aktuell sichtbaren Plan-Badge
  const licenseRows = await listTeamLicensePlansForClub(clubId);
  const currentPlan: PlanKey =
    licenseRows.length > 0
      ? highestPlanFrom(licenseRows.map((r) => r.plan as PlanKey))
      : "basic";
  const currentCycle: BillingCycle = normalizeBillingCycle(sub?.billingCycle);

  const stripeReady = isStripeConfigured();

  // Loss-Framing: nur im Trial sinnvoll, und nur wenn aktuell ein Pro/Verein-Tier
  // läuft (auf Basic gäbe es nichts zu "verlieren"). Eine Lese-Query, kein Write.
  const showLossFraming = sub?.status === "trialing" && currentPlan !== "basic";
  const impact: DowngradeImpact | null = showLossFraming
    ? await getDowngradeImpact(clubId)
    : null;

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

      {sub && impact && (
        <TrialEndLossFraming
          impact={impact}
          clubSlug={clubSlug}
          stripeReady={stripeReady}
          currentStatus={sub.status}
          currentCycle={currentCycle}
        />
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
          clubSlug={clubSlug}
          stripeReady={stripeReady}
          currentStatus={sub.status}
          currentCycle={currentCycle}
        />
      )}

      {/* Plan-Wahl (für Erstbucher oder Wechsel) — inkl. Cycle-Toggle */}
      <div>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-1">
          {sub ? "Plan wechseln" : "Plan wählen"}
        </h3>
        {sub ? (
          <p className="mb-3 text-xs text-brand-night-navy/55 leading-relaxed">
            Pro Mannschaft gibt es <strong>genau ein Abo</strong>. Eine neue
            Auswahl <strong>wechselt</strong> deinen bestehenden Plan — es wird
            kein zweites Abo angelegt und du zahlst nie doppelt.
          </p>
        ) : (
          <div className="mb-3" />
        )}
        <AboCycleToggle
          clubSlug={clubSlug}
          stripeReady={stripeReady}
          currentStatus={sub?.status ?? null}
          initialCycle={currentCycle}
        />
      </div>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub,
  currentPlan,
  currentCycle
}: {
  sub: SubscriptionRow;
  currentPlan: PlanKey;
  currentCycle: BillingCycle;
}) {
  // Verbleibende Trial-Tage (aufgerundet) — nur relevant im Trial-Status.
  const trialDaysLeft =
    sub.status === "trialing" && sub.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000
          )
        )
      : null;

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
        {trialDaysLeft !== null && sub.trialEndsAt && (
          <div className="rounded-lg bg-accent/5 border border-accent/30 px-3 py-2.5">
            <div className="font-semibold text-brand-night-navy">
              Pro-Trial — noch {trialDaysLeft}{" "}
              {trialDaysLeft === 1 ? "Tag" : "Tage"} gratis
            </div>
            <p className="mt-1 text-xs leading-relaxed text-brand-night-navy/70">
              Endet automatisch am{" "}
              <strong>
                {new Date(sub.trialEndsAt).toLocaleDateString("de-DE")}
              </strong>
              . Der Trial verlängert sich nicht von selbst und während des Tests
              wird nichts abgebucht. Hinterlege bis dahin deine Zahlungsdaten —
              sonst werden ab Trial-Ende die Sponsoren-Rechnungen pausiert.
            </p>
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
            {new Date(sub.pausedUntil).toLocaleDateString("de-DE")}. Keine
            automatischen Updates, kein €-Charge — Saison-Pass läuft automatisch
            am 1.8. weiter.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Trial-End-Sog: zeigt im Pro-Trial datengetrieben, was ein Wechsel auf Basic
 * kosten würde ("X Sponsoren pausiert, Y Pact-Regeln weg, Saison-Wetten weg …"),
 * bzw. — wenn noch keine Daten da sind — eine ermutigende Empty-State-Variante.
 */
function TrialEndLossFraming({
  impact,
  clubSlug,
  stripeReady,
  currentStatus,
  currentCycle
}: {
  impact: DowngradeImpact;
  clubSlug: string;
  stripeReady: boolean;
  currentStatus: string;
  currentCycle: BillingCycle;
}) {
  // Empty-State: kein Verlust-Hebel sinnvoll → ermutigen statt drohen.
  if (!impact.hasData) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5 space-y-2">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Hol das Meiste aus deinem Pro-Trial
        </h3>
        <p className="text-sm leading-relaxed text-brand-night-navy/75">
          Du testest gerade <strong>Pro</strong> — voll freigeschaltet: ∞ Sponsoren,
          Saison-Wetten, eigene Trigger-Texte und dein Vereins-Logo auf der
          Rechnung. Es ist nur noch kein Sponsor angelegt.
        </p>
        <p className="text-sm leading-relaxed text-brand-night-navy/75">
          Lade deinen ersten Sponsor ein — Familie, Freunde, der Wirt um die Ecke —
          und beim nächsten Tor fiebert ihr gemeinsam mit. <strong>Genau dafür ist
          KickPact da.</strong>
        </p>
      </div>
    );
  }

  // Loss-Framing: echte Zahlen aus den Verein-Daten. Formuliert auf die Basic-Cap-
  // Realität (5 Sponsoren / 3 Regeln) — NICHT auf die noch ungebaute Auto-Pause.
  const losses: string[] = [];
  if (impact.sponsorsOverCap > 0) {
    losses.push(
      `${impact.sponsorsOverCap} ${impact.sponsorsOverCap === 1 ? "Sponsor passt" : "Sponsoren passen"} nicht mehr in Basic (Limit: 5 pro Mannschaft)`
    );
  }
  if (impact.rulesOverCap > 0) {
    losses.push(
      `${impact.rulesOverCap} ${impact.rulesOverCap === 1 ? "Pact-Regel liegt" : "Pact-Regeln liegen"} über dem Basic-Limit (3 pro Sponsor)`
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5 space-y-3">
      <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
        Wenn dein Trial endet
      </h3>
      <p className="text-sm leading-relaxed text-brand-night-navy/80">
        Mit <strong>Pro bleibt alles</strong> wie es ist. Würdest du stattdessen auf{" "}
        <strong>Basic</strong> wechseln, verlierst du:
      </p>
      <ul className="space-y-1.5 text-sm text-brand-night-navy/80">
        {losses.map((l) => (
          <li key={l} className="flex gap-2">
            <span aria-hidden className="text-amber-600">
              ✕
            </span>
            <span>{l}</span>
          </li>
        ))}
        <li className="flex gap-2">
          <span aria-hidden className="text-amber-600">
            ✕
          </span>
          <span>
            kein Zugriff mehr auf: {impact.lostFeatures.join(", ")}
          </span>
        </li>
      </ul>
      <p className="text-xs leading-relaxed text-brand-night-navy/60">
        Mit Pro behältst du alle Sponsoren &amp; Pact-Regeln ohne Limit — nichts
        geht verloren.
      </p>
      <div className="pt-1">
        <CheckoutButtons
          clubSlug={clubSlug}
          plan="pro"
          stripeReady={stripeReady}
          currentStatus={currentStatus}
          cycle={currentCycle}
        />
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
            <strong>Basic → Pro</strong> · ∞ Sponsoren · ∞ Pact-Regeln ·
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
