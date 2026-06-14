import { and, desc, eq, gte, ilike, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { supportTickets, supportTicketReplies, users } from "@/lib/db/schema";

/**
 * Zählt Tickets derselben E-Mail innerhalb der letzten `minutes` — Basis für
 * ein einfaches Anti-Spam-Rate-Limit im öffentlichen Kontaktformular.
 */
export async function countRecentTicketsByEmail(email: string, minutes: number): Promise<number> {
  // Ein nicht-positives Fenster enthält per Definition nichts. Guard auch gegen
  // eine Clock-Skew-Flake: bei minutes=0 ist `since` = lokale Jetzt-Zeit, während
  // createdAt von der (evtl. minimal vorgehenden) DB-Uhr kommt → ein gerade
  // erstelltes Ticket würde sonst sporadisch mitgezählt.
  if (minutes <= 0) return 0;
  const since = new Date(Date.now() - minutes * 60_000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(and(eq(supportTickets.email, email.toLowerCase()), gte(supportTickets.createdAt, since)));
  return row?.count ?? 0;
}

export type SupportCategory = "frage" | "bug" | "abrechnung" | "spieldaten" | "sonstiges";
export type SupportStatus = "open" | "in_progress" | "waiting" | "closed";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
export type SupportContextType = "none" | "match" | "invoice" | "pledge" | "team" | "page";
export type SupportReplyAuthor = "operator" | "customer" | "system";

/**
 * Menschen-lesbare Ticket-Referenz für E-Mails/UI (z.B. „KP-7F8A2C"). Aus der
 * CUID2 abgeleitet — keine eigene Spalte nötig, stabil pro Ticket.
 */
export function ticketReference(id: string): string {
  return `KP-${id.slice(-6).toUpperCase()}`;
}

export interface CreateSupportTicketInput {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: SupportPriority;
  userId?: string | null;
  clubId?: string | null;
  teamId?: string | null;
  contextType?: SupportContextType;
  contextId?: string | null;
  contextUrl?: string | null;
  contextMeta?: Record<string, unknown> | null;
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
      priority: input.priority ?? "normal",
      userId: input.userId ?? null,
      clubId: input.clubId ?? null,
      teamId: input.teamId ?? null,
      contextType: input.contextType ?? "none",
      contextId: input.contextId ?? null,
      contextUrl: input.contextUrl ?? null,
      contextMeta: input.contextMeta ?? null,
      lastReplyBy: "customer",
      lastReplyAt: new Date()
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
  priority: SupportPriority;
  contextType: SupportContextType;
  assignedToUserId: string | null;
  assigneeEmail: string | null;
  lastReplyAt: Date | null;
  lastReplyBy: SupportReplyAuthor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSupportTicketsOpts {
  status?: SupportStatus;
  priority?: SupportPriority;
  category?: SupportCategory;
  contextType?: SupportContextType;
  /** Nur Tickets dieses Operators. */
  assignedTo?: string;
  /** Nur Tickets ohne Zuweisung. */
  unassigned?: boolean;
  /** Nur überfällige (offen/in_progress, Kunde wartet, älter als `overdueHours`). */
  overdue?: boolean;
  overdueHours?: number;
  /** Volltext über Betreff/Name/E-Mail. */
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listSupportTickets(
  opts?: ListSupportTicketsOpts
): Promise<{ tickets: SupportTicketListItem[]; total: number; openCount: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const conditions = buildTicketFilters(opts);
  const where = conditions.length ? and(...conditions) : undefined;

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
      priority: supportTickets.priority,
      contextType: supportTickets.contextType,
      assignedToUserId: supportTickets.assignedToUserId,
      assigneeEmail: users.email,
      lastReplyAt: supportTickets.lastReplyAt,
      lastReplyBy: supportTickets.lastReplyBy,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.assignedToUserId, users.id))
    .where(where)
    .orderBy(desc(supportTickets.createdAt))
    .limit(limit)
    .offset(offset);

  return { tickets: tickets as SupportTicketListItem[], total: count, openCount };
}

function buildTicketFilters(opts?: ListSupportTicketsOpts) {
  const conditions = [];
  if (opts?.status) conditions.push(eq(supportTickets.status, opts.status));
  if (opts?.priority) conditions.push(eq(supportTickets.priority, opts.priority));
  if (opts?.category) conditions.push(eq(supportTickets.category, opts.category));
  if (opts?.contextType) conditions.push(eq(supportTickets.contextType, opts.contextType));
  if (opts?.assignedTo) conditions.push(eq(supportTickets.assignedToUserId, opts.assignedTo));
  if (opts?.unassigned) conditions.push(isNull(supportTickets.assignedToUserId));
  if (opts?.overdue) {
    const cutoff = new Date(Date.now() - (opts.overdueHours ?? 24) * 3_600_000);
    conditions.push(
      or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress"))!,
      or(isNull(supportTickets.lastReplyBy), ne(supportTickets.lastReplyBy, "operator"))!,
      lt(supportTickets.createdAt, cutoff)
    );
  }
  if (opts?.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(supportTickets.subject, term),
        ilike(supportTickets.name, term),
        ilike(supportTickets.email, term)
      )!
    );
  }
  return conditions;
}

