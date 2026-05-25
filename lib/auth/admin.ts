import { redirect } from "next/navigation";
import { requireUser } from "./session";

/**
 * ENV-allowlist for KickPact-ops users. Format: comma-separated emails.
 * Example: KICKPACT_ADMIN_EMAILS=johannes@kickpact.de,ops@kickpact.de
 *
 * Deliberately not a DB column — we want admin status to be controlled at
 * the deployment level (Coolify secret), not via a self-service flow.
 * Migrate to a `users.isPlatformAdmin` column when the team grows past 3-5.
 */
function adminEmails(): Set<string> {
  const raw = process.env.KICKPACT_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  );
}

/**
 * Page-level guard for /admin/* routes. Loads the current user, checks
 * email against KICKPACT_ADMIN_EMAILS, redirects to /dashboard on fail.
 * Returns the user so admin pages can show "Reviewed by …" later.
 */
export async function assertPlatformAdmin() {
  const user = await requireUser();
  const allowlist = adminEmails();
  if (allowlist.size === 0 || !allowlist.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }
  return { user };
}
