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
          <Link href="/signup">Verein anlegen</Link>
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
        <Button variant="ghost" className="gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-oklch(0.205 0 0) text-xs text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline">{session.user.name ?? session.user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-xs text-neutral-500">Angemeldet als</div>
          <div className="truncate">{session.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/sponsor">Sponsor-Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
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
