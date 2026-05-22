"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Dashboard", href: "" },         // /verein/[slug]
  { label: "Ereignisse", href: "/ereignisse" },
  { label: "Sponsoren", href: "/sponsoren" },
  { label: "Abrechnungen", href: "/abrechnungen" },
  { label: "Abo", href: "/abo" },
  { label: "Einstellungen", href: "/einstellungen" }
];

export function VereinSubNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/verein/${slug}`;

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 no-scrollbar">
      {TABS.map(({ label, href }) => {
        const fullHref = `${base}${href}`;
        const isActive = href === ""
          ? pathname === base
          : pathname === fullHref || pathname.startsWith(fullHref + "/");

        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
              isActive
                ? "bg-white text-brand-night-navy shadow-sm ring-1 ring-brand-neutral/20"
                : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
