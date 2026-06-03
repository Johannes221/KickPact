import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Eine beschriftete, horizontal scrollbare Filter-Zeile (Label + Chips).
 * Mobile-first: Chips brechen nicht um, sondern scrollen horizontal weg
 * (`no-scrollbar`), damit jede Dimension genau eine Zeile bleibt.
 */
export function FilterRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-12 shrink-0 text-[0.6rem] font-bold uppercase tracking-widest text-brand-night-navy/40">
        {label}
      </span>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 no-scrollbar">
        {children}
      </div>
    </div>
  );
}

/** Pill-Chip für FilterRow. Aktiv = Akzent-gefüllt, inaktiv = weiße Outline. */
export function FilterChip({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-accent text-white shadow-ios-card"
          : "bg-white shadow-ios-card text-brand-night-navy/60 hover:border-brand-neutral hover:text-brand-night-navy"
      )}
    >
      {children}
    </Link>
  );
}
