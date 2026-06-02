"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Plus,
  Settings,
  LogOut,
  ShieldCheck,
  LifeBuoy,
  Hourglass,
  ChevronRight,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useSession, signOut } from "@/lib/auth/client";
import { IdentityIcon } from "@/components/shared/identity-icon";
import {
  activeIdentityFromPath,
  flattenIdentities
} from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";
import type { MyPendingRequest } from "@/lib/db/queries/membership-requests";

export interface SettingsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kontext-Label (z.B. "Mannschaft", "Verein", "Sponsor"). */
  contextLabel: string;
  /** Sekundäre Verwaltungs-Links (was früher hinter "Mehr" lag). */
  overflowItems: SettingsNavItem[];
  /** Aktiver Pfad zum Hervorheben des passenden Verwaltungs-Links. */
  activeHref?: string;
}

/** Kleine Sektions-Überschrift im Sheet. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pb-1.5 pt-1 text-[0.7rem] font-semibold uppercase tracking-wider text-brand-night-navy/45">
      {children}
    </div>
  );
}

/**
 * Zahnrad-Sheet: zentrale Stelle für alles, was nicht in die 5 Tabs passt.
 * Ersetzt auf Mobile das frühere "Mehr"-Tab UND das Avatar-Dropdown
 * (Identity-Switcher, Konto, Abmelden) — plus die Rechtliches-Links, die vorher
 * im Footer standen. So bleibt die Haupt-UI frei von Web-Chrome.
 */
