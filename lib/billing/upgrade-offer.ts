import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/stripe/pricing";
import { FEATURE_BY_PLAN } from "@/lib/billing/plan-features-catalog";

/**
 * EINE Quelle für „diese Aktion ist gesperrt — hier geht's zum Abo".
 *
 * Ersetzt die kryptische Mini-Fehlermeldung („Diese Mannschaft ist im
 * Read-Only-Modus."), die als Sonner-Toast unten aufploppte, wenn ein
 * abgelaufener Zugang Cover/Galerie/Profil blockte. Jede Stelle, die an einem
 * Abo-Limit scheitert, geht durch `resolveUpgradeOffer` + <UpgradeGate> —
 * nicht pro Stelle neu erfunden.
 *
 * Pure + DB-frei + kein "server-only": wird sowohl von Server-Components
 * (Gate-Auflösung) als auch von der Client-Komponente <UpgradeGate> importiert.
 *
 * ─── APPLE ANTI-STEERING (Guideline 3.1.1 / 3.1.3) ───────────────────────────
 * `ctaHref` zeigt IMMER auf die interne Abo-Seite — nie in den Browser, nie auf
 * `/preise`, nie auf einen Stripe-/Zahlungs-Link. Das ist Absicht und der Kern
 * der Anti-Steering-Garantie: die Abo-Seite entscheidet SERVERSEITIG per
 * `isNativeAppRequest()`, ob sie den nativen StoreKit-Kauf (<NativeAboActions>,
 * inkl. 3.1.2-Laufzeit-/Verlängerungshinweis) oder die Stripe-Buttons rendert.
 *
 * Damit hängt die Anti-Steering-Korrektheit NICHT an der Plattform-Erkennung im
 * Client: selbst wenn `nativeApp` hier falsch wäre, bliebe das Ziel dieselbe
 * interne Route — nur die Button-Beschriftung wäre suboptimal. `nativeApp`
 * steuert ausschließlich Wording, niemals das Ziel.
 */

/** Warum ist die Aktion gesperrt? */
export type LockKind =
  /** Abo gekündigt/abgelaufen (inkl. abgelaufener Gratis-Trial) → Upsell. */
  | "expired"
  /** Zahlung offen jenseits der Grace-Period → kein Upsell, Zahlung klären. */
  | "past_due"
  /** Saison-Pass-Sommerpause (Jun/Jul) → kein Upsell, der Verein zahlt ja. */
  | "paused"
  /** Tier-Cap erreicht (z.B. 5 Sponsoren auf Basic) → Upsell. */
  | "cap";

/**
 * Struktureller Gate-Shape statt `SubscriptionGate` — hält dieses Modul frei
 * von `lib/db/queries/*` (das zieht den DB-Client) und damit client-importierbar.
 */
export interface GateLike {
  status: string;
  isReadOnly: boolean;
  reason: string | null;
}

/** Fehler-Code im JSON der Upload-Routen — Gegenstück zu HTTP 402. */
export const UPGRADE_REQUIRED_CODE = "upgrade-required";

/**
 * Typisierter Marker für „an einem Abo-Limit gescheitert" (Pendant zum
 * bestehenden `PlanCapExceededError` in `plan-features.ts`). Die Guards in
 * `lib/auth/scope.ts` werfen den statt eines nackten `Error`, damit die
 * Route-Handler den Abo-Fall von einem echten Upload-Fehler unterscheiden
 * können, ohne die Fehler-MELDUNG zu parsen (bricht bei jeder Textänderung).
 *
 * Die Message bleibt bewusst unverändert („… Read-Only-Modus …"): sie ist der
 * Fallback für alle Aufrufer, die den Typ (noch) nicht auswerten.
 */
export class UpgradeRequiredError extends Error {
  constructor(
    public readonly lock: LockKind,
    message: string
  ) {
    super(message);
    this.name = "UpgradeRequiredError";
  }
}

export function isUpgradeRequiredError(e: unknown): e is UpgradeRequiredError {
  return e instanceof UpgradeRequiredError;
}

/**
 * Übersetzt das Subscription-Gate in einen Sperr-Grund. `null` = nicht gesperrt.
 *
 * Wichtig für die Ehrlichkeit der Meldung: `paused` und `past_due` sind zwar
 * beide read-only, aber KEIN Upgrade-Fall — einem zahlenden Saison-Pass-Verein
 * in der Sommerpause „jetzt zu Pro upgraden" anzubieten wäre schlicht gelogen.
 */
export function lockFromGate(gate: GateLike): LockKind | null {
  if (!gate.isReadOnly) return null;
  if (gate.status === "paused") return "paused";
  if (gate.status === "past_due") return "past_due";
  // cancelled | incomplete — inkl. reason "trial_expired" (nie bezahlter Trial).
  return "expired";
}

