import "server-only";
import {
  AppStoreServerAPIClient,
  Environment,
  Status,
  type StatusResponse,
  type LastTransactionsItem,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload
} from "@apple/app-store-server-library";
import { verifyTransaction, verifyRenewalInfo } from "./verifier";

/**
 * HIGH-2 — Wrapper um Apples App Store Server API
 * (`AppStoreServerAPIClient` aus `@apple/app-store-server-library`).
 *
 * Hintergrund: Der Apple-Abo-Lifecycle hängt heute zu 100 % an zugestellten
 * App Store Server Notifications. Apple garantiert KEINE Zustellung (Endpoint-
 * Downtime, Sandbox/Prod-URL-Fehlkonfig, einfach verloren). Geht eine
 * EXPIRED/GRACE_PERIOD_EXPIRED-Notification verloren, bleibt der Verein für
 * immer `active` mit Gratis-Zugang. Stripe hat ein autoritatives Re-Fetch-
 * Sicherheitsnetz; Apple bekommt mit diesem Wrapper + dem Reconcile-Cron
 * (lib/inngest/functions/reconcile-apple-subscriptions.ts) das gleiche.
 *
 * Web-inert ohne Credentials (analog `lib/apple/verifier.ts`): Der Client wird
 * lazy gebaut und erst beim tatsächlichen Aufruf instanziiert. Ohne Credentials
 * meldet `isAppleApiConfigured()` false und der Cron returned früh.
 *
 * Env (Coolify):
 *   APPLE_IAP_KEY_ID        — KeyID des ASC-API-Keys (z.B. VP65CLK9FZ)
 *   APPLE_IAP_ISSUER_ID     — Issuer-ID der ASC-Keys-Seite
 *   APPLE_IAP_PRIVATE_KEY   — .p8-Inhalt inkl. -----BEGIN/END PRIVATE KEY-----
 *   APPLE_IAP_BUNDLE_ID     — Bundle-ID der App
 *   APPLE_IAP_ENV           — 'sandbox' | 'production'
 *
 * STABILE Schnittstelle: isAppleApiConfigured, getSubscriptionStatus.
 */

/** Auf unseren internen Subscription-Lifecycle gemappter Apple-Status. */
export interface AppleSubStatus {
  status: "active" | "past_due" | "cancelled" | "unknown";
  /** Best-effort Ablaufdatum aus der signierten Transaction/Renewal-Info. */
  expiresAt: Date | null;
}

/**
 * True, wenn alle vier Pflicht-Env-Variablen gesetzt sind. Liest die Env bei
 * jedem Aufruf (kein Modul-Caching), damit der Cron in Coolify ohne Redeploy
 * scharf wird, sobald die Secrets hinterlegt sind.
 */
export function isAppleApiConfigured(): boolean {
  return (
    (process.env.APPLE_IAP_KEY_ID ?? "").length > 0 &&
    (process.env.APPLE_IAP_ISSUER_ID ?? "").length > 0 &&
    (process.env.APPLE_IAP_PRIVATE_KEY ?? "").length > 0 &&
    (process.env.APPLE_IAP_BUNDLE_ID ?? "").length > 0
  );
}

let _client: AppStoreServerAPIClient | null = null;

function getClient(): AppStoreServerAPIClient {
  if (!isAppleApiConfigured()) {
    throw new Error(
      "Apple App Store Server API nicht konfiguriert (APPLE_IAP_KEY_ID / " +
        "APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY / APPLE_IAP_BUNDLE_ID)."
    );
  }
  if (!_client) {
    const env =
      process.env.APPLE_IAP_ENV === "production"
        ? Environment.PRODUCTION
        : Environment.SANDBOX;
    _client = new AppStoreServerAPIClient(
      process.env.APPLE_IAP_PRIVATE_KEY ?? "",
      process.env.APPLE_IAP_KEY_ID ?? "",
      process.env.APPLE_IAP_ISSUER_ID ?? "",
      process.env.APPLE_IAP_BUNDLE_ID ?? "",
      env
    );
  }
  return _client;
}

/** Apple `Status`-Enum → unser interner Lifecycle. */
function mapStatus(status: Status): AppleSubStatus["status"] {
  switch (status) {
    case Status.ACTIVE:
      return "active";
    case Status.BILLING_RETRY:
    case Status.BILLING_GRACE_PERIOD:
      return "past_due";
    case Status.EXPIRED:
    case Status.REVOKED:
      return "cancelled";
    default:
      return "unknown";
  }
}

/**
 * Sucht in der StatusResponse die LastTransaction, deren originalTransactionId
 * zur Anfrage passt. Apple kann pro Subscription-Group mehrere Transactions
 * zurückgeben; wir wollen genau die zu unserem stabilen Identifier.
 */
function findMatchingTransaction(
  response: StatusResponse,
  originalTransactionId: string
): LastTransactionsItem | null {
  for (const group of response.data ?? []) {
    for (const tx of group.lastTransactions ?? []) {
      if (tx.originalTransactionId === originalTransactionId) {
        return tx;
      }
    }
  }
  // Fallback: kommt nur eine einzige Transaction zurück, nehmen wir die — die
  // API filtert bereits auf den abgefragten Kunden.
  const all = (response.data ?? []).flatMap((g) => g.lastTransactions ?? []);
  return all.length === 1 ? all[0] : null;
}

/**
 * Best-effort Ablaufdatum: zuerst aus der signierten Transaction (expiresDate),
 * sonst aus der Renewal-Info (renewalDate). Beide sind JWS und müssen gegen die
 * Apple Root CA verifiziert+decodiert werden — wir nutzen denselben Verifier
 * wie der Webhook. Schlägt das fehl, ist `expiresAt` null (unkritisch, der
 * status ist der entscheidende Output).
 */
async function extractExpiresAt(tx: LastTransactionsItem): Promise<Date | null> {
  if (tx.signedTransactionInfo) {
    try {
      const decoded: JWSTransactionDecodedPayload = await verifyTransaction(
        tx.signedTransactionInfo
      );
      if (typeof decoded.expiresDate === "number") {
        return new Date(decoded.expiresDate);
      }
    } catch {
      // ignorieren, Renewal-Info versuchen
    }
  }
  if (tx.signedRenewalInfo) {
    try {
      const renewal: JWSRenewalInfoDecodedPayload = await verifyRenewalInfo(
        tx.signedRenewalInfo
      );
      if (typeof renewal.renewalDate === "number") {
        return new Date(renewal.renewalDate);
      }
    } catch {
      // ignorieren — expiresAt bleibt null
    }
  }
  return null;
}

/**
 * Holt den autoritativen Abo-Status für eine originalTransactionId direkt von
 * Apple und mappt ihn auf unseren Lifecycle. `unknown`, wenn Apple keine
 * passende Transaction kennt oder das Status-Feld fehlt — der Aufrufer
 * (Reconcile-Cron) behandelt `unknown` als "nicht anfassen".
 */
export async function getSubscriptionStatus(
  originalTransactionId: string
): Promise<AppleSubStatus> {
  const response = await getClient().getAllSubscriptionStatuses(
    originalTransactionId
  );
  const tx = findMatchingTransaction(response, originalTransactionId);
  if (!tx || tx.status === undefined) {
    return { status: "unknown", expiresAt: null };
  }
  return {
    status: mapStatus(tx.status as Status),
    expiresAt: await extractExpiresAt(tx)
  };
}
