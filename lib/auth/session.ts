import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export async function getServerSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Sentinel message used by `requireUserOrThrow` so client-side catch-blocks
 * can detect session loss without importing server-only modules.
 */
export const SESSION_EXPIRED_MESSAGE = "SESSION_EXPIRED";

/**
 * Variant of `requireUser` for **Server Actions**: throws a plain Error
 * instead of calling `redirect()`. Background: Next.js' redirect() throws
 * a special NEXT_REDIRECT digest that the framework intercepts during page
 * rendering, but inside a Server Action call-stack the digest can leak to
 * the client where it surfaces as a generic Error("NEXT_REDIRECT") — and
 * the user sees a useless toast saying "NEXT_REDIRECT".
 *
 * Pages should keep using `requireUser()` (HTTP redirect on no-session).
 * Server Actions should use this and let the client handle the recovery
 * (e.g. `if (e.message === SESSION_EXPIRED_MESSAGE) window.location.reload()`).
 */
export async function requireUserOrThrow() {
  const session = await getServerSession();
  if (!session?.user) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return session.user;
}
