"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VereinSubNav } from "./verein-sub-nav";
import { VerificationBanner } from "@/components/shared/verification-banner";
import type { EffectivePlan } from "@/lib/db/queries/user-identities";
import type { VerificationBannerProps } from "@/components/shared/verification-banner";

interface Props {
  slug: string;
  clubName: string;
  verifiedAt: Date | null;
  verification: VerificationBannerProps["verification"];
  hasSponsorProfile: boolean;
  effectivePlan: EffectivePlan | null;
}

/**
 * Wrapper um den Vereins-Header (Titel + Sponsor-Switcher + Verifikations-
 * Banner + VereinSubNav). Wird auf Mannschafts-Routen (`/verein/<slug>/
 * mannschaft/<teamId>...`) bei basic/pro-Lizenzen komplett ausgeblendet,
 * damit kein doppeltes Menü neben der TeamSubNav erscheint.
 *
 * Bei Vereinslizenz bleibt der Header sichtbar — Verein-SubNav übernimmt
 * dort die globale Navigation, TeamSubNav ist eine zweite Ebene darunter.
 *
 * Trial-Countdown- und Subscription-Banner laufen außerhalb dieses Shells
 * im Server-Layout weiter, damit sie auch auf Mannschafts-Routen sichtbar
 * bleiben (Zahlungs-Hinweise sind nie kontext-abhängig).
 */
export function VereinHeaderShell({
  slug,
  clubName,
  verifiedAt,
  verification,
  hasSponsorProfile,
  effectivePlan
}: Props) {
  const pathname = usePathname();

  const isOnMannschaftRoute =
    pathname === `/verein/${slug}/mannschaft` ||
    pathname.startsWith(`/verein/${slug}/mannschaft/`);
  const isSingleTeamPlan =
    effectivePlan === "basic" || effectivePlan === "pro";

  if (isOnMannschaftRoute && isSingleTeamPlan) {
    return null;
  }

  return (
    <div className="mb-6 md:mb-10">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="hidden md:block">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
            Vereins-Dashboard
          </p>
          <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
            {clubName}
          </h1>
        </div>

        {/* Kontext-Switcher: nur wenn User auch Sponsor ist */}
        {hasSponsorProfile && (
          <Link
            href="/sponsor"
            className="shrink-0 mt-1 inline-flex items-center gap-1.5 rounded-full border border-brand-neutral/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white hover:text-brand-night-navy transition-colors"
          >
            <span className="text-base leading-none">⚡</span>
            Sponsor-Bereich
          </Link>
        )}
      </div>

      {!verifiedAt && (
        <VerificationBanner
          uploadUrl={`/verein/${slug}/verifikation`}
          verification={verification}
          scope="verein"
        />
      )}

      <VereinSubNav slug={slug} clubName={clubName} />
    </div>
  );
}
