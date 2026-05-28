import Link from "next/link";

/**
 * Trial-Countdown mit Verlust-Aversion. Während des gesamten Trials sichtbar
 * (nicht erst in den letzten Tagen), mit nach Restlaufzeit eskalierender
 * Dringlichkeit. Zeigt aktive Pledges als Verlust-Hebel und verlinkt den
 * plan-korrekten Abo-Pfad (Mannschaft vs. Verein).
 */
export function TrialBanner({
  trialEndsAt,
  aboHref,
  activePledgeCount
}: {
  trialEndsAt: Date;
  aboHref: string;
  activePledgeCount: number;
}) {
  const daysLeft = Math.max(
    0,
    Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const endDate = trialEndsAt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  // Eskalierende Tonalität: entspannt > 7 Tage, gelb ≤ 7, rot ≤ 3.
  const urgent = daysLeft <= 3;
  const soon = daysLeft <= 7;
  const tone = urgent
    ? "border-brand-alert-red/40 bg-brand-alert-red/5"
    : soon
      ? "border-amber-300 bg-amber-50"
      : "border-accent/30 bg-accent/5";
  const textTone = urgent
    ? "text-brand-alert-red"
    : soon
      ? "text-amber-900"
      : "text-accent-dark";

  const dayWord = daysLeft === 1 ? "Tag" : "Tage";

  return (
    <div className={`mb-5 md:mb-8 rounded-2xl border p-4 md:p-5 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className={`text-sm ${textTone}`}>
          <p>
            <span aria-hidden className="mr-1.5">⏳</span>
            <strong>
              Pro-Trial — noch {daysLeft} {dayWord}
            </strong>{" "}
            <span className="opacity-80">(endet am {endDate})</span>
          </p>
          {activePledgeCount > 0 ? (
            <p className="mt-1 opacity-90">
              Verlier nicht deine{" "}
              <strong>
                {activePledgeCount} aktiven Pledge{activePledgeCount === 1 ? "" : "s"}
              </strong>{" "}
              — aktiviere dein Abo, damit das Sponsoring nahtlos weiterläuft.
            </p>
          ) : (
            <p className="mt-1 opacity-90">
              Aktiviere dein Abo, damit das Sponsoring ohne Unterbrechung
              weiterläuft.
            </p>
          )}
        </div>
        <Link
          href={aboHref}
          className={
            "shrink-0 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors " +
            (urgent
              ? "bg-brand-alert-red hover:bg-brand-alert-red/90"
              : "bg-accent hover:bg-accent-dark")
          }
        >
          Abo aktivieren →
        </Link>
      </div>
    </div>
  );
}
