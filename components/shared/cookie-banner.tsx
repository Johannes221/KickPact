"use client";

import Link from "next/link";
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
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

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

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie- und Datenschutz-Hinweis"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 md:px-5 md:pb-5"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5 shadow-2xl shadow-brand-night-navy/15">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex-1 text-sm text-brand-night-navy/80">
            <p className="font-semibold text-brand-night-navy">
              Kurz zur Transparenz.
            </p>
            <p className="mt-1 leading-relaxed">
              KickPact setzt nur das technisch notwendige Login-Cookie. Für
              anonyme Reichweiten-Messung nutzen wir Plausible Analytics — ohne
              Cookies, ohne Tracking, ohne personenbezogene Daten. Details
              findest du in der{" "}
              <Link
                href="/datenschutz"
                className="underline font-semibold hover:text-accent"
              >
                Datenschutz­erklärung
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 items-center md:items-start">
            <Button
              variant="accent"
              size="sm"
              onClick={acknowledge}
              className="min-w-32"
            >
              Verstanden
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
