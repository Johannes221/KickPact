"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Letzte Auffanglinie: greift, wenn schon das Root-Layout wirft — dort kann
 * `app/error.tsx` nicht mehr rendern. Ersetzt das komplette Dokument, muss
 * daher eigenes <html>/<body> mitbringen und darf sich NICHT auf globales CSS
 * oder Fonts verlassen (die kommen aus dem Layout, das hier gerade kaputt ist)
 * → bewusst Inline-Styles.
 *
 * Sentry weist beim Build ausdrücklich auf diese Datei hin: ohne sie werden
 * React-Render-Fehler gar nicht gemeldet.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "global-error" } });
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#F7F7F5",
          color: "#151823",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 8px" }}>
            Da ist was schiefgelaufen.
          </h1>
          <p style={{ margin: "0 0 20px", opacity: 0.7, lineHeight: 1.6 }}>
            KickPact konnte nicht geladen werden. Der Fehler ist bei uns
            gemeldet. Versuch es noch einmal.
          </p>
          {error.digest && (
            <code
              style={{
                display: "block",
                margin: "0 0 20px",
                padding: "8px",
                background: "#fff",
                borderRadius: "8px",
                fontSize: "0.75rem",
                wordBreak: "break-all"
              }}
            >
              {error.digest}
            </code>
          )}
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: "999px",
              padding: "12px 24px",
              background: "#00C853",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 700
            }}
          >
            Nochmal versuchen
          </button>
        </main>
      </body>
    </html>
  );
}