export interface SupportTicketReply {
  id: string;
  body: string;
  authorType: SupportReplyAuthor;
  internal: boolean;
  operatorUserId: string | null;
  mailId: string | null;
  createdAt: Date;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  message: string;
  userId: string | null;
  clubId: string | null;
  teamId: string | null;
  contextId: string | null;
  contextUrl: string | null;
  contextMeta: Record<string, unknown> | null;
  closedAt: Date | null;
  replies: SupportTicketReply[];
}

async function loadTicketReplies(ticketId: string): Promise<SupportTicketReply[]> {
  return db
    .select({
      id: supportTicketReplies.id,
      body: supportTicketReplies.body,
      authorType: supportTicketReplies.authorType,
      internal: supportTicketReplies.internal,
      operatorUserId: supportTicketReplies.operatorUserId,
      mailId: supportTicketReplies.mailId,
      createdAt: supportTicketReplies.createdAt
    })
    .from(supportTicketReplies)
    .where(eq(supportTicketReplies.ticketId, ticketId))
    .orderBy(supportTicketReplies.createdAt);
}

function mapTicketDetail(
  ticket: typeof supportTickets.$inferSelect,
  replies: SupportTicketReply[]
): SupportTicketDetail {
  return {
    id: ticket.id,
    name: ticket.name,
    email: ticket.email,
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    priority: ticket.priority,
    contextType: ticket.contextType,
    contextId: ticket.contextId,
    contextUrl: ticket.contextUrl,
    contextMeta: (ticket.contextMeta as Record<string, unknown> | null) ?? null,
    assignedToUserId: ticket.assignedToUserId,
    assigneeEmail: null,
    userId: ticket.userId,
    clubId: ticket.clubId,
    teamId: ticket.teamId,
    lastReplyAt: ticket.lastReplyAt,
    lastReplyBy: ticket.lastReplyBy,
    closedAt: ticket.closedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    replies
  };
}

export async function getSupportTicket(id: string): Promise<SupportTicketDetail | null> {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!ticket) return null;

  const replies = await loadTicketReplies(id);
  const detail = mapTicketDetail(ticket, replies);

  if (ticket.assignedToUserId) {
    const [assignee] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ticket.assignedToUserId))
      .limit(1);
    detail.assigneeEmail = assignee?.email ?? null;
  }
  return detail;
}

/** Kunden-Center: alle Tickets, die diesem User gehören. */
export async function listTicketsForUser(userId: string): Promise<SupportTicketListItem[]> {
  const rows = await db
    .select({
      id: supportTickets.id,
      name: supportTickets.name,
      email: supportTickets.email,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      contextType: supportTickets.contextType,
      assignedToUserId: supportTickets.assignedToUserId,
      assigneeEmail: sql<string | null>`null`,
      lastReplyAt: supportTickets.lastReplyAt,
      lastReplyBy: supportTickets.lastReplyBy,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt
    })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.updatedAt));
  return rows as SupportTicketListItem[];
}

/**
 * Kunden-Center-Detail: nur das eigene Ticket, interne Notizen werden
 * herausgefiltert (der Kunde sieht ausschließlich Operator-Antworten +
 * seine eigenen Nachrichten).
 */
export async function getTicketForUser(
  ticketId: string,
  userId: string
): Promise<SupportTicketDetail | null> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
    .limit(1);
  if (!ticket) return null;

  const replies = (await loadTicketReplies(ticketId)).filter((r) => !r.internal);
  return mapTicketDetail(ticket, replies);
}

