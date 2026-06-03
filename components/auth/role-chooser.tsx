import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { BrandBackdrop } from "@/components/shared/brand-backdrop";

export type RoleTile = {
  icon: LucideIcon;
  title: string;
  tagline: string;
  href: string;
};

/**
 * Kompakter Rollen-Chooser fürs Onboarding — passt auf einen Mobile-Screen
 * ohne Scrollen. Kleine tippbare Tiles (Icon + Titel + eine Kurzzeile), kein
 * aufgeblähter Titelblock. Geteilt zwischen ausgeloggtem 3-Wege-Chooser und dem
 * „Rolle hinzufügen"-Chooser für eingeloggte Nutzer.
 */
export function RoleChooser({
  badge,
  heading,
  subline,
  tiles,
  footer
}: {
  badge?: string;
  heading: string;
  subline: string;
  tiles: RoleTile[];
  footer?: React.ReactNode;
}) {
  return (
    <main className="native-shell relative w-full overflow-hidden px-6 pb-8 pt-2">
      <BrandBackdrop variant="dots" className="!fixed" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        {badge && (
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent-dark">
            {badge}
          </span>
        )}
        <h1 className="mt-3 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {heading}
        </h1>
        <p className="mt-1.5 text-sm text-brand-night-navy/55">{subline}</p>

        <div className="mt-6 space-y-3">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="group flex items-center gap-4 rounded-2xl border border-brand-neutral/40 bg-white/90 p-4 backdrop-blur-sm transition-all hover:border-accent hover:shadow-md active:scale-[0.99]"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent-dark">
                  <Icon className="h-6 w-6" strokeWidth={2.1} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-[17px] tracking-tight text-brand-night-navy">
                    {t.title}
                  </div>
                  <div className="truncate text-[13px] text-brand-night-navy/55">
                    {t.tagline}
                  </div>
                </div>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-brand-night-navy/25 transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>

        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </main>
  );
}
