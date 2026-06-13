import { describe, it, expect } from "vitest";
import { isExpectedUserError } from "@/lib/observability/expected-errors";

describe("isExpectedUserError", () => {
  it("erkennt erwartete User-Flow-Ablehnungen (Sentry soll sie droppen)", () => {
    expect(
      isExpectedUserError(
        "Diese Mannschaft ist bereits bei KickPact registriert. Frag beim zuständigen Admin Zugriff an."
      )
    ).toBe(true);
    expect(isExpectedUserError("Diese Mannschaft ist bereits vollständig onboarded.")).toBe(true);
    expect(isExpectedUserError("Diese Mannschaft nimmt aktuell keine Anfragen entgegen.")).toBe(true);
    expect(isExpectedUserError("Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen.")).toBe(true);
  });

  it("lässt echte Bugs/Infra-Fehler durch (NICHT droppen)", () => {
    expect(isExpectedUserError("Insert match_event fehlgeschlagen")).toBe(false);
    expect(isExpectedUserError("Stripe nicht konfiguriert")).toBe(false);
    expect(isExpectedUserError("Cannot read properties of undefined (reading 'u')")).toBe(false);
    expect(isExpectedUserError("Mannschaft nicht gefunden.")).toBe(false); // generisch → drin lassen
  });

  it("ist robust gegen null/leer", () => {
    expect(isExpectedUserError(null)).toBe(false);
    expect(isExpectedUserError(undefined)).toBe(false);
    expect(isExpectedUserError("")).toBe(false);
  });
});