export function SettingsSheet({
  open,
  onOpenChange,
  contextLabel,
  overflowItems,
  activeHref
}: SettingsSheetProps) {
  const { data: session } = useSession();
  const pathname = usePathname() ?? "/";
  const [identities, setIdentities] = useState<UserIdentities | null>(null);
  const [pendingRequests, setPendingRequests] = useState<MyPendingRequest[]>([]);
  const [isOperator, setIsOperator] = useState(false);

  // Rollen erst laden, wenn das Sheet geöffnet wird (spart einen Request pro
  // Screen). Re-Fetch bei Navigation, damit eine frisch angelegte Rolle auftaucht.
  useEffect(() => {
    if (!open || !session?.user) return;
    fetch("/api/user/roles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setIdentities(d);
        setPendingRequests(
          Array.isArray(
            (d as { pendingRequests?: MyPendingRequest[] } | null)?.pendingRequests
          )
            ? (d as { pendingRequests: MyPendingRequest[] }).pendingRequests
            : []
        );
        setIsOperator(
          Boolean((d as { isPlatformAdmin?: boolean } | null)?.isPlatformAdmin)
        );
      })
      .catch(() => {
        /* silent — Menü funktioniert auch ohne Rollenliste */
      });
  }, [open, session?.user?.id, pathname]);

  const entries = identities ? flattenIdentities(identities) : [];
  const active = activeIdentityFromPath(pathname);
  const currentEntry = entries.find((e) => e.matches(active)) ?? null;
  const otherEntries = entries.filter((e) => !e.matches(active));

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="native-font max-h-[88vh] overflow-y-auto rounded-t-3xl border-brand-neutral/30 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <SheetHeader className="px-1">
          <SheetTitle className="text-left text-lg font-bold text-brand-night-navy">
            {contextLabel}
          </SheetTitle>
        </SheetHeader>

        {/* ── Verwaltung ─────────────────────────────────────────────── */}
        {overflowItems.length > 0 && (
          <div className="mt-3">
            <SectionLabel>Verwaltung</SectionLabel>
            <div className="overflow-hidden rounded-2xl border border-brand-neutral/30 bg-white">
              {overflowItems.map((it, i) => {
                const Icon = it.icon;
                const isActive = activeHref === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={close}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-3 text-[15px] font-medium transition-colors",
                      i > 0 && "border-t border-brand-neutral/25",
                      isActive
                        ? "bg-accent/8 text-accent-dark"
                        : "text-brand-night-navy active:bg-brand-off-white"
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid h-9 w-9 shrink-0 place-items-center rounded-full",
                        isActive
                          ? "bg-accent/15 text-accent-dark"
                          : "bg-brand-off-white text-brand-night-navy/70"
                      )}
                    >
                      <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                      {it.badge && it.badge > 0 ? (
                        <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-alert-red px-1 text-[0.55rem] font-bold leading-none text-white ring-2 ring-white">
                          {it.badge > 99 ? "99+" : it.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex-1">{it.label}</span>
                    <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Konto / Rollen ─────────────────────────────────────────── */}
        {session?.user && (
          <div className="mt-4">
            <SectionLabel>Konto</SectionLabel>
            <div className="rounded-2xl border border-brand-neutral/30 bg-white">
              <div className="px-3.5 pt-3 pb-2">
                <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-brand-night-navy/45">
                  Angemeldet als
                </div>
                <div className="mt-0.5 truncate text-[15px] font-medium text-brand-night-navy">
                  {session.user.email}
                </div>
              </div>

              {currentEntry && (
                <Link
                  href={currentEntry.href}
                  onClick={close}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 bg-accent/8 px-3.5 py-3"
                >
                  <IdentityIcon kind={currentEntry.kind} className="h-7 w-7 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-brand-night-navy">
                      {currentEntry.label}
                    </span>
                    <span className="block truncate text-[0.75rem] text-brand-night-navy/55">
                      {currentEntry.subline}
                    </span>
                  </span>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-semibold text-accent-dark">
                    Aktiv
                  </span>
                </Link>
              )}

              {otherEntries.map((e) => (
                <Link
                  key={e.id}
                  href={e.href}
                  onClick={close}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-brand-night-navy active:bg-brand-off-white"
                >
                  <IdentityIcon kind={e.kind} className="h-7 w-7 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {e.label}
                    </span>
                    <span className="block truncate text-[0.75rem] text-brand-night-navy/55">
                      {e.subline}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
                </Link>
              ))}

              {pendingRequests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 opacity-70"
                >
                  <Hourglass className="h-6 w-6 shrink-0 text-amber-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-brand-night-navy">
                      {r.requestedTeamName ?? r.clubName}
                    </span>
                    <span className="block truncate text-[0.75rem] text-amber-700">
                      Zugriff angefragt · wartet auf Freigabe
                    </span>
                  </span>
                </div>
              ))}

              {isOperator ? (
                <Link
                  href="/admin"
                  onClick={close}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-brand-night-navy active:bg-brand-off-white"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
                    <ShieldCheck className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">Admin-Panel</span>
                  <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
                </Link>
              ) : (
                <Link
                  href="/signup?add=1"
                  onClick={close}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-brand-night-navy active:bg-brand-off-white"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
                    <Plus className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">Neue Rolle hinzufügen</span>
                  <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
                </Link>
              )}

              <Link
                href="/konto"
                onClick={close}
                className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-brand-night-navy active:bg-brand-off-white"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
                  <Settings className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                </span>
                <span className="flex-1 text-[15px] font-medium">Mein Konto</span>
                <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
              </Link>

              {!isOperator && (
                <Link
                  href="/konto/support"
                  onClick={close}
                  className="flex items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-brand-night-navy active:bg-brand-off-white"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
                    <LifeBuoy className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">Hilfe &amp; Support</span>
                  <ChevronRight className="h-4 w-4 text-brand-night-navy/30" aria-hidden />
                </Link>
              )}

              <button
                type="button"
                onClick={async () => {
                  // Harter Reload: signOut() löscht das Cookie serverseitig, der
                  // Client-Store hält den User sonst weiter im Cache.
                  try {
                    await signOut();
                  } finally {
                    window.location.href = "/";
                  }
                }}
                className="flex w-full items-center gap-3 border-t border-brand-neutral/25 px-3.5 py-3 text-left text-brand-night-navy active:bg-brand-off-white"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
                  <LogOut className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                </span>
                <span className="flex-1 text-[15px] font-medium">Abmelden</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Rechtliches (ersetzt den Footer) ───────────────────────── */}
        <div className="mt-4">
          <SectionLabel>Rechtliches</SectionLabel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-brand-night-navy/55">
            <Link href="/impressum" onClick={close} className="hover:text-accent-dark">
              Impressum
            </Link>
            <Link href="/datenschutz" onClick={close} className="hover:text-accent-dark">
              Datenschutz
            </Link>
            <Link href="/agb" onClick={close} className="hover:text-accent-dark">
              AGB
            </Link>
            <span className="w-full pt-0.5 text-brand-night-navy/40">
              © {new Date().getFullYear()} KickPact
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
