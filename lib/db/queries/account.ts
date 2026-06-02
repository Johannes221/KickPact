import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, sessions, accounts } from "@/lib/db/schema/auth";
import { sponsors } from "@/lib/db/schema/sponsors";

/**
 * Konto-Seite (/konto): Stammdaten, aktive Sessions, verknüpfte Login-Provider.
 * (getUserIdentities + countUnreadNotifications laufen separat über ihre Module.)
 */
export interface AccountOverview {
  userRow:
    | {
        id: string;
        email: string;
        name: string | null;
        emailVerified: boolean;
        image: string | null;
        deletionRequestedAt: Date | null;
        createdAt: Date;
      }
    | undefined;
  sessionCount: number;
  linkedAccounts: Array<{ providerId: string }>;
}

/** E-Mail-Adresse eines Users per ID (für Benachrichtigungen), oder null. */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  const [userRow] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      image: users.image,
      deletionRequestedAt: users.deletionRequestedAt,
      createdAt: users.createdAt
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [{ n: sessionCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(sessions)
    .where(eq(sessions.userId, userId));

  const linkedAccounts = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return { userRow, sessionCount, linkedAccounts };
}

/** Sponsor-Typ (familie/business) eines Users — oder null wenn kein Sponsor. */
export async function getSponsorType(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ type: sponsors.type })
    .from(sponsors)
    .where(eq(sponsors.userId, userId))
    .limit(1);
  return row?.type ?? null;
}