/** Kunden-Antwort aus dem In-App-Ticket-Center. */
export async function addCustomerReply(input: {
  ticketId: string;
  userId: string;
  body: string;
}): Promise<{ ok: boolean }> {
  // Owner-Check: Kunde darf nur an eigene Tickets antworten.
  const [ticket] = await db
    .select({ id: supportTickets.id, status: supportTickets.status })
    .from(supportTickets)
    .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.userId, input.userId)))
    .limit(1);
  if (!ticket) return { ok: false };

  const now = new Date();
  await db.insert(supportTicketReplies).values({
    ticketId: input.ticketId,
    operatorUserId: null,
    authorType: "customer",
    internal: false,
    body: input.body
  });
  // Kunde hat reagiert → Ball liegt wieder beim Operator: 'waiting' und
  // 'closed' werden auf 'open' gehoben, 'in_progress' bleibt.
  const nextStatus =
    ticket.status === "waiting" || ticket.status === "closed" ? "open" : ticket.status;
  await db
    .update(supportTickets)
    .set({
      status: nextStatus,
      lastReplyBy: "customer",
      lastReplyAt: now,
      closedAt: null,
      updatedAt: now
    })
    .where(eq(supportTickets.id, input.ticketId));
  return { ok: true };
}

export async function addSupportReply(input: {
  ticketId: string;
  operatorUserId: string;
  body: string;
  internal?: boolean;
  mailId?: string | null;
}): Promise<string> {
  const internal = input.internal ?? false;
  const [row] = await db
    .insert(supportTicketReplies)
    .values({
      ticketId: input.ticketId,
      operatorUserId: input.operatorUserId,
      authorType: "operator",
      internal,
      body: input.body,
      mailId: input.mailId ?? null
    })
    .returning({ id: supportTicketReplies.id });

  // Interne Notizen ändern weder Status noch „wer wartet". Eine echte
  // (gemailte) Operator-Antwort verschiebt das Ticket auf 'waiting' (sofern
  // es offen war) — der Operator wartet jetzt auf den Absender.
  if (!internal) {
    const now = new Date();
    await db
      .update(supportTickets)
      .set({ lastReplyBy: "operator", lastReplyAt: now, updatedAt: now })
      .where(eq(supportTickets.id, input.ticketId));
    await db
      .update(supportTickets)
      .set({ status: "waiting" })
      .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.status, "open")));
  }
  return row.id;
}

export async function setSupportTicketStatus(input: {
  ticketId: string;
  status: SupportStatus;
}): Promise<void> {
  await db
    .update(supportTickets)
    .set({
      status: input.status,
      closedAt: input.status === "closed" ? new Date() : null,
      updatedAt: new Date()
    })
    .where(eq(supportTickets.id, input.ticketId));
}

export async function assignTicket(input: {
  ticketId: string;
  assignedToUserId: string | null;
}): Promise<void> {
  await db
    .update(supportTickets)
    .set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() })
    .where(eq(supportTickets.id, input.ticketId));
}

export async function setTicketPriority(input: {
  ticketId: string;
  priority: SupportPriority;
}): Promise<void> {
  await db
    .update(supportTickets)
    .set({ priority: input.priority, updatedAt: new Date() })
    .where(eq(supportTickets.id, input.ticketId));
}

/** Anzahl offener Tickets — für das Nav-Badge im Admin-Panel. */
export async function countOpenTickets(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(eq(supportTickets.status, "open"));
  return row?.count ?? 0;
}

export interface OverdueTicket {
  id: string;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  assigneeEmail: string | null;
  createdAt: Date;
  lastReplyAt: Date | null;
}

/**
 * Liefert überfällige Tickets für den SLA-Reminder: offen/in_progress, der
 * Kunde wartet (zuletzt NICHT vom Operator beantwortet), älter als
 * `thresholdHours`. Sortiert nach Priorität (dringend zuerst) + Alter.
 */
export async function listOverdueTickets(thresholdHours = 24): Promise<OverdueTicket[]> {
  const cutoff = new Date(Date.now() - thresholdHours * 3_600_000);
  const rows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      category: supportTickets.category,
      priority: supportTickets.priority,
      status: supportTickets.status,
      assigneeEmail: users.email,
      createdAt: supportTickets.createdAt,
      lastReplyAt: supportTickets.lastReplyAt
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.assignedToUserId, users.id))
    .where(
      and(
        or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress"))!,
        or(isNull(supportTickets.lastReplyBy), ne(supportTickets.lastReplyBy, "operator"))!,
        lt(supportTickets.createdAt, cutoff)
      )
    )
    .orderBy(
      sql`CASE ${supportTickets.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
      supportTickets.createdAt
    );
  return rows as OverdueTicket[];
}
