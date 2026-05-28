import Link from "next/link";

interface ChecklistItem {
  done: boolean;
  label: string;
  hint: string;
  href: string;
}

/**
 * "Anstehende Aufgaben" — kompakte Setup-Checkliste auf der Team-Übersicht.
 * Erscheint nur, solange noch offene Schritte existieren; ist alles erledigt,
 * rendert die Komponente nichts. Reine Fortschritts-Anzeige (keine Alarm-
 * Banner — die laufen separat oben für Verifikation/Trial).
 */
export function TeamSetupChecklist({ items }: { items: ChecklistItem[] }) {
  const open = items.filter((i) => !i.done);
  if (open.length === 0) return null;

  const doneCount = items.length - open.length;

  return (
    <section
      aria-label="Anstehende Aufgaben"
      className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Anstehende Aufgaben
        </h3>
        <span className="text-xs font-semibold text-brand-night-navy/50">
          {doneCount}/{items.length} erledigt
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <div className="flex items-start gap-3 rounded-xl bg-brand-off-white/60 p-3">
                <span className="text-accent shrink-0" aria-hidden>✓</span>
                <span className="text-sm text-brand-night-navy/50 line-through">
                  {item.label}
                </span>
              </div>
            ) : (
              <Link
                href={item.href}
                className="flex items-start gap-3 rounded-xl border border-brand-neutral/40 p-3 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
              >
                <span
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-brand-neutral"
                  aria-hidden
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-brand-night-navy">
                    {item.label}
                  </span>
                  <span className="block text-xs text-brand-night-navy/60">
                    {item.hint}
                  </span>
                </span>
                <span className="text-brand-night-navy/30 shrink-0" aria-hidden>→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
