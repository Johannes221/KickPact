import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

/**
 * Smart post-login dispatcher. Loads the user's identity snapshot once and
 * redirects to the right destination:
 *   - 0 identities → /signup (3-card role chooser)
 *   - 1 identity → that identity's home URL
 *   - 2+ identities → /select-role (multi-role picker)
 *
 * All routing logic lives in pickDashboardDestination (pure, unit-tested).
 */
export default async function DashboardRedirect() {
  const user = await requireUser();
  const identities = await getUserIdentities(user.id);
  redirect(pickDashboardDestination(identities));
}
