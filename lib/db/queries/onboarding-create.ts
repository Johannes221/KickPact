import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  subscriptions,
  teamLicenses,
  consumedTrials
} from "@/lib/db/schema";
import type { TeamCollision } from "./onboarding-collision";
import { coverageFloorFromTeamName } from "@/lib/triggers/coverage";

/** Ein Team-Input des Onboarding-Wizards (fussball.de-Identifier + Name/Saison). */
export interface TeamDraftInput {
  teamId: string;
  teamSlug: string;
  teamName: string;
  saison: string;
}

/**
 * Eigener (admin) Verein-Container des Users für eine fussballde_verein_id, oder
 * undefined. Dient dem Verein-Dedup beim Onboarding (ein User → ein Container
 * pro realem Verein). Fremde Container werden bewusst NICHT zurückgegeben.
 */
export async function getOwnDraftClubByVereinId(
  userId: string,
  vereinId: string
): Promise<{ id: string; slug: string } | undefined> {
  const [ownClub] = await db
    .select({ id: clubs.id, slug: clubs.slug })
    .from(clubs)
    .innerJoin(
      clubMemberships,
      and(
        eq(clubMemberships.clubId, clubs.id),
        eq(clubMemberships.userId, userId),
        eq(clubMemberships.role, "admin")
      )
    )
    .where(eq(clubs.fussballdeVereinId, vereinId))
    .limit(1);
  return ownClub;
}

/** Trial-Abuse-Check: welche der gegebenen Trial-Keys sind bereits verbraucht. */
export async function findConsumedTrialKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await db
    .select({ key: consumedTrials.key })
    .from(consumedTrials)
    .where(inArray(consumedTrials.key, keys));
  return rows.map((r) => r.key);
}

/**
 * Legt Club + Team(s) + Trial-Subscription + Lizenzen + Mitgliedschaften in EINER
 * Transaktion an (bzw. hängt Teams in den vorhandenen eigenen Container `ownClub`).
 * Verwendet pg_advisory_xact_lock pro Team zur Serialisierung konkurrierender
 * Registrierungen. Faithful extrahiert aus der ehemaligen Inline-Action.
 */
