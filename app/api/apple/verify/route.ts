import { NextRequest, NextResponse } from "next/server";
import { isAppleIapConfigured, verifyTransaction } from "@/lib/apple/verifier";
import { assertClubAccess } from "@/lib/auth/scope";
import { appleProductToPlanCycle } from "@/lib/stripe/pricing";
import {
  getSubscriptionProvider,
  getClubIdByOriginalTransactionId,
  syncAppleSubscriptionForClub,
  setTeamLicensesPlanForSubscription
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Part B — Sofort-Verifikation nach Client-Kauf (StoreKit). Session-gated:
 * nur der eingeloggte Club-Admin darf einen Kauf SEINEM Club zuordnen.
 * Kanal-Invariante: kein Apple-Kauf, wenn der Club bereits über Stripe zahlt.
 */
export async function POST(req: NextRequest) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "apple-not-configured" }, { status: 503 });
  }

  let body: { clubSlug?: string; signedTransaction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const { clubSlug, signedTransaction } = body;
  if (!clubSlug || !signedTransaction) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 });
  }

  // Session-Gate (wirft/redirected bei fehlender Berechtigung).
  const { club } = await assertClubAccess(clubSlug, "admin");

  // Kanal-Invariante: kein Apple-Kauf über ein laufendes Stripe-Abo.
  const provider = await getSubscriptionProvider(club.id);
  if (provider === "stripe") {
    return NextResponse.json(
      {
        error: "channel-conflict",
        message:
          "Dieser Verein zahlt bereits über die Website. Bitte dort verwalten."
      },
      { status: 409 }
    );
  }

  let decoded: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    decoded = await verifyTransaction(signedTransaction);
  } catch {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  const planCycle = decoded.productId
    ? appleProductToPlanCycle(decoded.productId)
    : null;
  if (!planCycle || !decoded.originalTransactionId) {
    return NextResponse.json({ error: "unknown-product" }, { status: 400 });
  }

  // Replay-Schutz: gehört diese originalTransactionId bereits einem ANDEREN
  // Club (Admin mehrerer Vereine, der eine fremde JWS einspielt), würde der
  // UPDATE die UNIQUE-Constraint auf apple_original_transaction_id verletzen.
  // Eigener Club / noch nicht beansprucht (null) → idempotent durchlassen.
  const owningClubId = await getClubIdByOriginalTransactionId(
    decoded.originalTransactionId
  );
  if (owningClubId && owningClubId !== club.id) {
    return NextResponse.json(
      {
        error: "transaction-belongs-to-other-club",
        message: "Dieser Kauf gehört bereits zu einem anderen Verein."
      },
      { status: 409 }
    );
  }

  await syncAppleSubscriptionForClub(club.id, {
    originalTransactionId: decoded.originalTransactionId,
    status: "active",
    billingCycle: planCycle.cycle,
    appleExpiresAt: decoded.expiresDate ? new Date(decoded.expiresDate) : null
  });
  await setTeamLicensesPlanForSubscription(club.id, planCycle.plan);

  return NextResponse.json({ ok: true, plan: planCycle.plan, cycle: planCycle.cycle });
}
