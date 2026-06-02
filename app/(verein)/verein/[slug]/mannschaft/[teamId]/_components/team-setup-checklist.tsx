import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { CollapsibleSection } from "@/components/shared/collapsible-section";

interface ChecklistItem {
  done: boolean;
  label: string;
  hint: string;
  href: string;
}

/**
 * "Anstehende Aufgaben" — Setup-Checkliste auf der Team-Übersicht, jetzt als
 * ein-/ausklappbare iOS-Disclosure (CollapsibleSection). Erscheint nur, solange
 * offene Schritte existieren; ist alles erledigt, rendert sie nichts.
 *
 * Der Auf/Zu-Zustand wird pro Mannschaft persistiert (`storageKey`), damit ein
 * einmal zugeklappter Block zugeklappt bleibt.
 */
export function TeamSetupChecklist({
  items,
  storageKey
}: {
  items: ChecklistItem[];
  storageKey?: string;
}) {
  const open = items.filter((i) => !i.done);
  if (open.length === 0) return null;

  const doneCount = items.length - open.length;

  return (
    <CollapsibleSection
      title="Anstehende Aufgaben"
      storageKey={storageKey}
      defaultOpen
      right={
        <span className="text-[13px] font-semibold text-brand-night-navy/45">
          {doneCount}/{items.length} erledigt
        </span>
      }
    >
      <ul className="space-y-2">
        {items.map((item) =>
          item.done ? (
            <li
              key={item.label}
              className="flex items-center gap-3 rounded-xl bg-brand-off-white/70 p-3"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-dark">
                <Check className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-sm text-brand-night-navy/45 line-through">
                {item.label}
              </span>
            </li>
          ) : (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-brand-neutral/40 p-3 transition-colors hover:border-accent/40 hover:bg-brand-off-white/60"
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-brand-neutral"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-night-navy">
                    {item.label}
                  </span>
                  <span className="block text-[13px] leading-snug text-brand-night-navy/60">
                    {item.hint}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-brand-night-navy/30"
                  aria-hidden
                />
              </Link>
            </li>
          )
        )}
      </ul>
    </CollapsibleSection>
  );
}
