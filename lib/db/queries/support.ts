import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { supportTickets, supportTicketReplies } from "@/lib/db/schema";

/**
 * Zählt Tickets derselben E-Mail innerhalb der letzten `minutes` — Basis für
 * ein einfaches Anti-Spam-Rate-Limit im öffentlichen Kontaktformular.
 */
export async function countRecentTicketsByEmail(email: string, minutes: number): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(and(eq(supportTickets.email, email.toLowerCase()), gte(supportTickets.createdAt, since)));
  return row?.count ?? 0;
}

export type SupportCategory = "frage" | "bug" | "abrechnung" | "sonstiges";
export type SupportStatus = "open" | "in_progress" | "waiting" | "closed";

export interface CreateSupportTicketInput {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  userId?: string | null;
  clubId?: string | null;
}

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<string> {
  const [row] = await db
    .insert(supportTickets)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      category: input.category,
      subject: input.subject,
      message: input.message,
      userId: input.userId ?? null,
      clubId: input.clubId ?? null
    })
    .returning({ id: supportTickets.id });
  return row.id;
}

export interface SupportTicketListItem {
  id: string;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  createdAt: Date;
  updatedAt: Date;
}

export async function listSupportTickets(opts?: {
  status?: SupportStatus;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: SupportTicketListItem[]; total: number; openCount: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const where = opts?.status ? eq(supportTickets.status, opts.status) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(where);

  const [{ count: openCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(eq(supportTickets.status, "open"));

  const tickets = await db
    .select({
      id: supportTickets.id,
      name: supportTickets.name,
      email: supportTickets.email,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt
    })
    .from(supportTickets)
    .where(where)
    .orderBy(desc(supportTickets.createdAt))
    .limit(limit)
    .offset(offset);

  return { tickets, total: count, openCount };
}

export interface SupportTicketReply {
  id: string;
  body: string;
  operatorUserId: string | null;
  mailId: string | null;
  createdAt: Date;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  message: string;
  userId: string | null;
  clubId: string | null;
  replies: SupportTicketReply[];
}

export async function getSupportTicket(id: string): Promise<SupportTicketDetail | null> {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!ticket) return null;

  const replies = await db
    .select({
      id: supportTicketReplies.id,
      body: supportTicketReplies.body,
      operatorUserId: supportTicketReplies.operatorUserId,
      mailId: supportTicketReplies.mailId,
      createdAt: supportTicketReplies.createdAt
    })
    .from(supportTicketReplies)
    .where(eq(supportTicketReplies.ticketId, id))
    .orderBy(supportTicketReplies.createdAt);

  return {
    id: ticket.id,
    name: ticket.name,
    email: ticket.email,
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    userId: ticket.userId,
    clubId: ticket.clubId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    replies
  };
}

export async function addSupportReply(input: {
  ticketId: string;
  operatorUserId: string;
  body: string;
  mailId?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(supportTicketReplies)
    .values({
      ticketId: input.ticketId,
      operatorUserId: input.operatorUserId,
      body: input.body,
      mailId: input.mailId ?? null
    })
    .returning({ id: supportTicketReplies.id });
  // Eine Antwort verschiebt das Ticket aus 'open' (sofern nicht geschlossen):
  // der Operator wartet jetzt auf den Absender.
  await db
    .update(supportTickets)
    .set({ status: "waiting", updatedAt: new Date() })
    .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.status, "open")));
  return row.id;
}

export async function setSupportTicketStatus(input: {
  ticketId: string;
  status: SupportStatus;
}): Promise<void> {
  await db
    .update(supportTickets)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(supportTickets.id, input.ticketId));
}
