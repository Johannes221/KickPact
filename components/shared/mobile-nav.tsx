"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession, signOut } from "@/lib/auth/client";
import { activeIdentityFromPath, type ActiveIdentity } from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

type IdentityEntry =
  | { kind: "club"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean }
  | { kind: "team"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean }
  | { kind: "sponsor"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean };

function flattenIdentities(ids: UserIdentities): IdentityEntry[] {
  const entries: IdentityEntry[] = [];
  for (const c of ids.clubs) {
    entries.push({
      kind: "club",
      id: `club-${c.clubId}`,
      href: `/verein/${c.slug}`,
      label: c.name,
      subline: ROLE_LABEL[c.role],
      matches: (a) => a.kind === "club" && a.slug === c.slug
    });
  }
  for (const t of ids.teamOnly) {
    entries.push({
      kind: "team",
      id: `team-${t.teamId}`,
      href: `/verein/${t.clubSlug}/mannschaft/${t.teamId}`,
      label: t.teamName,
      subline: `${t.clubName} · ${ROLE_LABEL[t.role]}`,
      matches: (a) =>
        a.kind === "team" && a.slug === t.clubSlug && a.teamId === t.teamId
    });
  }
  if (ids.sponsor) {
    const sp = ids.sponsor;
    entries.push({
      kind: "sponsor",
      id: `sponsor-${sp.id}`,
      href: "/sponsor",
      label: sp.displayName,
      subline: "Sponsor",
      matches: (a) => a.kind === "sponsor"
    });
  }
  return entries;
}

function emojiFor(kind: IdentityEntry["kind"]): string {
  if (kind === "club") return "🏟️";
  if (kind === "team") return "⚽";
  return "💚";
}

const PUBLIC_NAV = [
  { href: "/preise", label: "Preise" },
  { href: "/login", label: "Anmelden" }
] as const;

// Untergeordnete Aktionen (z.B. Footer-Links) — bewusst klein gehalten,
// die primäre Navigation läuft über Identity-Tiles bzw. Sub-Navs der
// jeweiligen Bereiche.
const SECONDARY_NAV = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" }
] as const;

export function MobileNav({ onHero = false }: { onHero?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [identities, setIdentities] = useState<UserIdentities | null>(null);

  // Drawer schließen wenn Route wechselt — Link-Klick navigiert, Drawer-State
  // bleibt sonst hängen weil Radix das nicht von alleine erkennt.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!session?.user) {
      setIdentities(null);
      return;
    }
    fetch("/api/user/roles")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UserIdentities | null) => setIdentities(d))
      .catch(() => {
        /* silent — Drawer rendert ohne Identity-Liste, ist kein Show-Stopper */
      });
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerColor = onHero
    ? "text-white hover:bg-white/10 hover:text-white"
    : "text-brand-night-navy hover:bg-brand-off-white";

  const active = activeIdentityFromPath(pathname);
  const entries = identities ? flattenIdentities(identities) : [];
  const currentEntry = entries.find((e) => e.matches(active)) ?? null;
  const otherEntries = entries.filter((e) => !e.matches(active));

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    "?";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Menü öffnen"
          className={cn(
            "h-11 w-11 md:hidden",
            "focus-visible:ring-2 focus-visible:ring-accent",
            triggerColor
          )}
        >
          <Menu className="h-6 w-6" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Hauptnavigation und Rollenwechsel
          </SheetDescription>

          {!isPending && session?.user && (
            <div className="mt-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-accent text-white text-sm font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                  Angemeldet als
                </div>
                <div className="truncate text-sm font-medium text-brand-night-navy">
                  {session.user.email}
                </div>
              </div>
            </div>
          )}
        </SheetHeader>

        <nav
          className="flex-1 overflow-y-auto px-5 py-4"
          aria-label="Hauptmenü"
        >
          {!session?.user ? (
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} pathname={pathname}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li className="pt-2">
                <SheetClose asChild>
                  <Link
                    href="/signup?role=mannschaft"
                    className={cn(
                      "flex min-h-12 items-center justify-center rounded-lg",
                      "bg-accent px-4 text-sm font-bold text-white",
                      "hover:bg-accent-dark transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    )}
                  >
                    Mannschaft anlegen →
                  </Link>
                </SheetClose>
              </li>
            </ul>
          ) : (
            <>
              {currentEntry && (
                <section className="mb-5">
                  <div className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                    Aktuelle Rolle
                  </div>
                  <SheetClose asChild>
                    <Link
                      href={currentEntry.href}
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="text-xl" aria-hidden>
                        {emojiFor(currentEntry.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-brand-night-navy">
                          {currentEntry.label}
                        </span>
                        <span className="block truncate text-xs text-brand-night-navy/60">
                          {currentEntry.subline}
                        </span>
                      </span>
                    </Link>
                  </SheetClose>
                </section>
              )}

              {otherEntries.length > 0 && (
                <section className="mb-5">
                  <div className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                    Wechseln zu
                  </div>
                  <ul className="space-y-1.5">
                    {otherEntries.map((e) => (
                      <li key={e.id}>
                        <SheetClose asChild>
                          <Link
                            href={e.href}
                            className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-neutral/30 bg-white px-3 py-2 hover:border-accent/40 hover:bg-accent/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <span className="text-xl" aria-hidden>
                              {emojiFor(e.kind)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-brand-night-navy">
                                {e.label}
                              </span>
                              <span className="block truncate text-xs text-brand-night-navy/60">
                                {e.subline}
                              </span>
                            </span>
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <div className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                  Konto
                </div>
                <ul className="space-y-1">
                  <li>
                    <SheetClose asChild>
                      <Link
                        href="/signup"
                        className="flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-night-navy hover:bg-brand-off-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span className="text-base" aria-hidden>
                          +
                        </span>
                        Neue Rolle hinzufügen
                      </Link>
                    </SheetClose>
                  </li>
                  {/* "Preise" bewusst NICHT im eingeloggten Bereich — der
                      User hat schon ein Abo/Trial, Marketing-Link wäre Lärm.
                      Wer trotzdem hin will, kommt über die Marketing-Landing
                      oder /verein/[slug]/abo (Plan-Wechsel). */}
                </ul>
              </section>
            </>
          )}
        </nav>

        <SheetFooter>
          {session?.user ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full justify-center"
              onClick={async () => {
                await signOut();
                setOpen(false);
                router.push("/");
                router.refresh();
              }}
            >
              Abmelden
            </Button>
          ) : (
            <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {SECONDARY_NAV.map((l) => (
                <li key={l.href}>
                  <SheetClose asChild>
                    <Link
                      href={l.href}
                      className="text-xs text-brand-night-navy/50 hover:text-brand-night-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    >
                      {l.label}
                    </Link>
                  </SheetClose>
                </li>
              ))}
            </ul>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({
  href,
  pathname,
  children
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <SheetClose asChild>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          active
            ? "bg-accent/10 text-accent-dark"
            : "text-brand-night-navy hover:bg-brand-off-white"
        )}
      >
        {children}
      </Link>
    </SheetClose>
  );
}
