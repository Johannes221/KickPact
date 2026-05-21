"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Dashboard", href: "" },         // /verein/[slug]
  { label: "Sponsoren", href: "/sponsoren" },
  { label: "Abrechnungen", href: "/abrechnungen" },
  { label: "Abo", href: "/abo" }
];

export function VereinSubNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/verein/${slug}`;

  return (
    <nav className="flex gap-0.5 overflow-x-auto rounded-xl bg-brand-night-navy/5 p-1 no-scrollbar">
      {TABS.map(({ label, href }) => {
        const fullHref = `${base}${href}`;
        // Dashboard ist aktiv nur genau auf /verein/[slug]
        const isActive = href === ""
          ? pathname === base
          : pathname === fullHref || pathname.startsWith(fullHref + "/");

        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
              isActive
                ? "bg-white text-brand-night-navy shadow-sm"
                : "text-brand-night-navy/50 hover:text-brand-night-navy hover:bg-white/60"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
