import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser } from "@/lib/db/queries/onboarding-draft";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listInvitationsForTeam } from "@/lib/db/queries/invitations";
import { createInvitation } from "@/lib/db/queries/invitations";
import { WizardShell } from "../../_components/wizard-shell";
import { SponsorenStep } from "../../_components/sponsoren-step";

export const metadata = { title: "Sponsoren einladen · KickPact" };

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function VereinFlowStep3() {
  const user = await requireUser();
  const draft = await getActiveDraftForUser(user.id);
  if (!draft) redirect("/onboarding");
  if (draft.onboardingRole !== "verein") redirect("/onboarding");
  if (draft.onboardingStatus !== "stammdaten_complete") {
    redirect("/onboarding");
  }

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.clubId, draft.clubId));

  // Für jedes Team: existierende pending Invitation finden oder neu anlegen.
  const teamsWithTokens = await Promise.all(
    teamRows.map(async (t) => {
      const existing = await listInvitationsForTeam(t.id);
      const pending = existing.find((i) => i.status === "pending");
      const inv = pending ?? (await createInvitation({ teamId: t.id, createdByUserId: user.id }));
      return { teamId: t.id, teamName: t.name, invitationToken: inv.token };
    })
  );

  return (
    <WizardShell step={3} role="verein">
      <SponsorenStep
        clubId={draft.clubId}
        clubSlug={draft.slug}
        role="verein"
        baseUrl={await getBaseUrl()}
        teams={teamsWithTokens}
      />
    </WizardShell>
  );
}