/**
 * Ziel-Tarif des Upsells — nie ein Downgrade. Johannes' Vorgabe „immer der Push
 * in Pro" gilt ab Basic; ein Vereinslizenz-Inhaber bekommt weiter Verein
 * angeboten (Pro wäre für ihn ein Rückschritt).
 */
export function upsellTargetPlan(
  currentPlan: PlanKey,
  minPlan: PlanKey = "pro"
): PlanKey {
  return PLAN_ORDER.indexOf(currentPlan) >= PLAN_ORDER.indexOf(minPlan)
    ? currentPlan
    : minPlan;
}

/**
 * Der richtige Abo-Pfad — spiegelt die Logik aus dem Vereins-Layout:
 * basic/pro pflegen ihr Abo im Mannschafts-Kontext, Vereinslizenzen im
 * Vereins-Abo. Ohne `teamId` bleibt nur das Vereins-Abo.
 */
export function aboPathFor(input: {
  clubSlug: string;
  teamId: string | null;
  plan: PlanKey;
}): string {
  const teamScoped =
    (input.plan === "basic" || input.plan === "pro") && input.teamId;
  return teamScoped
    ? `/verein/${input.clubSlug}/mannschaft/${input.teamId}/abo`
    : `/verein/${input.clubSlug}/abo`;
}

export interface UpgradeOffer {
  lock: LockKind;
  /** Tarif, auf den der CTA zielt. `null` = kein Upsell (past_due / paused). */
  targetPlan: PlanKey | null;
  title: string;
  body: string;
  /** Was der Ziel-Tarif freischaltet. Leer, wenn kein Upsell. */
  highlights: string[];
  ctaLabel: string;
  /** IMMER eine interne Abo-Route (siehe Anti-Steering im Modul-Header). */
  ctaHref: string;
}

export function resolveUpgradeOffer(input: {
  lock: LockKind;
  /** Aktuell lizenzierter Tarif der Mannschaft. */
  currentPlan: PlanKey;
  /** Läuft die App in der nativen iOS-Hülle? Steuert NUR das Wording. */
  nativeApp: boolean;
  clubSlug: string;
  teamId: string | null;
  /** Was ist gesperrt — nominativ + großgeschrieben, z.B. „Die Galerie". */
  feature: string;
}): UpgradeOffer {
  const { lock, currentPlan, nativeApp, clubSlug, teamId, feature } = input;

  // Kein Upsell bei past_due/paused: der Kunde zahlt bereits bzw. hat ein
  // Zahlungs-, kein Tarif-Problem. Ziel bleibt die Abo-Seite (dort liegen
  // Kundenportal / Zahlungsdaten bzw. der Saison-Pass-Status).
  if (lock === "past_due" || lock === "paused") {
    return {
      lock,
      targetPlan: null,
      title: `${feature} ist gerade gesperrt`,
      body:
        lock === "past_due"
          ? "Deine letzte Zahlung ist noch offen. Sobald sie durch ist, kannst du sofort weitermachen."
          : "Dein Saison-Pass pausiert im Juni und Juli. Ab August ist alles wieder freigeschaltet.",
      highlights: [],
      ctaLabel: lock === "past_due" ? "Zahlung prüfen" : "Abo ansehen",
      ctaHref: aboPathFor({ clubSlug, teamId, plan: currentPlan })
    };
  }

  const targetPlan = upsellTargetPlan(currentPlan);
  const planLabel = PLANS[targetPlan].label;
  const isReactivate = lock === "expired" && targetPlan === currentPlan;

  return {
    lock,
    targetPlan,
    title:
      lock === "cap"
        ? `${feature} ist im ${PLANS[currentPlan].label}-Tarif begrenzt`
        : `${feature} ist gesperrt`,
    body:
      lock === "cap"
        ? FEATURE_BY_PLAN[targetPlan].upgradeHeadline
        : isReactivate
          ? `Dein ${planLabel}-Abo läuft nicht mehr. Reaktiviere es, und alles ist sofort wieder da — deine Pacts, Spieldaten und Bilder bleiben erhalten.`
          : `Im kostenlosen Zugang ist das nicht drin. Mit ${planLabel} schaltest du es frei — deine Daten bleiben, wo sie sind.`,
    highlights: FEATURE_BY_PLAN[targetPlan].highlights,
    ctaLabel: isReactivate
      ? `${planLabel} reaktivieren`
      : nativeApp
        ? `${planLabel} freischalten`
        : `Jetzt zu ${planLabel} upgraden`,
    // Ziel-TARIF entscheidet über den Pfad: wer auf die Vereinslizenz geht,
    // bucht sie im Vereins-Abo, nicht im Mannschafts-Abo.
    ctaHref: aboPathFor({ clubSlug, teamId, plan: targetPlan })
  };
}
