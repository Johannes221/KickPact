"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import type { PlanKey } from "@/lib/stripe/pricing";
import {
  resolveUpgradeOffer,
  type LockKind,
  type UpgradeOffer
} from "@/lib/billing/upgrade-offer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

/**
 * DIE Upgrade-Aufforderung der App — eine Komponente, überall wiederverwendet,
 * wo ein Abo-Limit blockt (Cover, Logo, Galerie, öffentliches Profil, Caps).
 * Nicht pro Stelle neu erfinden.
 *
 * Ersetzt die kryptische Mini-Fehlermeldung („Diese Mannschaft ist im
 * Read-Only-Modus."), die als Toast unten aufploppte: klare Aussage WAS
 * gesperrt ist, WARUM (Tarif/Zahlung/Sommerpause) und ein prominenter CTA auf
 * den richtigen Abo-Pfad.
 *
 * ─── APPLE ANTI-STEERING (3.1.1 / 3.1.3) ────────────────────────────────────
 * Der CTA ist ein <Link> auf die INTERNE Abo-Seite — nie ein Browser-Link, nie
 * „/preise", nie ein direkter Stripe-Aufruf. Die Abo-Seite entscheidet
 * serverseitig (`isNativeAppRequest()`), ob der native StoreKit-Kauf oder
 * Stripe erscheint. Deshalb steht hier bewusst KEIN `purchaseAndVerify` und
 * KEIN `createCheckoutSession`:
 *   1. Der frühere Inline-Apple-Kauf hätte ohne den 3.1.2-Pflichthinweis
 *      (Laufzeit + Auto-Renew + EULA/Datenschutz am Kaufpunkt) gekauft — den
 *      liefert nur <NativeAboActions> auf der Abo-Seite.
 *   2. Der frühere Inline-Stripe-Checkout war auf `cycle: "monthly"` verdrahtet
 *      und hat den Saison-Pass (67 % günstiger) unterschlagen.
 * `nativeApp` steuert hier ausschließlich das Wording, NIE das Ziel — die
 * Anti-Steering-Garantie hängt damit nicht an der Plattform-Erkennung.
 */

export interface UpgradeGateProps {
  /** Warum ist gesperrt? Aus `lockFromGate(gate)` bzw. „cap". */
  lock: LockKind;
  /** Aktuell lizenzierter Tarif der Mannschaft. */
  currentPlan: PlanKey;
  clubSlug: string;
  teamId?: string | null;
  /** Was ist gesperrt — nominativ, großgeschrieben: „Die Galerie". */
  feature: string;
  /**
   * Native iOS-Hülle? Kommt serverseitig aus `isNativeAppRequest()` und wird
   * als Prop durchgereicht (nicht per `window` im Render ermittelt) — sonst
   * Hydration-Mismatch (#418) und ein kurzes Anti-Steering-Fenster, in dem der
   * Web-Text in der App steht.
   */
  nativeApp?: boolean;
}

function offerFrom(props: UpgradeGateProps): UpgradeOffer {
  return resolveUpgradeOffer({
    lock: props.lock,
    currentPlan: props.currentPlan,
    nativeApp: props.nativeApp ?? false,
    clubSlug: props.clubSlug,
    teamId: props.teamId ?? null,
    feature: props.feature
  });
}

/** Inline-Variante — für Stellen, an denen die Sperre dauerhaft sichtbar ist. */
export function UpgradeGate(props: UpgradeGateProps) {
  const offer = offerFrom(props);
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-dark">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-brand-night-navy">
            {offer.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-brand-night-navy/70">
            {offer.body}
          </p>
          <OfferHighlights offer={offer} />
          <Button asChild variant="accent" className="mt-4">
            <Link href={offer.ctaHref}>{offer.ctaLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function OfferHighlights({ offer }: { offer: UpgradeOffer }) {
  if (offer.highlights.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {offer.highlights.map((h) => (
        <li
          key={h}
          className="flex items-start gap-2 text-sm text-brand-night-navy/70"
        >
          <Sparkles
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
            aria-hidden
          />
          <span>{h}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Modale Variante — DAS ist die „richtige Fehlermeldung" statt des Toasts:
 * erscheint, wenn der Nutzer eine gesperrte Aktion auslöst.
 *
 * Radix übernimmt Fokus-Falle + Announcement über Title/Description; ein
 * zusätzliches aria-live wäre im Modal redundant und würde doppelt vorlesen.
 */
export function UpgradeGateDialog({
  open,
  onOpenChange,
  ...props
}: UpgradeGateProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const offer = offerFrom(props);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <span className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-dark">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <DialogTitle className="font-display tracking-tight">
            {offer.title}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {offer.body}
          </DialogDescription>
        </DialogHeader>

        <OfferHighlights offer={offer} />

        <DialogFooter className="gap-2 sm:flex-col-reverse">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:w-full"
          >
            Später
          </Button>
          <Button asChild variant="accent" className="sm:w-full">
            <Link href={offer.ctaHref}>{offer.ctaLabel}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
