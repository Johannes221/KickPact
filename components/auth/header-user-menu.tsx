"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "@/lib/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Plus, Settings, LogOut, ShieldCheck, Hourglass, LifeBuoy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderStatusDot } from "@/components/shared/status-bar";
import { IdentityIcon } from "@/components/shared/identity-icon";
import {
  activeIdentityFromPath,
  flattenIdentities
} from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";
import type { MyPendingRequest } from "@/lib/db/queries/membership-requests";

export function HeaderUserMenu({ onHero = false }: { onHero?: boolean }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname() ?? "/";
  const [identities, setIdentities] = useState<UserIdentities | null>(null);
  const [pendingRequests, setPendingRequests] = useState<MyPendingRequest[]>([]);
  const [isOperator, setIsOperator] = useState(false);
  // Hydration-Gate: Auf dem Server liefert useSession() immer `isPending`, der
  // Header rendert also das Skeleton. Bei warmem better-auth-Session-Cache
  // (nach Navigation) liefert useSession() beim ERSTEN Client-Render aber sofort
  // die Session → der Client würde direkt das Avatar-Menü rendern und vom
  // Server-Skeleton abweichen (Hydration-Error #418, Safari-prod-only). Bis zum
  // Mount zeigen wir daher immer das Skeleton — danach das echte Menü.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!session?.user) {
      setIdentities(null);
      setPendingRequests([]);
      setIsOperator(false);
      return;
    }
    // no-store + Re-Fetch bei Navigation: eine frisch angelegte Rolle (z.B. neues
    // Sponsor-Profil) ändert NICHT die session.user.id → ohne pathname-Dep bliebe
    // das Menü stale und die neue Rolle würde fehlen. pathname als Dep sorgt dafür,
    // dass nach dem Wechsel ins neue Dashboard die Rollenliste neu geladen wird.
    fetch("/api/user/roles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setIdentities(d);
        setPendingRequests(
          Array.isArray(
            (d as { pendingRequests?: MyPendingRequest[] } | null)
              ?.pendingRequests
          )
            ? (d as { pendingRequests: MyPendingRequest[] }).pendingRequests
            : []
        );
        setIsOperator(Boolean((d as { isPlatformAdmin?: boolean } | null)?.isPlatformAdmin));
      })
      .catch(() => {/* silent */});
  }, [session?.user?.id, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-md bg-white/10" />;
  }

  if (!session?.user) {
    const linkBase = "text-sm font-semibold transition-colors";
    // Auf dem Hero (Foto-Hintergrund mit ggf. hellen Stellen): translucent
    // Pill als Backdrop hinter den Links → Text bleibt lesbar auch bei
    // weißen Bereichen im Foto. Auf weißer Header-Bar normaler Dark-Text.
    if (onHero) {
      return (
        <>
          <nav
            className={cn(
              "hidden sm:flex items-center gap-3 rounded-full",
              "bg-black/35 backdrop-blur-md px-4 py-1.5 ring-1 ring-white/10"
            )}
          >
            <Link href="/login" className={cn(linkBase, "text-white hover:text-white/80")}>
              Login
            </Link>
            <span aria-hidden className="h-3.5 w-px bg-white/40" />
            <Link
              href="/signup"
              className={cn(linkBase, "text-white hover:text-white/80")}
            >
              Registrieren
            </Link>
          </nav>
          <nav className="sm:hidden">
            <Link
              href="/signup"
              className={cn(
                linkBase,
                "text-white rounded-full bg-black/35 backdrop-blur-md px-3 py-1.5 ring-1 ring-white/10"
              )}
            >
              Loslegen →
            </Link>
          </nav>
        </>
      );
    }
    const linkColor = "text-brand-night-navy/70 hover:text-brand-night-navy";
    return (
      <>
        <nav className="hidden sm:flex items-center gap-5">
          <Link href="/login" className={cn(linkBase, linkColor)}>
            Login
          </Link>
          <span aria-hidden className="h-4 w-px bg-brand-night-navy/20" />
          <Link href="/signup" className={cn(linkBase, linkColor)}>
            Registrieren
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

  // Initialen NUR aus dem Namen (Vorname + Nachname). Apple-Private-Relay liefert
  // oft keinen Namen → dann KEINE Relay-Mail-Initiale (z.B. „2"), sondern unten
  // ein neutrales Personen-Icon als Fallback.
  const initials =
    session.user.name
      ?.split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || null;

  // Avatar-Quelle: externe OAuth-URLs (Google/Apple) direkt rendern — der
  // /api/user/avatar-Roundtrip entfällt. Storage-Keys (r2://, local://) sind
  // nicht direkt ladbar → durch den Route-Handler. Ohne Bild gar kein <img>.
  const avatarSrc = session.user.image
    ? /^https?:\/\//.test(session.user.image)
      ? session.user.image
      : "/api/user/avatar"
    : null;

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
          <span className="relative inline-flex">
            <Avatar className="h-8 w-8">
              {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
              <AvatarFallback className="bg-accent text-white text-xs font-bold">
                {initials ?? <User className="h-4 w-4" aria-hidden />}
              </AvatarFallback>
            </Avatar>
            <HeaderStatusDot />
          </span>
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
                <IdentityIcon kind={currentEntry.kind} className="mr-2 h-7 w-7" />
                <span className="flex-1 min-w-0">
                  <span className="block break-words font-semibold">{currentEntry.label}</span>
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
                  <IdentityIcon kind={e.kind} className="mr-2 h-7 w-7" />
                  <span className="flex-1 min-w-0">
                    <span className="block break-words font-medium">{e.label}</span>
                    <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                      {e.subline}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {pendingRequests.length > 0 && (
          <>
            <DropdownMenuSeparator className="bg-brand-neutral/40" />
            <DropdownMenuLabel className="px-3 pt-2 pb-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                Angefragt
              </div>
            </DropdownMenuLabel>
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-2 opacity-70"
              >
                <Hourglass className="mr-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block break-words text-sm font-medium text-brand-night-navy">
                    {r.requestedTeamName ?? r.clubName}
                  </span>
                  <span className="block truncate text-[0.7rem] text-amber-700">
                    Zugriff angefragt · wartet auf Freigabe
                  </span>
                </span>
              </div>
            ))}
          </>
        )}

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        {isOperator ? (
          // Operator-Accounts haben keine Nutzer-Rolle und dürfen keine anlegen
          // (keine Doppelrolle) → statt "Neue Rolle" der Weg ins Backoffice.
          <DropdownMenuItem
            asChild
            className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          >
            <Link href="/admin">
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
              Admin-Panel
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            asChild
            className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          >
            <Link href="/signup?add=1">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Neue Rolle hinzufügen
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
        >
          <Link href="/konto">
            <Settings className="mr-2 h-4 w-4" aria-hidden />
            Mein Konto
          </Link>
        </DropdownMenuItem>

        {!isOperator && (
          <DropdownMenuItem
            asChild
            className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          >
            <Link href="/konto/support">
              <LifeBuoy className="mr-2 h-4 w-4" aria-hidden />
              Hilfe &amp; Support
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          onSelect={async () => {
            // Harter Reload statt router.push/refresh: signOut() löscht das
            // Session-Cookie serverseitig, aber der useSession-Nanostore (client)
            // behält den User im Cache → soft-refresh zeigt weiter "angemeldet".
            // window.location erzwingt frische Cookie-Auswertung + Store-Reset.
            try {
              await signOut();
            } finally {
              window.location.href = "/";
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
