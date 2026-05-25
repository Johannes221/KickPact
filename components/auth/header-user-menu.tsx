"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "@/lib/auth/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { activeIdentityFromPath, type ActiveIdentity } from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

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

export function HeaderUserMenu({ onHero = false }: { onHero?: boolean }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [identities, setIdentities] = useState<UserIdentities | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setIdentities(null);
      return;
    }
    fetch("/api/user/roles")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIdentities(d))
      .catch(() => {/* silent */});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-md bg-white/10" />;
  }

  if (!session?.user) {
    const linkBase = "text-sm font-semibold transition-colors";
    const linkColor = onHero
      ? "text-white/90 hover:text-white drop-shadow-sm"
      : "text-brand-night-navy/70 hover:text-brand-night-navy";
    return (
      <>
        <nav className="hidden sm:flex items-center gap-5">
          <Link href="/login" className={cn(linkBase, linkColor)}>
            Login
          </Link>
          <span
            aria-hidden
            className={cn(
              "h-4 w-px",
              onHero ? "bg-white/30" : "bg-brand-night-navy/20"
            )}
          />
          <Link href="/signup?role=mannschaft" className={cn(linkBase, linkColor)}>
            Mannschaft anlegen
          </Link>
        </nav>
        <nav className="sm:hidden">
          <Link href="/signup" className={cn(linkBase, linkColor)}>
            Loslegen →
          </Link>
        </nav>
      </>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? session.user.email[0].toUpperCase();

  const entries = identities ? flattenIdentities(identities) : [];
  const active = activeIdentityFromPath(pathname);
  const currentEntry = entries.find((e) => e.matches(active)) ?? null;
  const otherEntries = entries.filter((e) => !e.matches(active));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "gap-2 rounded-full px-2 md:px-3",
            onHero && "text-white hover:bg-white/10 hover:text-white"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-accent text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "hidden md:inline max-w-[12rem] truncate font-medium",
              onHero ? "text-white drop-shadow-sm" : "text-brand-night-navy"
            )}
          >
            {currentEntry?.label ?? session.user.name ?? session.user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 bg-white text-brand-night-navy border border-brand-neutral/40 shadow-lg"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
            Angemeldet als
          </div>
          <div className="mt-0.5 truncate font-medium text-brand-night-navy">
            {session.user.email}
          </div>
        </DropdownMenuLabel>

        {currentEntry && (
          <>
            <DropdownMenuSeparator className="bg-brand-neutral/40" />
            <DropdownMenuLabel className="px-3 pt-2 pb-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                Aktuelle Rolle
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem
              asChild
              className="cursor-pointer text-brand-night-navy bg-accent/5 focus:bg-accent/10 focus:text-accent-dark"
            >
              <Link href={currentEntry.href}>
                <span className="mr-2 text-base">{emojiFor(currentEntry.kind)}</span>
                <span className="flex-1 truncate">
                  <span className="block truncate font-semibold">{currentEntry.label}</span>
                  <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                    {currentEntry.subline}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {otherEntries.length > 0 && (
          <>
            <DropdownMenuSeparator className="bg-brand-neutral/40" />
            <DropdownMenuLabel className="px-3 pt-2 pb-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                Wechseln zu
              </div>
            </DropdownMenuLabel>
            {otherEntries.map((e) => (
              <DropdownMenuItem
                key={e.id}
                asChild
                className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
              >
                <Link href={e.href}>
                  <span className="mr-2 text-base">{emojiFor(e.kind)}</span>
                  <span className="flex-1 truncate">
                    <span className="block truncate font-medium">{e.label}</span>
                    <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                      {e.subline}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
        >
          <Link href="/signup">
            <span className="mr-2 text-base">+</span>Neue Rolle hinzufügen
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        <DropdownMenuItem
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
