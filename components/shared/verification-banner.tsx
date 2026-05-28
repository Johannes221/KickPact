import Link from "next/link";
import type { VerificationStatus } from "@/lib/db/queries/verifications";

export interface VerificationBannerProps {
  /** Ziel-URL des Upload-Formulars (Verein- bzw. Mannschafts-Verifikation). */
  uploadUrl: string;
  verification: { status: VerificationStatus; rejectionReason: string | null } | null;
  /** Steuert die Wortwahl (Verein vs. Mannschaft). Default: verein. */
  scope?: "verein" | "mannschaft";
}

const COPY = {
  verein: {
    entity: "Verein",
    cta: "Lade eine Bescheinigung hoch (Vereinsregister-Auszug, Vorstandsbeschluss, …)."
  },
  mannschaft: {
    entity: "Mannschaft",
    cta: "Lade einen Nachweis hoch (Trainerlizenz, Vereinsbestätigung, Mannschaftsfoto, Fußball.de-Eintrag, …)."
  }
} as const;

/**
 * Gelber Banner, der auf Verein-/Mannschafts-Seiten erscheint, solange die
 * Entität nicht verifiziert ist (verifiedAt IS NULL). Drei Zustände je nach
 * letzter Einreichung:
 *   - keine Einreichung → Call-to-Action "Nachweis hochladen"
 *   - pending          → "wir prüfen — kann 1-2 Tage dauern"
 *   - rejected         → Grund + "neu hochladen"
 */
export function VerificationBanner({
  uploadUrl,
  verification,
  scope = "verein"
}: VerificationBannerProps) {
  const { entity, cta } = COPY[scope];

  if (!verification) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>⏳</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-amber-900">
              {entity} noch nicht verifiziert
            </div>
            <p className="mt-1 text-xs text-amber-900/80">
              {cta} Bis dahin werden Rechnungen zurückgehalten und Sponsoren sehen
              einen Hinweis.
            </p>
            <Link
              href={uploadUrl}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline"
            >
              Nachweis hochladen →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === "pending") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>📋</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-amber-900">
              Wir prüfen deinen Nachweis
            </div>
            <p className="mt-1 text-xs text-amber-900/80">
              Innerhalb von 1–2 Werktagen meldet sich unser Team. Bis dahin laufen Pledges,
              Rechnungen werden zurückgehalten.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === "rejected") {
    return (
      <div className="rounded-2xl border border-brand-alert-red/40 bg-brand-alert-red/5 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-brand-alert-red">
              Nachweis abgelehnt
            </div>
            {verification.rejectionReason && (
              <blockquote className="mt-1 border-l-2 border-brand-alert-red/40 pl-3 text-xs italic text-brand-night-navy/70">
                {verification.rejectionReason}
              </blockquote>
            )}
            <Link
              href={uploadUrl}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-alert-red underline"
            >
              Neuen Nachweis hochladen →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
