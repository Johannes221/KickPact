"use client";

import * as Sentry from "@sentry/nextjs";
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Lokale Fehler-Insel für riskante Teilbereiche.
 *
 * Ohne so eine Boundary reisst EINE werfende Client-Komponente die GESAMTE
 * Route in `app/error.tsx` — der Nutzer verliert die ganze Seite, obwohl nur
 * ein Widget kaputt ist (z.B. StoreKit/native Bridge nicht erreichbar).
 * Damit bleibt der Rest der Seite bedienbar und der Fehler geht an Sentry,
 * statt nur in die Browser-Konsole.
 *
 * Bewusst eine Klasse: React bietet componentDidCatch nur für Klassen an.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    /** Ersatz-UI. Default: dezenter Hinweis, der den Rest der Seite stehen lässt. */
    fallback?: ReactNode;
    /** Landet als Sentry-Tag `boundary` — sonst weiss man nicht, WO es knallte. */
    label: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: this.props.label },
      extra: { componentStack: info.componentStack }
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      this.props.fallback ?? (
        <div
          role="alert"
          className="rounded-2xl border border-brand-night-navy/15 bg-brand-off-white p-4 md:p-5"
        >
          <p className="text-sm text-brand-night-navy/70">
            Dieser Bereich konnte gerade nicht geladen werden. Der Rest der Seite
            funktioniert normal — lade die Seite später noch einmal neu.
          </p>
        </div>
      )
    );
  }
}
