"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderUserMenu } from "@/components/auth/header-user-menu";
import { Logo } from "@/components/shared/logo";
import { MobileNav } from "@/components/shared/mobile-nav";
import { cn } from "@/lib/utils";

// Desktop-Center-Nav ist bewusst leer. „Preise" ist im Footer + als Inline-
// Link in der Landing-Page erreichbar — der Header-Center-Slot bleibt clean.
const PUBLIC_DESKTOP_NAV: ReadonlyArray<{ href: string; label: string }> = [];

export interface AppHeaderProps {
  /** True wenn ein Better-Auth-Session-Cookie aktiv ist (vom Server geladen). */
  authenticated: boolean;
  /**
   * Ziel-URL für das Logo, wenn der User eingeloggt ist. Wird vom Server-Layout
   * aus `pickDashboardDestination(getUserIdentities(userId))` gefüllt. Fallback
   * auf "/" wenn unauthenticated.
   */
  dashboardHref: string;
}

export function AppHeader({ authenticated, dashboardHref }: AppHeaderProps) {
  const pathname = usePathname() ?? "/";
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isLanding) {
      // Auf allen Nicht-Landing-Seiten zeigen wir den Header sofort
      // im "scrolled"-Style (weiße Bar mit Shadow). Spec: leichter
      // Shadow ab Scroll > 50px — auf Landing macht das den Übergang
      // weich vom transparenten Hero zur weißen Bar.
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLanding]);

  const onHero = isLanding && !scrolled;
  // Eingeloggte User springen vom Logo direkt ins Dashboard (oder
  // /select-role bei mehreren Identities) — niemals auf die Marketing-
  // Landing. Unauthenticated user → "/" wie gehabt.
  const logoHref = authenticated ? dashboardHref : "/";
  // Marketing-Nav ("Preise") ist im eingeloggten Bereich Lärm — der User
  // hat bereits ein Abo (oder ist im Trial), zeigt ihm hier kein Marketing.
  // Auf /preise selbst lassen wir den Link, falls jemand bewusst dahin
  // navigiert hat (Selbst-Highlight + Konsistenz mit aria-current).
  const desktopNav =
    !authenticated || pathname.startsWith("/preise") ? PUBLIC_DESKTOP_NAV : [];

  return (
    <>
      <header
        className={cn(
          // pt-safe: auf iOS rückt die Header-Bar unter den Notch/Statusbar;
          // im Browser ist env(safe-area-inset-top)=0, also kein Effekt.
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 pt-[env(safe-area-inset-top)]",
          scrolled
            ? "bg-white/90 backdrop-blur-md border-b border-brand-neutral/40 shadow-sm"
            : "bg-transparent border-b border-transparent"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 md:px-6 py-3">
          {/* Hero hat Mobile-only einen dunklen Top-Overlay (Foto füllt
              komplett), Desktop hat einen weißen Gradient links wo das
              Logo sitzt. Lösung: zwei Logo-Renders, einer mobile-inverted,
              einer desktop-normal. Beide Image-Tags pre-cachen sich gegenseitig. */}
          <div className="shrink-0">
            {onHero ? (
              <>
                <div className="md:hidden">
                  <Logo variant="full" inverted href={logoHref} />
                </div>
                <div className="hidden md:block">
                  <Logo variant="full" href={logoHref} />
                </div>
              </>
            ) : (
              <Logo variant="full" href={logoHref} />
            )}
          </div>

          {/* Desktop-Center-Nav. Mobile-Hamburger ersetzt das.
              Im eingeloggten Bereich ist die zentrale Nav leer — die
              identity-Navigation läuft komplett über das UserMenu rechts. */}
          <nav
            aria-label="Hauptnavigation"
            className="hidden md:flex flex-1 items-center justify-center gap-1"
          >
            {desktopNav.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                    onHero
                      ? active
                        ? "text-white bg-white/15"
                        : "text-white/85 hover:text-white hover:bg-white/10"
                      : active
                      ? "text-accent-dark bg-accent/10"
                      : "text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-brand-off-white"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Menüpunkte rechts: weiß auf Hero (Foto-Overlay liefert Kontrast),
              dunkel auf gescrollter/normaler weißer Header-Bar.
              Mobile: zusätzlich Hamburger-Button für Drawer. */}
          <div className="flex items-center gap-1 shrink-0">
            <HeaderUserMenu onHero={onHero} />
            <MobileNav onHero={onHero} />
          </div>
        </div>
      </header>
      {/* Spacer auf Nicht-Landing-Pages, damit Content nicht unter dem
          fixed Header verschwindet. Landing nutzt full-bleed Hero, der
          absichtlich hinter den transparenten Header reicht. */}
      {!isLanding && (
        <div aria-hidden className="h-[calc(60px+env(safe-area-inset-top))]" />
      )}
    </>
  );
}
