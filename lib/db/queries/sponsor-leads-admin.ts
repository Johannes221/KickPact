/**
 * Operator-Sicht auf `sponsor_leads` — Sponsoring-Anfragen von NICHT
 * eingeloggten Besuchern der öffentlichen Profilseite `/m/{slug}`.
 *
 * Bis dahin wurden Leads nur geschrieben (lib/actions/team-public-profile.ts)
 * und per Retention wieder gelöscht (lib/db/queries/system-retention.ts) — im
 * Panel waren sie unsichtbar, obwohl `handledAt` im Schema von Anfang an einen
 * Abhak-Workflow vorsieht.
 *
 * PII-Hinweis: Name/E-Mail sind Dritt-PII. Leads werden nach
 * LEADS_RETENTION_DAYS (180) hart gelöscht — diese Liste zeigt also nie mehr
 * als das Retention-Fenster.
 */
import { and, desc, eq, ilike, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorLeads, teams, clubs } from "@/lib/db/schema";

export type SponsorLeadStatus = "open" | "handled";

export interface AdminSponsorLeadRow {
  id: string;
  name: string;
  email: string;
  message: string | null;
  createdAt: Date;
  handledAt: Date | null;
  teamId: string;
  teamName: string;
  clubName: string;
  clubSlug: string;
}

export async function listSponsorLeadsForAdmin(opts?: {
  status?: SponsorLeadStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ leads: AdminSponsorLeadRow[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const conds = [];
  if (opts?.status === "open") conds.push(isNull(sponsorLeads.handledAt));
  if (opts?.status === "handled") conds.push(isNotNull(sponsorLeads.handledAt));
  if (opts?.search && opts.search.trim().length > 0) {
    const q = `%${opts.search.trim()}%`;
    conds.push(
      or(
        ilike(sponsorLeads.name, q),
        ilike(sponsorLeads.email, q),
        ilike(clubs.name, q),
        ilike(teams.name, q)
      )
    );
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const leads = await db
    .select({
      id: sponsorLeads.id,
      name: sponsorLeads.name,
      email: sponsorLeads.email,
      message: sponsorLeads.message,
      createdAt: sponsorLeads.createdAt,
      handledAt: sponsorLeads.handledAt,
      teamId: sponsorLeads.teamId,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(sponsorLeads)
    .innerJoin(teams, eq(teams.id, sponsorLeads.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(where)
    .orderBy(desc(sponsorLeads.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sponsorLeads)
    .innerJoin(teams, eq(teams.id, sponsorLeads.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(where);

  return { leads, total: count };
}

/** Nav-Badge: unbearbeitete Leads. */
export async function countOpenSponsorLeads(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sponsorLeads)
    .where(isNull(sponsorLeads.handledAt));
  return count;
}

/**
 * Hakt einen Lead ab bzw. öffnet ihn wieder. Gibt `null` zurück, wenn der Lead
 * nicht (mehr) existiert — z.B. von der Retention gelöscht, während die Liste
 * im Browser offen stand.
 */
export async function setSponsorLeadHandled(
  leadId: string,
  handled: boolean
): Promise<{ id: string; handledAt: Date | null } | null> {
  const rows = await db
    .update(sponsorLeads)
    .set({ handledAt: handled ? new Date() : null })
    .where(eq(sponsorLeads.id, leadId))
    .returning({ id: sponsorLeads.id, handledAt: sponsorLeads.handledAt });
  return rows[0] ?? null;
}
