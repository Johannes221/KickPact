import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors, clubMemberships, clubs } from "@/lib/db/schema";

/**
 * Rollenbasierter Dashboard-Redirect nach dem Login.
 *
 * Priorität:
 * 1. Vereins-Admin  → erstes Vereins-Dashboard
 * 2. Sponsor-Profil → Sponsor-Dashboard
 * 3. Kein Profil    → Onboarding-Auswahl (oder Signup-Flow)
 */
export default async function DashboardRedirect() {
  const user = await requireUser();

  // Verein-Mitgliedschaft prüfen
  const [membership] = await db
    .select({ clubSlug: clubs.slug })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(eq(clubMemberships.userId, user.id))
    .limit(1);

  if (membership) {
    redirect(`/verein/${membership.clubSlug}`);
  }

  // Sponsor-Profil prüfen
  const [sponsorRow] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (sponsorRow) {
    redirect("/sponsor");
  }

  // Kein Profil → Sponsor-Onboarding (kommt über Einladungslink) oder
  // Vereins-Anlegen-Flow
  redirect("/sponsor");
}
