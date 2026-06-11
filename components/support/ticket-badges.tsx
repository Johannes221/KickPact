import { cn } from "@/lib/utils";
import type {
  SupportStatus,
  SupportPriority,
  SupportCategory,
  SupportContextType
} from "@/lib/db/queries/support";

export const STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  waiting: "Wartet auf dich",
  closed: "Geschlossen"
};

const STATUS_CLASS: Record<SupportStatus, string> = {
  open: "bg-accent/15 text-accent-dark",
  in_progress: "bg-sky-100 text-sky-800",
  waiting: "bg-amber-100 text-amber-800",
  closed: "bg-brand-neutral/30 text-brand-night-navy/60"
};

export const PRIORITY_LABEL: Record<SupportPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend"
};

const PRIORITY_CLASS: Record<SupportPriority, string> = {
  low: "bg-brand-neutral/30 text-brand-night-navy/60",
  normal: "bg-brand-off-white text-brand-night-navy/70 border border-brand-neutral/40",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-rose-100 text-rose-700"
};

export const CATEGORY_LABEL: Record<SupportCategory, string> = {
  frage: "Frage",
  bug: "Bug",
  abrechnung: "Abrechnung",
  spieldaten: "Spieldaten",
  sonstiges: "Sonstiges"
};

export const CONTEXT_LABEL: Record<SupportContextType, string> = {
  none: "—",
  match: "⚽ Spiel",
  invoice: "🧾 Rechnung",
  pledge: "🤝 Pact",
  team: "👥 Mannschaft",
  page: "📄 Seite"
};

function pill(label: string, klass: string) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide",
        klass
      )}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: SupportStatus }) {
  return pill(STATUS_LABEL[status], STATUS_CLASS[status]);
}

export function PriorityBadge({ priority }: { priority: SupportPriority }) {
  return pill(PRIORITY_LABEL[priority], PRIORITY_CLASS[priority]);
}

export function CategoryBadge({ category }: { category: SupportCategory }) {
  return pill(CATEGORY_LABEL[category], "bg-brand-off-white text-brand-night-navy/70 border border-brand-neutral/40");
}

export function ContextBadge({ contextType }: { contextType: SupportContextType }) {
  if (contextType === "none") return null;
  return (
    <span className="inline-flex items-center rounded-full bg-brand-off-white border border-brand-neutral/40 px-2 py-0.5 text-[0.65rem] font-semibold text-brand-night-navy/70">
      {CONTEXT_LABEL[contextType]}
    </span>
  );
}
