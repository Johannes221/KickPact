import Link from "next/link";
import { cn } from "@/lib/utils";

export interface DashboardTileProps {
  icon: string;                  // emoji or short string
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
  icon,
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
        "group block rounded-2xl border p-5 transition-all",
        variant === "cta"
          ? "border-accent bg-accent text-white hover:bg-accent-dark"
          : "border-brand-neutral/40 bg-white text-brand-night-navy hover:border-accent/60 hover:shadow-md",
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
                "mt-1 font-display font-black text-2xl md:text-3xl tracking-tight",
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
        <div
          className={cn(
            "text-2xl shrink-0",
            variant === "cta" ? "opacity-90" : "opacity-80"
          )}
          aria-hidden
        >
          {icon}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {href && (
        <div
          className={cn(
            "mt-4 inline-flex items-center text-xs font-semibold transition-transform group-hover:translate-x-0.5",
            variant === "cta" ? "text-white" : "text-accent"
          )}
        >
          {variant === "cta" ? "Los geht's →" : "Öffnen →"}
        </div>
      )}
    </Tag>
  );
}