export async function persistDraftClubAndTeams(args: {
  userId: string;
  role: "mannschaft" | "verein";
  verein: { name: string; vereinId: string };
  teamList: TeamDraftInput[];
  collisions: TeamCollision[];
  ownClub: { id: string; slug: string } | undefined;
  slug: string;
  trialEligible: boolean;
  trialEnd: Date;
  trialKeys: string[];
  planForLicenses: "pro" | "verein";
}): Promise<{ clubId: string; clubSlug: string; insertedTeamIds: string[] }> {
  const {
    userId,
    role,
    verein,
    teamList,
    collisions,
    ownClub,
    slug,
    trialEligible,
    trialEnd,
    trialKeys,
    planForLicenses
  } = args;

  return db.transaction(async (tx) => {
    // Advisory-Lock pro Team serialisiert konkurrierende Registrierungen
    // derselben Mannschaft; der Unique-Index (team_id, saison) ist der Backstop.
    for (const t of teamList) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${t.teamId}, 0))`
      );
    }

    // Bestehenden eigenen Verein-Container wiederverwenden ODER neu anlegen.
    let club: { id: string; slug: string };
    if (ownClub) {
      club = ownClub;
    } else {
      const [created] = await tx
        .insert(clubs)
        .values({
          slug,
          name: verein.name,
          fussballdeVereinId: verein.vereinId,
          onboardingStatus: "draft",
          onboardingRole: role,
          onboardingStartedAt: new Date(),
          // §19-Kleinunternehmer ist der Plattform-Default (Privatpersonen-only,
          // keine USt) — deckt sich mit den Form-Defaults. Ohne diese Zeile
          // startet der Draft-Club auf dem DB-Default `false` und zeigt bis zum
          // ersten Stammdaten-Speichern fälschlich den USt-Hinweis.
          isSmallBusiness: true
        })
        .returning({ id: clubs.id, slug: clubs.slug });
      club = created;

      await tx.insert(clubMemberships).values({
        userId,
        clubId: club.id,
        role: "admin"
      });

      // H1: Nur bei Eligibility ein echter Trial — sonst `incomplete` (read-only
      // via gateFromSubscription) → der Verein muss zum Aktivieren zahlen.
      await tx.insert(subscriptions).values({
        clubId: club.id,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        status: trialEligible ? "trialing" : "incomplete",
        billingCycle: "monthly",
        trialEndsAt: trialEligible ? trialEnd : null
      });
    }

    // H1: Trial-Identitäten als verbraucht markieren (idempotent). Auch wenn
    // nicht eligible, schadet das Re-Insert nicht (onConflictDoNothing).
    if (trialEligible) {
      await tx
        .insert(consumedTrials)
        .values(trialKeys.map((key) => ({ key, clubId: club.id })))
        .onConflictDoNothing();
    }

    // Teams: `none` frisch inserten, `scraped-unmanaged` in den neuen Container
    // umhängen (re-home). crawlStartedAt sofort, damit das Team-Dashboard direkt
    // das „Spiele werden geladen"-Banner zeigt.
    const insertedTeamIds: string[] = [];
    for (let i = 0; i < teamList.length; i++) {
      const t = teamList[i];
      const c = collisions[i];
      // Initiale Daten-Coverage aus der Altersklasse (Namens-Floor). Sofort-
      // Default, der die Wett-UI direkt korrekt gatet; die Live-Probe (post-
      // commit) und der Crawl schärfen `full`/`results_only` nach. Siehe
      // lib/triggers/coverage.ts.
      const coverageFloor = coverageFloorFromTeamName(t.teamName);
      if (c.kind === "scraped-unmanaged") {
        await tx
          .update(teams)
          .set({
            clubId: club.id,
            isActive: true,
            crawlStartedAt: new Date(),
            dataCoverage: coverageFloor
          })
          .where(eq(teams.id, c.teamId));
        // Etwaige alte Lizenz lösen — die frische kommt unten unter den neuen Container.
        await tx.delete(teamLicenses).where(eq(teamLicenses.teamId, c.teamId));
        insertedTeamIds.push(c.teamId);
      } else {
        const [row] = await tx
          .insert(teams)
          .values({
            clubId: club.id,
            name: t.teamName,
            saison: t.saison,
            fussballdeTeamId: t.teamId,
            fussballdeSlug: t.teamSlug,
            isActive: true,
            crawlStartedAt: new Date(),
            dataCoverage: coverageFloor
          })
          .returning({ id: teams.id });
        insertedTeamIds.push(row.id);
      }
    }

    await tx.insert(teamLicenses).values(
      insertedTeamIds.map((teamId) => ({
        subscriptionClubId: club.id,
        teamId,
        plan: planForLicenses,
        stripeSubscriptionItemId: null,
        status: "trialing" as const
      }))
    );

    // Ersteller direkt als Mannschaftsadmin jeder Mannschaft eintragen. Bei
    // autarken Teams (pro-Plan) kommt der Zugriff NUR aus team_memberships —
    // der Club-Admin-Durchgriff greift dort nicht (Lizenz-Gating). Ohne diesen
    // Eintrag würde sich der Owner aus seiner eigenen Mannschaft aussperren.
    // onConflictDoNothing: adoptierte Teams könnten theoretisch schon eine
    // Membership des Users tragen.
    await tx
      .insert(teamMemberships)
      .values(
        insertedTeamIds.map((teamId) => ({
          userId,
          teamId,
          role: "admin" as const,
          invitedByUserId: userId
        }))
      )
      .onConflictDoNothing();

    return {
      clubId: club.id,
      clubSlug: club.slug,
      insertedTeamIds
    };
  });
}
