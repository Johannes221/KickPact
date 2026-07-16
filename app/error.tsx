"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

/**
 * Root error boundary für alle App-Routes. Next.js mounted das hier wenn
 * ein Server- oder Client-Component-Render throwt und kein näher
 * gelegenes error.tsx greift.
 *
 * Production-Builds maskieren die Original-Message zur Vermeidung von
 * Info-Leaks, aber Next.js stempelt jedem Error einen deterministischen
 * `digest`-Hash auf der dann in Coolify-/Vercel-Logs grep-bar ist. Wir
 * zeigen den Digest im UI, damit User uns den per Screenshot zuwerfen
 * können statt nur "irgendwas ist kaputt" zu sagen.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // An Sentry melden — vorher lief das NUR in die Browser-Konsole, d.h. jeder
    // Render-Fehler beim Nutzer blieb unbemerkt (Server-Logs sehen einen
    // Client-Throw nie). Console-Log bleibt zusätzlich für DevTools-Nutzer.
    Sentry.captureException(error, {
      tags: { boundary: "app-error" },
      extra: { digest: error.digest }
    });
    console.error("[KickPact][error-boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack
    });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:py-24">
      <div className="rounded-2xl border border-brand-alert-red/30 bg-brand-alert-red/5 p-6 md:p-8">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-alert-red/10 text-brand-alert-red">
          <TriangleAlert className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Da ist was schiefgelaufen.
        </h1>
        <p className="mt-2 text-sm text-brand-night-navy/70">
          Die Seite konnte nicht gerendert werden. Wir sehen das im Log und schauen uns
          das an. Du kannst es noch einmal versuchen oder zur Startseite zurück.
        </p>

        {error.digest && (
          <div className="mt-5 rounded-lg border border-brand-neutral/40 bg-white p-3">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-brand-night-navy/50">
              Error-Digest <span className="font-normal normal-case lowercase text-brand-night-navy/60">— für den Support-Screenshot</span>
            </div>
            <code className="mt-1 block font-mono text-xs text-brand-night-navy break-all">
              {error.digest}
            </code>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="accent" onClick={reset}>
            Nochmal versuchen
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-lg border border-brand-neutral/40 bg-white px-4 text-sm font-semibold text-brand-night-navy hover:bg-brand-off-white transition-colors"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}
