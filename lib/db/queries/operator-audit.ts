import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { operatorAuditLog, users } from "@/lib/db/schema";

export type OperatorAuditTargetType =
  | "club"
  | "team"
  | "user"
  | "verification"
  | "invoice"
  | "subscription"
  | "charge"
  | "crawl"
  | "support"
  | "membership"
  | "sponsor_lead";

export interface RecordOperatorActionInput {
  operatorUserId: string;
  /** Punkt-getrennter Slug, z.B. "verification.approve", "club.block". */
  action: string;
  targetType?: OperatorAuditTargetType;
  targetId?: string | null;
  /** Menschlich lesbare Zusammenfassung für die Audit-Liste. */
  summary: string;
  /** Optionaler Kontext / Vorher-Nachher-Daten. */
  diff?: Record<string, unknown> | null;
}

/**
 * Schreibt einen Audit-Eintrag. BEST-EFFORT: Da der Aufruf NACH der bereits
 * angewandten Mutation erfolgt, darf ein Logging-Fehler die abgeschlossene
 * Aktion nicht nachträglich zum Scheitern bringen — wir loggen den Fehler,
 * werfen aber nicht. Append-only, niemals Update/Delete.
 */
export async function recordOperatorAction(input: RecordOperatorActionInput): Promise<void> {
  try {
    await db.insert(operatorAuditLog).values({
      operatorUserId: input.operatorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      summary: input.summary,
      diffJson: input.diff ?? null
    });
  } catch (err) {
    console.error("[operatorAudit] insert failed", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      err
    });
  }
}

export interface OperatorAuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  diffJson: unknown;
  createdAt: Date;
  operatorEmail: string | null;
}

export async function listOperatorAuditLog(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ entries: OperatorAuditEntry[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(operatorAuditLog);

  const entries = await db
    .select({
      id: operatorAuditLog.id,
      action: operatorAuditLog.action,
      targetType: operatorAuditLog.targetType,
      targetId: operatorAuditLog.targetId,
      summary: operatorAuditLog.summary,
      diffJson: operatorAuditLog.diffJson,
      createdAt: operatorAuditLog.createdAt,
      operatorEmail: users.email
    })
    .from(operatorAuditLog)
    .leftJoin(users, eq(operatorAuditLog.operatorUserId, users.id))
    .orderBy(desc(operatorAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return { entries, total: count };
}
