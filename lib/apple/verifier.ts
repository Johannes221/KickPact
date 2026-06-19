import "server-only";
import {
  SignedDataVerifier,
  Environment,
  type ResponseBodyV2DecodedPayload,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload
} from "@apple/app-store-server-library";

/**
 * Part B — Wrapper um Apples offizielle Verifikations-Lib
 * (`@apple/app-store-server-library`). Web-inert ohne Credentials (analog
 * `lib/notifications/apns.ts`): ohne `APPLE_IAP_BUNDLE_ID` ist alles ein No-Op
 * bzw. wirft erst beim tatsächlichen Verify-Aufruf.
 *
 * Verifiziert signierte App-Store-Notifications + Transactions (JWS) gegen die
 * Apple Root CA und decodiert die Payload.
 *
 * Env (Coolify): APPLE_IAP_BUNDLE_ID, APPLE_IAP_ENV ('sandbox'|'production'),
 * APPLE_IAP_APP_APPLE_ID, APPLE_IAP_ROOT_CERTS (base64-PEM, komma-separiert).
 *
 * STABILE Schnittstelle für die /api/apple/*-Routes: isAppleIapConfigured,
 * verifyNotification, verifyTransaction.
 */

/** True, wenn ein Apple-IAP-Setup vorliegt. Liest Env bei jedem Aufruf. */
export function isAppleIapConfigured(): boolean {
  return (process.env.APPLE_IAP_BUNDLE_ID ?? "").length > 0;
}

/**
 * Lädt die Apple-Root-Zertifikate aus der Env (base64-PEM, komma-separiert) in
 * DER-Buffer. Der Verifier erwartet eine Liste DER-codierter Root-Certs.
 */
function loadRootCerts(): Buffer[] {
  const raw = process.env.APPLE_IAP_ROOT_CERTS ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((b64) => b64.trim())
    .filter((b64) => b64.length > 0)
    .map((b64) => Buffer.from(b64, "base64"));
}

let _verifier: SignedDataVerifier | null = null;

function getVerifier(): SignedDataVerifier {
  if (!isAppleIapConfigured()) {
    throw new Error("Apple IAP nicht konfiguriert (APPLE_IAP_BUNDLE_ID fehlt).");
  }
  if (!_verifier) {
    const env =
      process.env.APPLE_IAP_ENV === "production"
        ? Environment.PRODUCTION
        : Environment.SANDBOX;
    _verifier = new SignedDataVerifier(
      loadRootCerts(),
      true, // enableOnlineChecks (OCSP-Revocation + Ablaufprüfung)
      env,
      process.env.APPLE_IAP_BUNDLE_ID ?? "",
      Number(process.env.APPLE_IAP_APP_APPLE_ID ?? "0")
    );
  }
  return _verifier;
}

/** Verifiziert + decodiert eine App Store Server Notification (signedPayload). */
export async function verifyNotification(
  signedPayload: string
): Promise<ResponseBodyV2DecodedPayload> {
  return getVerifier().verifyAndDecodeNotification(signedPayload);
}

/** Verifiziert + decodiert eine signierte Transaction (JWS aus dem Client-Kauf). */
export async function verifyTransaction(
  signedTransaction: string
): Promise<JWSTransactionDecodedPayload> {
  return getVerifier().verifyAndDecodeTransaction(signedTransaction);
}

/** Verifiziert + decodiert eine signierte Renewal-Info (JWS, z.B. aus der ASS-API). */
export async function verifyRenewalInfo(
  signedRenewalInfo: string
): Promise<JWSRenewalInfoDecodedPayload> {
  return getVerifier().verifyAndDecodeRenewalInfo(signedRenewalInfo);
}
