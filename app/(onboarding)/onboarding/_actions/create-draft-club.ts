"use server";

import slugify from "slugify";
import { z } from "zod";
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
import { requireUserOrThrow } from "@/lib/auth/session";
import { assertNotPlatformAdminAction } from "@/lib/auth/admin";
import { createInvitation, listInvitationsForTeam } from "@/lib/db/queries/invitations";
import { checkTeamCollision } from "@/lib/db/queries/onboarding-collision";
import { inngest } from "@/lib/inngest/client";
import { TRIAL_DAYS } from "@/lib/stripe/pricing";

/** True, wenn der User Mitglied (beliebige Rolle) des Clubs ist. */
async function isClubMemberOf(clubId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select({ userId: clubMemberships.userId })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.userId, userId)))
    .limit(1);
  return Boolean(m);
}

// SECURITY (M2): Die fussball.de-Identifier werden serverseitig in Fetch-URL-
// Pfade des Crawlers interpoliert (lib/crawler/fussballde.ts). Ohne Charset-
// Constraint könnte ein präpariertes teamId/teamSlug/saison (z.B. mit `../`,
// `?`, `#`, `@`) den gefetchten Pfad manipulieren / beliebige fussball.de-
// Endpunkte vom Server aus abfragen (constrained SSRF). Host ist fix, daher
// begrenzt — wir constrainen trotzdem auf das bekannte Format. Defense-in-depth
// folgt via encodeURIComponent in den URL-Buildern.
const teamSchema = z.object({
  teamId: z.string().regex(/^[A-Za-z0-9]+$/, "Ungültige Team-ID").max(64),
  teamSlug: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]*$/, "Ungültiger Team-Slug")
    .max(200),
  teamName: z.string().min(1).max(200),
  saison: z.string().regex(/^[0-9]{2,4}([/-][0-9]{2,4})?$/, "Ungültige Saison")
});

const createDraftSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("mannschaft"),
    verein: z.object({
      name: z.string().min(1),
      vereinId: z.string().min(1)
    }),
    team: teamSchema
  }),
  z.object({
    role: z.literal("verein"),
    verein: z.object({
      name: z.string().min(1),
      vereinId: z.string().min(1)
    }),
    teams: z.array(teamSchema).min(1)
  })
]);

export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export interface CreateDraftResult {
  clubId: string;
  clubSlug: string;
  /** Eine Invitation pro Team — Key ist die teamId aus dem Input. */
  teams: Array<{ teamId: string; invitationToken: string }>;
}

/**
 * Step 1 des neuen Onboarding-Wizards. Legt Club + Team(s) + Trial-Subscription +
 * Invitations in EINER Transaktion an. Idempotent: zweiter Aufruf für den gleichen
 * fussballdeVereinId vom selben User liefert den existierenden Draft zurück
 * (race-safe via pg_advisory_xact_lock auf vereinId-Hash).
 *
 * Plan-Defaults:
 *   - role=mannschaft → teamLicenses.plan = 'pro'  (Pro-Trial)
 *   - role=verein     → teamLicenses.plan = 'verein' (Vereinslizenz-Trial)
 *
 * `subscriptions.billingCycle = 'monthly'` ist Placeholder bis zum ersten echten
 * Stripe-Checkout (der setzt monthly/season_end basierend auf User-Wahl im
 * Abo-Flow nach Trial-Ende).
 *
 * Nicht-Owner-Verein wird mit Fehler abgelehnt — wenn der Verein schon einem
 * anderen User gehört, kann dieser User nicht draft-anlegen (separate Workflow:
 * Beitritts-Anfrage via /verein/.../zugriff-anfragen).
 */
