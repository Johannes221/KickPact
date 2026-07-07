import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  sponsors,
  accounts,
  sessions,
  clubMemberships,
  supportTickets,
  sponsorInquiries
} from "@/lib/db/schema";

export const DELETED_EMAIL_DOMAIN = "kickpact.invalid";
export const DELETED_NAME = "Gelöschter Nutzer";
export const DELETED_SPONSOR_DISPLAY = "Gelöschter Sponsor";
export const DELETED_TEXT = "[gelöscht]";

/** Eckdaten eines Users für die Admin-User-Actions (oder null). */
export async function getUserForAdmin(userId: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * DSGVO Art. 17 — Account anonymisieren. Geteilt zwischen dem
 * anonymize-accounts-Cron (14-Tage-Cooldown) und der sofortigen
 * Operator-Aktion im Admin-Panel.
 *
 * - OAuth-Accounts + Sessions löschen (kein Login mehr möglich)
 * - Sponsor-Profile anonymisieren (Pledges/Invoices bleiben für § 147 AO)
 * - Support-Tickets + Sponsor-Anfragen: denormalisierte PII (Name/E-Mail) und
 *   Freitext des Users neutralisieren — dieselben Zeilen, die der DSGVO-Export
 *   (lib/actions/dsgvo.ts) als „Daten dieses Users" listet, müssen auch bei der
 *   Art.-17-Löschung symmetrisch anonymisiert werden.
 * - User-Row als Tombstone (email notNull+unique → deleted-<id>@invalid)
 */
export async function anonymizeUserAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(sponsors)
      .set({
        displayName: DELETED_SPONSOR_DISPLAY,
        businessName: null,
        businessAddressJson: null,
        businessTaxId: null
      })
      .where(eq(sponsors.userId, userId));
    // Support-Tickets tragen Name/E-Mail denormalisiert (auch für eingeloggte
    // Absender) + Freitext (Betreff/Nachricht) → alle vier neutralisieren.
    await tx
      .update(supportTickets)
      .set({
        name: DELETED_NAME,
        email: `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`,
        subject: DELETED_TEXT,
        message: DELETED_TEXT,
        updatedAt: new Date()
      })
      .where(eq(supportTickets.userId, userId));
    // Sponsor-Anfragen: der vom User verfasste Freitext (message/responseMessage
    // dieser Beziehung) wird entfernt; Status/Verknüpfungen bleiben für die
    // Vereinsseite erhalten.
    await tx
      .update(sponsorInquiries)
      .set({ message: null, responseMessage: null })
      .where(eq(sponsorInquiries.sponsorUserId, userId));
    await tx
      .update(users)
      .set({
        email: `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`,
        name: DELETED_NAME,
        image: null,
        emailVerified: false,
        deletionRequestedAt: null,
        isPlatformAdmin: false,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  });
}

export interface UpdateUserProfileResult {
  ok: boolean;
  error?: "email_taken";
}

/**
 * Operator-Edit von Name/E-Mail. E-Mail wird lowercased; Kollision mit einem
 * anderen Account wird vorab geprüft (unique-Constraint als Fallback).
 */
export async function updateUserProfile(input: {
  userId: string;
  name: string;
  email: string;
}): Promise<UpdateUserProfileResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0] && existing[0].id !== input.userId) {
    return { ok: false, error: "email_taken" };
  }
  await db
    .update(users)
    .set({ name: input.name.trim(), email, updatedAt: new Date() })
    .where(eq(users.id, input.userId));
  return { ok: true };
}

export async function setUserDeletionRequested(input: {
  userId: string;
  requested: boolean;
}): Promise<void> {
  await db
    .update(users)
    .set({ deletionRequestedAt: input.requested ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, input.userId));
}

export type ClubRole = "admin" | "trainer" | "viewer";

export async function setClubMembershipRole(input: {
  userId: string;
  clubId: string;
  role: ClubRole;
}): Promise<void> {
  await db
    .update(clubMemberships)
    .set({ role: input.role })
    .where(
      and(
        eq(clubMemberships.userId, input.userId),
        eq(clubMemberships.clubId, input.clubId)
      )
    );
}

export async function removeClubMembership(input: {
  userId: string;
  clubId: string;
}): Promise<void> {
  await db
    .delete(clubMemberships)
    .where(
      and(
        eq(clubMemberships.userId, input.userId),
        eq(clubMemberships.clubId, input.clubId)
      )
    );
}
