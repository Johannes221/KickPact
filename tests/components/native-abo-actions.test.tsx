import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/platform/iap", () => ({
  getProducts: vi.fn().mockResolvedValue([]),
  purchaseAndVerify: vi.fn(),
  restoreAndVerify: vi.fn()
}));

const { NativeAboActions } = await import(
  "@/app/(verein)/verein/[slug]/abo/_components/native-abo-actions"
);

describe("<NativeAboActions>", () => {
  it("renders upgrade + restore affordances and no web price / browser steering", () => {
    // useEffect runs not under renderToString → prices stay unloaded ("—"), fine.
    const html = renderToString(
      <NativeAboActions clubSlug="x" currentPlan="basic" hasSub={true} />
    );
    expect(html).toMatch(/wiederherstellen/i);
    expect(html).toMatch(/freischalten/i);
    // Anti-Steering: no web "€ / Monat" price string, no "Browser" steering.
    expect(html).not.toMatch(/€\s*\/\s*Monat/i);
    expect(html).not.toMatch(/Browser/i);
  });

  it("shows no upgrade cards at the highest tier but keeps restore", () => {
    const html = renderToString(
      <NativeAboActions clubSlug="x" currentPlan="verein" hasSub={true} />
    );
    expect(html).toMatch(/wiederherstellen/i);
    expect(html).not.toMatch(/freischalten/i);
    expect(html).toMatch(/höchsten Tarif/i);
  });
});
