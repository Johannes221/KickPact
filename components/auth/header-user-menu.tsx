"use client";

import { useRouter } from "next/navigation";
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

interface UserContext {
  hasSponsor: boolean;
  clubs: Array<{ slug: string; name: string }>;
}

export function HeaderUserMenu({ onHero = false }: { onHero?: boolean }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [ctx, setCtx] = useState<UserContext | null>(null);

  useEffect(() => {
    if (!session?.user) { setCtx(null); return; }
    fetch("/api/user/context")
      .then((r) => r.json())
      .then((d) => setCtx(d))
      .catch(() => {/* silent */});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-md bg-white/10" />;
  }

  if (!session?.user) {
    // Plain-Text-Menüpunkte statt Buttons — auf Hero weiß, sonst dunkel.
    const linkBase = "text-sm font-semibold transition-colors";
    const linkColor = onHero
      ? "text-white/90 hover:text-white drop-shadow-sm"
      : "text-brand-night-navy/70 hover:text-brand-night-navy";
    return (
      <>
        {/* Desktop: zwei Menüpunkte mit Divider */}
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
          <Link href="/signup" className={cn(linkBase, linkColor)}>
            Mannschaft anlegen
          </Link>
        </nav>
        {/* Mobile: ein einziger Einstieg */}
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

  const showSponsorLink = ctx === null /* noch ladend */ || ctx.hasSponsor;

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
            {session.user.name ?? session.user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 bg-white text-brand-night-navy border border-brand-neutral/40 shadow-lg"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
            Angemeldet als
          </div>
          <div className="mt-0.5 truncate font-medium text-brand-night-navy">
            {session.user.email}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-brand-neutral/40" />

        {showSponsorLink && (
          <DropdownMenuItem
            asChild
            className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          >
            <Link href="/sponsor">
              <span className="mr-2">⚡</span>Sponsor-Dashboard
            </Link>
          </DropdownMenuItem>
        )}

        {ctx?.clubs.map((club) => (
          <DropdownMenuItem
            key={club.slug}
            asChild
            className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          >
            <Link href={`/verein/${club.slug}`}>
              <span className="mr-2">⚽</span>
              <span className="truncate">{club.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}

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
