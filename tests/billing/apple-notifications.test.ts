import { describe, it, expect } from "vitest";
import { mapAppleNotificationToStatus } from "@/lib/billing/apple-notifications";

describe("mapAppleNotificationToStatus", () => {
  it("SUBSCRIBED / DID_RENEW → active", () => {
    expect(mapAppleNotificationToStatus("SUBSCRIBED")).toBe("active");
    expect(mapAppleNotificationToStatus("DID_RENEW")).toBe("active");
    expect(mapAppleNotificationToStatus("OFFER_REDEEMED")).toBe("active");
  });

  it("DID_FAIL_TO_RENEW (billing retry) → past_due", () => {
    expect(mapAppleNotificationToStatus("DID_FAIL_TO_RENEW")).toBe("past_due");
  });

  it("EXPIRED / GRACE_PERIOD_EXPIRED → cancelled", () => {
    expect(mapAppleNotificationToStatus("EXPIRED")).toBe("cancelled");
    expect(mapAppleNotificationToStatus("GRACE_PERIOD_EXPIRED")).toBe("cancelled");
  });

  it("REFUND / REVOKE → cancelled", () => {
    expect(mapAppleNotificationToStatus("REFUND")).toBe("cancelled");
    expect(mapAppleNotificationToStatus("REVOKE")).toBe("cancelled");
  });

  it("DID_CHANGE_RENEWAL_STATUS / _PREF → active (läuft bis Periodenende)", () => {
    expect(mapAppleNotificationToStatus("DID_CHANGE_RENEWAL_STATUS")).toBe("active");
    expect(mapAppleNotificationToStatus("DID_CHANGE_RENEWAL_PREF")).toBe("active");
  });

  it("unknown type → null (Endpoint antwortet 200, kein Write)", () => {
    expect(mapAppleNotificationToStatus("SOME_FUTURE_TYPE")).toBeNull();
  });
});
