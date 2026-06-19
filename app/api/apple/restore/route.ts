import { NextRequest, NextResponse } from "next/server";
import { isAppleIapConfigured, verifyTransaction } from "@/lib/apple/verifier";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  appleProductToPlanCycle,
  PLAN_ORDER,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";
import {
  getSubscriptionProvider,
  getClubIdByOriginalTransactionId,
  syncAppleSubscriptionForClub,
  setTeamLicensesPlanForSubscription
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RestoredTransaction {
  productId: string;
  plan: PlanKey;
  cycle: BillingCycle;
  originalTransactionId: string;
  appleExpiresAt: Date | null;
}

/**
 * Part B — „Käufe wiederherstellen" (StoreKit restore). Der Client liefert ALLE
 * vom Gerät wiederhergestellten Transaktionen; der Server verifiziert sie,
 * filtert auf bekannte KickPact-Produkte und schaltet das HÖCHSTE Tier frei.
 * Session-gated + Kanal-Invariante wie /api/apple/verify.
 */
export async function POST(req: NextRequest) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "apple-not-configured" }, { status: 503 });
  }

  let body: {
    clubSlug?: string;
    transactions?: { jwsRepresentation?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const { clubSlug, transactions } = body;
  if (!clubSlug || !Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 });
  }

  // Session-Gate (wirft/redirected bei fehlender Berechtigung).
  const { club } = await assertClubAccess(clubSlug, "admin");

  // Kanal-Invariante: kein Apple-Restore über ein laufendes Stripe-Abo.
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

  // Jede JWS einzeln verifizieren; ungültige / unbekannte Produkte überspringen.
  const valid: RestoredTransaction[] = [];
  for (const tx of transactions) {
    if (!tx?.jwsRepresentation) continue;
    let decoded: Awaited<ReturnType<typeof verifyTransaction>>;
    try {
      decoded = await verifyTransaction(tx.jwsRepresentation);
    } catch {
      continue;
    }
    const planCycle = decoded.productId
      ? appleProductToPlanCycle(decoded.productId)
      : null;
    if (!planCycle || !decoded.originalTransactionId) continue;
    valid.push({
      productId: decoded.productId ?? "",
      plan: planCycle.plan,
      cycle: planCycle.cycle,
      originalTransactionId: decoded.originalTransactionId,
      appleExpiresAt: decoded.expiresDate ? new Date(decoded.expiresDate) : null
    });
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "no-active-purchase", message: "Kein aktiver Kauf gefunden." },
      { status: 404 }
    );
  }

  // Höchstes Tier gewinnt (verein > pro > basic) via PLAN_ORDER-Index.
  const best = valid.reduce((acc, cur) =>
    PLAN_ORDER.indexOf(cur.plan) > PLAN_ORDER.indexOf(acc.plan) ? cur : acc
  );

  // Replay-Schutz: gehört diese originalTransactionId schon einem ANDEREN Club?
  const owningClubId = await getClubIdByOriginalTransactionId(
    best.originalTransactionId
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
    originalTransactionId: best.originalTransactionId,
    status: "active",
    billingCycle: best.cycle,
    appleExpiresAt: best.appleExpiresAt
  });
  await setTeamLicensesPlanForSubscription(club.id, best.plan);

  return NextResponse.json({ ok: true, plan: best.plan, cycle: best.cycle });
}
