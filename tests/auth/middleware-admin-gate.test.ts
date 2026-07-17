import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const APP_UA = "Mozilla/5.0 KickPactApp/1.0";

function req(
  path: string,
  opts: { session?: boolean; ua?: string } = {}
): NextRequest {
  const r = new NextRequest(new URL(`https://kickpact.com${path}`), {
    headers: opts.ua ? { "user-agent": opts.ua } : {}
  });
  if (opts.session) r.cookies.set("better-auth.session_token", "x");
  return r;
}

function redirectTarget(res: Response): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
}

describe("middleware — /admin gate", () => {
  it("redirects anonymous visitors away from the panel", () => {
    const res = middleware(req("/admin/dashboard"));
    expect(res.status).toBe(307);
    expect(redirectTarget(res)).toBe("/admin/login");
  });

  it("redirects anonymous visitors away from the panel root", () => {
    expect(redirectTarget(middleware(req("/admin")))).toBe("/admin/login");
  });

  it("lets a session-bearing request through to the layout guard", () => {
    // Die Middleware autorisiert NICHT — sie prüft nur Cookie-Präsenz.
    // assertPlatformAdmin() im Layout wirft einen Nicht-Operator danach raus.
    const res = middleware(req("/admin/dashboard", { session: true }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps the login flow reachable without a session", () => {
    for (const p of ["/admin/login", "/admin/forgot-password", "/admin/reset-password"]) {
      expect(middleware(req(p)).headers.get("location")).toBeNull();
    }
  });

  it("does not strand an anonymous visitor on a path that merely starts with 'admin'", () => {
    // /admin-foo darf nicht vom Gate erfasst werden.
    expect(middleware(req("/admin-foo")).headers.get("location")).toBeNull();
  });

  it("drops query params on the login redirect (kein Open-Redirect-Vektor)", () => {
    const r = new NextRequest(
      new URL("https://kickpact.com/admin/users?next=https://evil.example")
    );
    const loc = middleware(r).headers.get("location");
    expect(loc).toBe("https://kickpact.com/admin/login");
  });
});

describe("middleware — App-Entry-Gate bleibt unberührt", () => {
  it("sends the logged-out app to /willkommen", () => {
    expect(redirectTarget(middleware(req("/", { ua: APP_UA })))).toBe("/willkommen");
  });

  it("sends the logged-in app to /dashboard", () => {
    expect(redirectTarget(middleware(req("/", { ua: APP_UA, session: true })))).toBe(
      "/dashboard"
    );
  });

  it("leaves the browser landing page alone", () => {
    const res = middleware(req("/", { ua: "Mozilla/5.0 Safari" }));
    expect(res.headers.get("location")).toBeNull();
  });
});
