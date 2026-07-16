import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const { ErrorBoundary } = await import("@/components/shared/error-boundary");

/**
 * Regression 2026-07-16: Es gab im ganzen Projekt KEINE ErrorBoundary — eine
 * werfende Client-Komponente (z.B. die StoreKit-Bridge) riss die komplette
 * Route in app/error.tsx mit.
 *
 * Grenze dieser Tests: Das Abfangen selbst passiert clientseitig
 * (getDerivedStateFromError/componentDidCatch). `renderToString` löst Error-
 * Boundaries NICHT aus — ein Throw propagiert dort. Hier wird deshalb der
 * Vertrag geprüft (Pass-Through + Fehlerzustand + Fallback-Markup), nicht
 * Reacts eigene Client-Semantik.
 */
describe("<ErrorBoundary>", () => {
  it("rendert Kinder unverändert durch, wenn nichts wirft", () => {
    const html = renderToString(
      <ErrorBoundary label="test">
        <p>alles gut</p>
      </ErrorBoundary>
    );
    expect(html).toMatch(/alles gut/);
  });

  it("schaltet über getDerivedStateFromError in den Fehlerzustand", () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it("zeigt im Fehlerzustand den eigenen Fallback statt der Kinder", () => {
    const boundary = new ErrorBoundary({
      label: "test",
      fallback: <p>Ersatz-UI</p>,
      children: <p>darf nicht erscheinen</p>
    });
    boundary.state = { hasError: true };
    const html = renderToString(<>{boundary.render()}</>);
    expect(html).toMatch(/Ersatz-UI/);
    expect(html).not.toMatch(/darf nicht erscheinen/);
  });

  it("hat ohne eigenen Fallback einen verständlichen Default mit role=alert", () => {
    const boundary = new ErrorBoundary({
      label: "test",
      children: <p>darf nicht erscheinen</p>
    });
    boundary.state = { hasError: true };
    const html = renderToString(<>{boundary.render()}</>);
    expect(html).toMatch(/konnte gerade nicht geladen werden/i);
    expect(html).toMatch(/role="alert"/);
    expect(html).not.toMatch(/darf nicht erscheinen/);
  });
});
