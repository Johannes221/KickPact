/**
 * Hydration-Sicherheit der HeaderUserMenu (Safari-#418-Bug 2026-06-12, Teil 2).
 *
 * `useSession()` liefert auf dem Server IMMER `isPending: true` → der Header
 * rendert das Lade-Skeleton. Beim ERSTEN Seitenaufruf (kalter better-auth-
 * Session-Cache) ist der Client ebenfalls `isPending: true` → Server- und
 * Client-HTML matchen. Nach dem Besuch anderer Seiten ist der Session-Cache
 * jedoch warm: `useSession()` liefert beim ersten Client-Render sofort
 * `isPending: false` + Daten → der Client rendert direkt das Avatar-Menü und
 * weicht vom Server-Skeleton ab → Hydration-Error #418 (nur in Safari/WebKit
 * sichtbar, prod-only, intermittierend je nach Navigations-/Cache-Timing).
 *
 * Invariante: Der erste Render (renderToString, ohne Effects) muss IDENTISCH
 * sein, egal ob die Session kalt (pending) oder warm (aufgelöst) ist. Das echte
 * Menü darf erst NACH dem Mount erscheinen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";

const sessionMock = vi.fn();

vi.mock("@/lib/auth/client", () => ({
  useSession: () => sessionMock(),
  signOut: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sponsor/bilanz"
}));

import { HeaderUserMenu } from "@/components/auth/header-user-menu";

const WARM_SESSION = {
  data: {
    user: {
      id: "u1",
      name: "Test Sponsor",
      email: "test@example.com",
      image: null
    }
  },
  isPending: false
};

const COLD_SESSION = { data: null, isPending: true };

beforeEach(() => {
  sessionMock.mockReset();
});

describe("HeaderUserMenu — Hydration-Invariante", () => {
  it("erster Render ist identisch bei kalter und warmer Session", () => {
    sessionMock.mockReturnValue(COLD_SESSION);
    const coldRender = renderToString(<HeaderUserMenu />);

    sessionMock.mockReturnValue(WARM_SESSION);
    const warmFirstRender = renderToString(<HeaderUserMenu />);

    // Server rendert immer das Skeleton (cold). Der erste Client-Render bei
    // warmem Cache MUSS dasselbe ausgeben — sonst #418 bei der Hydration.
    expect(warmFirstRender).toBe(coldRender);
  });
});
