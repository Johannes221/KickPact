"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "kickpact-consent-v1";

/**
 * Minimaler Cookie/Consent-Banner.
 *
 * KickPact lädt von Drittseiten nur Plausible (privacy-friendly, kein Cookie,
 * keine PII). Funktional notwendig: better-auth Session-Cookie (keine
 * Consent-Pflicht laut TTDSG § 25 Abs. 2 Nr. 2). Trotzdem informieren wir
 * Erstbesucher transparent — DSGVO Art. 13 + e-Privacy.
 *
 * Banner verschwindet nach erstem Acknowledge (localStorage), erscheint bei
 * Privacy-Mode/Inkognito jedes Mal neu. Bewusst kein Auswahl-Modal weil wir
 * keine Tracking-Cookies setzen — ein „nur notwendig"-Schalter wäre
 * irreführend, weil es nichts zu deaktivieren gibt.
 */
const NATIVE_CHROMELESS_PREFIXES = ["/login", "/signup", "/select-role"];

export function CookieBanner({ isNativeApp = false }: { isNativeApp?: boolean }) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage gesperrt (z.B. Privacy-Mode) → Banner zeigen, aber
      // Akzept funktioniert nur diese Session.
      setVisible(true);
    }
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ acceptedAt: new Date().toISOString() })
      );
    } catch {
      /* still hide */
    }
    setVisible(false);
  }

  // In der nativen App gibt es keinen Cookie-Banner — kein Browser-Storage-
  // Consent nötig, und er gehört nicht ins native App-Gefühl.
  if (isNativeApp) return null;
  // App-Intro (/willkommen): keine Chrome.
  if (pathname === "/willkommen" || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie- und Datenschutz-Hinweis"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-neutral/40 bg-white/95 backdrop-blur pb-safe shadow-[0_-4px_20px_-12px_rgba(26,26,46,0.25)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
        <p className="min-w-0 flex-1 text-xs leading-snug text-brand-night-navy/75 md:text-sm">
          Wir nutzen ein technisch notwendiges Login-Cookie und anonyme
          Reichweitenmessung (Plausible).{" "}
          <Link
            href="/datenschutz"
            className="font-semibold text-accent-dark underline underline-offset-2 hover:text-accent"
          >
            Mehr
          </Link>
        </p>
        <Button
          variant="accent"
          size="sm"
          onClick={acknowledge}
          className="shrink-0"
        >
          Verstanden
        </Button>
      </div>
    </div>
  );
}
