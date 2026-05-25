"use server";

import slugify from "slugify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, clubMemberships, subscriptions, teamLicenses } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { createInvitation, listInvitationsForTeam } from "@/lib/db/queries/invitations";

const finalizeSchema = z.object({
  verein: z.object({
    name: z.string(),
    vereinId: z.string(),
    slug: z.string()
  }),
  team: z.object({
    name: z.string(),
    teamId: z.string(),
    slug: z.string(),
    saison: z.string()
  }),
  stammdaten: z.object({
    contactName: z.string(),
    street: z.string(),
    zip: z.string(),
    city: z.string(),
    isSmallBusiness: z.boolean(),
    taxId: z.string().optional(),
    // IBAN beim Onboarding optional — Verein kann sie später ergänzen.
    iban: z.string().optional()
  }),
  plan: z.enum(["basic", "pro", "verein"]),
  // Pricing v2: optional, default monthly. season nur erlaubt vor Matchday 5.
  cycle: z.enum(["monthly", "season", "annual"]).optional().default("monthly")
});

export async function finalizeOnboarding(input: z.infer<typeof finalizeSchema>) {
  const user = await requireUser();
  const parsed = finalizeSchema.parse(input);

  // ── Race-safe Idempotenz via Advisory Lock ────────────────────────────────
  // Bug #7 Fix (siehe docs/audits/2026-05-24-onboarding-audit.md):
  // Bei gleichzeitigen Wizard-Submits (Double-Click, Browser-Tab-Sync) konnten
  // zwei Calls den Existence-Check passieren und beide INSERT versuchen → der
  // zweite crashte an der UNIQUE-Constraint auf `clubs.fussballde_verein_id`.
  //
  // Lösung: Komplette Logik in EINER Transaktion + pg_advisory_xact_lock auf
  // den vereinId-Hash. Lock wird automatisch bei Transaction-Commit/Rollback
  // released. Concurrent Calls für den gleichen Verein werden serialisiert,
  // der zweite sieht dann unter Lock die existierenden Daten und nimmt den
  // idempotenten Pfad.
  //
  // Fast-Path-Check (ohne Lock) bleibt als Optimierung erhalten — vermeidet
  // den Lock-Overhead im Normal-Fall (Page-Reload nach erfolgreichem Save).
  if (parsed.verein.vereinId) {
    const [existing] = await db
      .select({ id: clubs.id, slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
      .limit(1);

    if (existing) {
      // Membership prüfen — darf nur der Admin selbst zurückbekommen
      const [membership] = await db
        .select()
        .from(clubMemberships)
        .where(eq(clubMemberships.clubId, existing.id))
        .limit(1);

      if (!membership || membership.userId !== user.id) {
        throw new Error("Dieser Verein ist bereits bei KickPact registriert.");
      }

      // Team + Einladung holen
      const [team] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.clubId, existing.id))
        .limit(1);

      if (!team) throw new Error("Verein gefunden, aber kein Team — bitte Support kontaktieren.");

      const existingInvitations = await listInvitationsForTeam(team.id);
      const pendingInv = existingInvitations.find((i) => i.status === "pending");
      const invitation = pendingInv ?? (await createInvitation({ teamId: team.id, createdByUserId: user.id }));

      return { clubSlug: existing.slug, teamId: team.id, invitationToken: invitation.token };
    }
  }

  // Slug aus Verein-Name (eindeutig) + 4-char-Suffix für Konflikt-Vermeidung
  const baseSlug = slugify(parsed.verein.name, { lower: true, strict: true, trim: true });
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  const result = await db.transaction(async (tx) => {
    // Advisory-Lock per vereinId — serialisiert concurrent finalizeOnboarding-
    // Calls für den gleichen Verein. hashtextextended returnt bigint, das
    // ist der Wert-Typ den pg_advisory_xact_lock nutzt. Lock wird automatisch
    // bei tx-Commit/Rollback released.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.verein.vereinId}, 0))`
    );

    // Re-check unter Lock — der Fast-Path-Check oben ist race-anfällig, hier
    // unter dem Advisory-Lock haben wir Garantie dass kein paralleler Insert
    // dazwischenkommt. Wenn ein anderer Request gerade Erfolg hatte, sehen
    // wir hier den committed Verein und können idempotent returnen.
    if (parsed.verein.vereinId) {
      const [racedExisting] = await tx
        .select({ id: clubs.id, slug: clubs.slug })
        .from(clubs)
        .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
        .limit(1);

      if (racedExisting) {
        const [racedMembership] = await tx
          .select()
          .from(clubMemberships)
          .where(eq(clubMemberships.clubId, racedExisting.id))
          .limit(1);

        if (!racedMembership || racedMembership.userId !== user.id) {
          throw new Error("Dieser Verein ist bereits bei KickPact registriert.");
        }

        const [racedTeam] = await tx
          .select({ id: teams.id, slug: teams.fussballdeSlug })
          .from(teams)
          .where(eq(teams.clubId, racedExisting.id))
          .limit(1);

        if (!racedTeam)
          throw new Error("Verein gefunden, aber kein Team — bitte Support kontaktieren.");

        return {
          idempotent: true as const,
          club: { id: racedExisting.id, slug: racedExisting.slug },
          team: { id: racedTeam.id }
        };
      }
    }

    const [club] = await tx
      .insert(clubs)
      .values({
        slug,
        name: parsed.verein.name,
        ort: parsed.stammdaten.city,
        fussballdeVereinId: parsed.verein.vereinId,
        taxId: parsed.stammdaten.taxId || null,
        isSmallBusiness: parsed.stammdaten.isSmallBusiness,
        addressJson: {
          street: parsed.stammdaten.street,
          zip: parsed.stammdaten.zip,
          city: parsed.stammdaten.city,
          country: "DE"
        },
        iban: parsed.stammdaten.iban || null
      })
      .returning();

    await tx.insert(clubMemberships).values({
      userId: user.id,
      clubId: club.id,
      role: "admin"
    });

    const [team] = await tx
      .insert(teams)
      .values({
        clubId: club.id,
        name: parsed.team.name,
        saison: parsed.team.saison,
        fussballdeTeamId: parsed.team.teamId,
        fussballdeSlug: parsed.team.slug,
        isActive: true
      })
      .returning();

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    await tx.insert(subscriptions).values({
      clubId: club.id,
      // NULL bis zum ersten echten Stripe-Checkout. createCheckoutSession
      // erzeugt den Customer lazy. Frühere Implementierung schrieb hier
      // einen "placeholder_<clubId>"-String, der dann an Stripe Checkout
      // weitergereicht wurde → 4xx, Onboarding broken. Siehe Audit 2026-05-24.
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "trialing",
      billingCycle: parsed.cycle,
      trialEndsAt: trialEnd
    });

    await tx.insert(teamLicenses).values({
      subscriptionClubId: club.id,
      teamId: team.id,
      plan: parsed.plan,
      stripeSubscriptionItemId: null,
      status: "trialing"
    });

    return { idempotent: false as const, club, team };
  });

  // Invitation-Handling außerhalb der Transaktion. Bei idempotentem Pfad
  // (Race-Detection) eine existierende pending Invitation finden, sonst neu
  // anlegen — vermeidet Duplikate bei Double-Submit.
  const invitation = result.idempotent
    ? await (async () => {
        const existing = await listInvitationsForTeam(result.team.id);
        const pending = existing.find((i) => i.status === "pending");
        return pending ?? (await createInvitation({ teamId: result.team.id, createdByUserId: user.id }));
      })()
    : await createInvitation({ teamId: result.team.id, createdByUserId: user.id });

  return {
    clubSlug: result.club.slug,
    teamId: result.team.id,
    invitationToken: invitation.token
  };
}
