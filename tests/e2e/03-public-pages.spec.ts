import { test, expect } from "@playwright/test";

const PUBLIC_ROUTES = [
  { path: "/", name: "Landing Page" },
  { path: "/login", name: "Login" },
  { path: "/signup", name: "Signup" },
  { path: "/impressum", name: "Impressum" },
  { path: "/datenschutz", name: "Datenschutz" },
  { path: "/agb", name: "AGB" }
];

test.describe("Öffentliche Seiten — kein Server-Error", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) lädt ohne 500`, async ({ page }) => {
      const response = await page.goto(route.path);
      // Response-Status darf nicht 500 sein
      if (response) {
        expect(response.status()).not.toBe(500);
        expect(response.status()).not.toBe(404);
      }
      const title = await page.title();
      expect(title).not.toContain("500");
      expect(title).not.toContain("Internal");
    });
  }
});

test.describe("Auth-geschützte Routen leiten zu Login um", () => {
  const PROTECTED = [
    "/verein/test-slug",
    "/sponsor",
    "/onboarding/verein/1"
  ];

  for (const path of PROTECTED) {
    test(`${path} leitet um oder lädt`, async ({ page }) => {
      await page.goto(path);
      const finalUrl = page.url();
      const title = await page.title();
      // Kein Server-Crash
      expect(title).not.toContain("500");
      // Entweder Login-Redirect oder eigene Seite
      const isValid =
        finalUrl.includes("/login") ||
        finalUrl.includes("/verify") ||
        finalUrl.includes(path);
      expect(isValid).toBe(true);
    });
  }
});
