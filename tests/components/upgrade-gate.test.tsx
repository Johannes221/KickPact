import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/billing/checkout-channel", () => ({
  getCheckoutChannel: vi.fn()
}));

const { getCheckoutChannel } = await import("@/lib/billing/checkout-channel");
const { UpgradeGate } = await import("@/components/billing/upgrade-gate");

type ChannelMock = { mockReturnValue: (v: "stripe" | "apple") => void };
const channelMock = getCheckoutChannel as unknown as ChannelMock;

beforeEach(() => vi.clearAllMocks());

describe("<UpgradeGate>", () => {
  it("shows the target plan headline + highlights", () => {
    channelMock.mockReturnValue("stripe");
    const html = renderToString(
      <UpgradeGate targetPlan="pro" trigger="cap" clubSlug="x" />
    );
    expect(html).toMatch(/ohne Limits|unbegrenzt/i);
  });

  it("renders an upgrade CTA on web (Stripe)", () => {
    channelMock.mockReturnValue("stripe");
    const html = renderToString(
      <UpgradeGate targetPlan="pro" trigger="cap" clubSlug="x" />
    );
    expect(html).toMatch(/upgrade/i);
  });

  it("renders the Apple CTA inside the iOS app and shows no web €/Monat price", () => {
    channelMock.mockReturnValue("apple");
    const html = renderToString(
      <UpgradeGate targetPlan="pro" trigger="cap" clubSlug="x" />
    );
    expect(html).toMatch(/freischalten/i);
    expect(html).not.toMatch(/€\s*\/\s*Monat/i);
  });
});
