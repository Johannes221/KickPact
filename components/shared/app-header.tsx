"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HeaderUserMenu } from "@/components/auth/header-user-menu";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isLanding) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLanding]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-white/90 backdrop-blur-md border-b border-brand-neutral/40 shadow-sm"
            : "bg-transparent border-b border-transparent"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo variant="full" />
          <HeaderUserMenu />
        </div>
      </header>
      {/* Spacer auf Nicht-Landing-Pages, damit Content nicht unter dem
          fixed Header verschwindet. Landing nutzt full-bleed Hero, der
          absichtlich hinter den transparenten Header reicht. */}
      {!isLanding && <div aria-hidden className="h-[60px]" />}
    </>
  );
}