export async function createDraftClub(input: CreateDraftInput): Promise<CreateDraftResult> {
  const user = await requireUserOrThrow();
  await assertNotPlatformAdminAction(user.email);
  const parsed = createDraftSchema.parse(input);

  const teamList = parsed.role === "mannschaft" ? [parsed.team] : parsed.teams;
  const planForLicenses = parsed.role === "mannschaft" ? "pro" : "verein";

  // ── Per-Team-Kollision (Kollisionsschlüssel = fussballde_team_id) ─────────
  // Verein-Existenz allein ist bedeutungslos (Spec 2026-05-29 §4). Pro Team:
  //   - none:              frisch anlegen.
  //   - scraped-unmanaged: bestehende (gescrapte/unbetreute) Team-Row in den
  //                        neuen Container umhängen — Spieldaten folgen via teamId.
  //   - actively-managed:  gehört dem aktuellen User → idempotenter Resume;
  //                        sonst → blockieren (Zugriff anfragen).
  const collisions = await Promise.all(
    teamList.map((t) => checkTeamCollision(t.teamId, t.saison))
  );

  for (const c of collisions) {
    if (c.kind !== "actively-managed") continue;
    const ownedByMe = await isClubMemberOf(c.clubId, user.id);
    if (!ownedByMe) {
      throw new Error(
        "Diese Mannschaft ist bereits bei KickPact registriert. Frag beim zuständigen Admin Zugriff an."
      );
    }
    // Eigener Container → idempotent den ganzen Draft zurückgeben.
    const [club] = await db
      .select({ slug: clubs.slug, onboardingStatus: clubs.onboardingStatus })
      .from(clubs)
      .where(eq(clubs.id, c.clubId))
      .limit(1);
    if (club?.onboardingStatus === "completed") {
      throw new Error(
        "Diese Mannschaft ist bereits vollständig onboarded. Du gelangst über das Dashboard hin."
      );
    }
    return await loadExistingDraft(c.clubId, club?.slug ?? c.clubSlug, user.id);
  }

  // ── Verein-Dedup (2026-06-02) ────────────────────────────────────────────
  // Ein User darf pro realem Verein nur EINEN Container haben. Hat er bereits
  // einen (draft ODER completed) für genau diese fussballde_verein_id, werden
  // die neuen Mannschaften DORT eingehängt statt einen zweiten Container zu
  // öffnen — sonst entsteht beim Onboarden mehrerer Mannschaften desselben
  // Vereins die Container-Sprawl, die wir gerade konsolidieren mussten.
  //
  // WICHTIG: nur der EIGENE Container (admin-Mitgliedschaft). Fremde User
  // bekommen weiterhin getrennte Container (Sicherheits-Design — ein Fremder
  // soll nicht ungefragt in deinem Verein landen; siehe onboarding-collision.ts).
  const [ownClub] = await db
    .select({ id: clubs.id, slug: clubs.slug })
    .from(clubs)
    .innerJoin(
      clubMemberships,
      and(
        eq(clubMemberships.clubId, clubs.id),
        eq(clubMemberships.userId, user.id),
        eq(clubMemberships.role, "admin")
      )
    )
    .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
    .limit(1);

  const baseSlug = slugify(parsed.verein.name, { lower: true, strict: true, trim: true });
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  // ── SECURITY (H1): Trial-Abuse-Check ─────────────────────────────────────
  // Eligibility hängt an einer STABILEN Identität, nicht an der (löschbaren)
  // subscriptions-Row. Key pro Team = `team:<fussballdeTeamId>`, zusätzlich bei
  // Vereins-Onboarding `verein:<vereinId>`. Hat eine dieser Identitäten bereits
  // einen Trial verbraucht, gibt es KEINEN neuen 30-Tage-Trial mehr (sonst ließe
  // sich der Trial durch Verwerfen+Neu-Onboarden beliebig oft zurücksetzen).
  const trialKeys = [
    ...teamList.map((t) => `team:${t.teamId}`),
    `verein:${parsed.verein.vereinId}`
  ];
  const consumed = await db
    .select({ key: consumedTrials.key })
    .from(consumedTrials)
    .where(inArray(consumedTrials.key, trialKeys));
  const trialEligible = consumed.length === 0;

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const result = await db.transaction(async (tx) => {
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
          name: parsed.verein.name,
          fussballdeVereinId: parsed.verein.vereinId,
          onboardingStatus: "draft",
          onboardingRole: parsed.role,
          onboardingStartedAt: new Date()
        })
        .returning({ id: clubs.id, slug: clubs.slug });
      club = created;

      await tx.insert(clubMemberships).values({
        userId: user.id,
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
      if (c.kind === "scraped-unmanaged") {
        await tx
          .update(teams)
          .set({ clubId: club.id, isActive: true, crawlStartedAt: new Date() })
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
            crawlStartedAt: new Date()
          })
          .returning({ id: teams.id });
        insertedTeamIds.push(row.id);
      }
    }

    await tx.insert(teamLicenses).values(
      insertedTeamIds.map((teamId) => ({
        subscriptionClubId: club.id,
        teamId,
        plan: planForLicenses as "pro" | "verein",
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
          userId: user.id,
          teamId,
          role: "admin" as const,
          invitedByUserId: user.id
        }))
      )
      .onConflictDoNothing();

    return {
      clubId: club.id,
      clubSlug: club.slug,
      insertedTeamIds
    };
  });

  // Frische Invitations pro Team (außerhalb der TX — schadet nicht, weil
  // Invitation-Tabelle keine FK auf den TX-Snapshot braucht).
  const invitations = await Promise.all(
    result.insertedTeamIds.map((teamId) =>
      createInvitation({ teamId, createdByUserId: user.id })
    )
  );

  // Crawler sofort triggern damit die Mannschafts-Übersicht nicht ewig auf
  // "Wir suchen nach den letzten Spielen…" stehen bleibt. Fire-and-forget —
  // Inngest-Failures (z.B. INNGEST_SIGNING_KEY fehlt lokal) sollen den
  // Onboarding-Abschluss nicht blocken.
  await Promise.all(
    result.insertedTeamIds.map((teamId) =>
      inngest
        .send({ name: "crawler/team.crawl", data: { teamId } })
        .catch((err) => {
          console.error("[onboarding] crawler-trigger failed", { teamId, err });
        })
    )
  );

  return {
    clubId: result.clubId,
    clubSlug: result.clubSlug,
    teams: result.insertedTeamIds.map((teamId, i) => ({
      teamId,
      invitationToken: invitations[i].token
    }))
  };
}

async function loadExistingDraft(
  clubId: string,
  clubSlug: string,
  userId: string
): Promise<CreateDraftResult> {
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));

  const teamsWithInvitations = await Promise.all(
    teamRows.map(async (t) => {
      const existing = await listInvitationsForTeam(t.id);
      const pending = existing.find((i) => i.status === "pending");
      const inv = pending ?? (await createInvitation({ teamId: t.id, createdByUserId: userId }));
      return { teamId: t.id, invitationToken: inv.token };
    })
  );

  return { clubId, clubSlug, teams: teamsWithInvitations };
}
