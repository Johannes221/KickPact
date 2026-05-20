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

export function HeaderUserMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 rounded-full">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-brand-night-navy text-xs text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline max-w-[12rem] truncate">{session.user.name ?? session.user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      {/* Explizite weiße bg + dunkler Text — ohne diese override greift
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
        <DropdownMenuItem
          asChild
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
        >
          <Link href="/sponsor">Sponsor-Dashboard</Link>
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
