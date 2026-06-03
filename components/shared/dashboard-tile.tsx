import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardTileProps {
  icon: LucideIcon;              // Lucide-Icon-Komponente
  title: string;
  primary?: string;              // big number / value
  secondary?: string;            // sub-line
  href?: string;                 // makes the whole tile clickable
  variant?: "default" | "cta";   // cta tiles get accent background
  className?: string;
  children?: React.ReactNode;    // optional custom body below the primary/secondary block
}

/**
 * Reusable tile for the Vereins- and Sponsor-Dashboards. Mobile-stacked,
 * desktop-gridded by parent. Optional href turns the whole surface into a
 * link (anchor, not button — preserves right-click "open in new tab").
 */
export function DashboardTile({
  icon: Icon,
  title,
  primary,
  secondary,
  href,
  variant = "default",
  className,
  children
}: DashboardTileProps) {
  const Tag = href ? Link : "div";
  const tagProps = href ? { href } : {};
  return (
    <Tag
      {...(tagProps as { href: string })}
      className={cn(
        // iOS grouped card: shadow-only (no border), tactile press.
        "group block rounded-2xl p-5 shadow-ios-card transition-shadow",
        href && "press",
        variant === "cta"
          ? "bg-accent text-white hover:bg-accent-dark"
          : "bg-ios-card text-brand-night-navy hover:shadow-ios-elevated",
        href && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-[0.65rem] font-semibold uppercase tracking-widest",
              variant === "cta" ? "text-white/80" : "text-brand-night-navy/50"
            )}
          >
            {title}
          </div>
          {primary && (
            <div
              className={cn(
                "mt-1 font-display font-bold text-2xl md:text-3xl tracking-tight",
                variant === "cta" ? "text-white" : "text-brand-night-navy"
              )}
            >
              {primary}
            </div>
          )}
          {secondary && (
            <div
              className={cn(
                "mt-1 text-xs",
                variant === "cta" ? "text-white/80" : "text-brand-night-navy/60"
              )}
            >
              {secondary}
            </div>
          )}
        </div>
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full",
            variant === "cta" ? "bg-white/20 text-white" : "bg-accent/10 text-accent-dark"
          )}
          aria-hidden
        >
          <Icon className="h-[1.3rem] w-[1.3rem]" />
        </span>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {href && (
        <div
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-xs font-semibold transition-transform group-hover:translate-x-0.5",
            variant === "cta" ? "text-white" : "text-accent"
          )}
        >
          {variant === "cta" ? "Los geht's" : "Öffnen"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </div>
      )}
    </Tag>
  );
}
