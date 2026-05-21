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

interface UserContext {
  hasSponsor: boolean;
  clubs: Array<{ slug: string; name: string }>;
}

export function HeaderUserMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [ctx, setCtx] = useState<UserContext | null>(null);

  // Kontext laden sobald eingeloggt (clubs + sponsor-status)
  useEffect(() => {
    if (!session?.user) { setCtx(null); return; }
    fetch("/api/user/context")
      .then((r) => r.json())
      .then((d) => setCtx(d))
      .catch(() => {/* silent */});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return <div className="h-10 w-24 animate-pulse rounded-md bg-neutral-100" />;
  }

  if (!session?.user) {
    return (
      <div className="flex gap-1.5 sm:gap-2">
        <Button variant="ghost" size="sm" asChild className="text-xs sm:text-sm px-2.5 sm:px-3">
          <Link href="/login">Login</Link>
        </Button>
        <Button variant="default" size="sm" asChild className="text-xs sm:text-sm px-2.5 sm:px-3">
          <Link href="/signup">Mannschaft anlegen</Link>
        </Button>
      </div>
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
        <Button variant="ghost" className="gap-2 rounded-full">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-brand-night-navy text-xs text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline max-w-[12rem] truncate">
            {session.user.name ?? session.user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      {/* Explizite weiße bg + dunkler Text — ohne diesen Override greift
          das shadcn-default mit oklch(..) Syntax, die Tailwind v3.4 nicht
          parsed → Dropdown wirkt durchsichtig auf dem Foto-Hintergrund. */}
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

        {/* Sponsor-Bereich */}
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

        {/* Vereins-Bereiche (dynamisch nach API-Call) */}
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
