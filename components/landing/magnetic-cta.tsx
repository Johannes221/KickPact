"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primärer CTA im „Button-in-Button"-Stil: ein Pill-Button mit Trailing-Icon,
 * das in seinem eigenen kleinen Kreis sitzt. Beim Hover schiebt der Icon-Kreis
 * diagonal raus (magnetic) und der Button drückt sich beim Klick leicht runter
 * (active:scale) — taktiles, „lebendiges" Feedback.
 *
 * Bewegung nur via transform. `@media (hover:hover)`-Gating ist nicht nötig,
 * weil group-hover auf Touch-Geräten ohnehin nicht feuert; reduced-motion
 * unterdrückt die Transition über die globale CSS-Regel in globals.css.
 */
export function MagneticCTA({
  href,
  children,
  className,
  variant = "accent",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "accent" | "outline";
}) {
  const isAccent = variant === "accent";
  return (
    <Link
      href={href}
      className={cn(
        "group relative inline-flex h-11 items-center gap-3 rounded-full pl-6 pr-2 text-sm font-semibold transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        isAccent
          ? "bg-accent text-white hover:bg-accent/90"
          : "border border-brand-neutral bg-white text-brand-night-navy hover:bg-brand-off-white",
        className
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105",
          isAccent ? "bg-white/20" : "bg-accent/10"
        )}
      >
        <ArrowUpRight
          className={cn("h-4 w-4", isAccent ? "text-white" : "text-accent-dark")}
        />
      </span>
    </Link>
  );
}
