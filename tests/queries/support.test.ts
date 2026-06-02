import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, supportTickets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
  getTicketForUser,
  listTicketsForUser,
  addSupportReply,
  addCustomerReply,
  setSupportTicketStatus,
  assignTicket,
  setTicketPriority,
  countOpenTickets,
  listOverdueTickets,
  ticketReference
} from "@/lib/db/queries/support";

async function seedUser(opts: { admin?: boolean } = {}): Promise<string> {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
    name: "Test User",
    isPlatformAdmin: opts.admin ?? false,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return userId;
}

/** Setzt created_at künstlich in die Vergangenheit (für Overdue-Tests). */
async function ageTicket(ticketId: string, hours: number): Promise<void> {
  const past = new Date(Date.now() - hours * 3_600_000);
  await db.update(supportTickets).set({ createdAt: past }).where(eq(supportTickets.id, ticketId));
}

describe("support queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("ticketReference ist stabil + im KP-XXXXXX-Format", () => {
    const ref = ticketReference("abcdef1234567890");
    expect(ref).toBe("KP-567890");
    expect(ticketReference("abcdef1234567890")).toBe(ref);
  });

  it("createSupportTicket speichert Kontext + Priorität und setzt lastReplyBy=customer", async () => {
    const userId = await seedUser();
    const id = await createSupportTicket({
      name: "Max",
      email: "Max@Beispiel.DE",
      category: "spieldaten",
      subject: "Ergebnis falsch",
      message: "Das Tor in Minute 87 fehlt.",
      priority: "high",
      userId,
      contextType: "match",
      contextId: "match-123",
      contextUrl: "/verein/fc/spiel/match-123",
      contextMeta: { label: "SV A 2:1 FC B" }
    });

    const t = await getSupportTicket(id);
    expect(t).not.toBeNull();
    expect(t!.email).toBe("max@beispiel.de"); // lowercased
    expect(t!.category).toBe("spieldaten");
    expect(t!.priority).toBe("high");
    expect(t!.contextType).toBe("match");
    expect(t!.contextId).toBe("match-123");
    expect(t!.contextMeta).toEqual({ label: "SV A 2:1 FC B" });
    expect(t!.status).toBe("open");
    expect(t!.lastReplyBy).toBe("customer");
  });

  it("addSupportReply (gemailt) setzt Status open→waiting + lastReplyBy=operator", async () => {
    const operator = await seedUser({ admin: true });
    const id = await createSupportTicket({
      name: "Max",
      email: "max@b.de",
      category: "frage",
      subject: "Frage",
      message: "Wie geht das?"
    });

    await addSupportReply({ ticketId: id, operatorUserId: operator, body: "So geht das." });
    const t = await getSupportTicket(id);
    expect(t!.status).toBe("waiting");
    expect(t!.lastReplyBy).toBe("operator");
    expect(t!.replies).toHaveLength(1);
    expect(t!.replies[0].authorType).toBe("operator");
    expect(t!.replies[0].internal).toBe(false);
  });

  it("interne Notiz ändert Status NICHT und ist für den Kunden unsichtbar", async () => {
    const operator = await seedUser({ admin: true });
    const userId = await seedUser();
    const id = await createSupportTicket({
      name: "Max",
      email: "max@b.de",
      category: "frage",
      subject: "Frage",
      message: "?",
      userId
    });

    await addSupportReply({ ticketId: id, operatorUserId: operator, body: "intern: prüfen", internal: true });
    const adminView = await getSupportTicket(id);
    expect(adminView!.status).toBe("open"); // unverändert
    expect(adminView!.replies).toHaveLength(1);
    expect(adminView!.replies[0].internal).toBe(true);

    // Kunden-Sicht filtert interne Notizen heraus.
    const customerView = await getTicketForUser(id, userId);
    expect(customerView!.replies).toHaveLength(0);
  });

  it("addCustomerReply ist owner-gated und hebt waiting/closed auf open", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const operator = await seedUser({ admin: true });
    const id = await createSupportTicket({
      name: "Max",
      email: "max@b.de",
      category: "frage",
      subject: "Frage",
      message: "?",
      userId: owner
    });
    await addSupportReply({ ticketId: id, operatorUserId: operator, body: "Antwort" }); // → waiting

    // Fremder darf nicht antworten.
    const denied = await addCustomerReply({ ticketId: id, userId: stranger, body: "hack" });
    expect(denied.ok).toBe(false);

    // Owner antwortet → open + lastReplyBy=customer.
    const ok = await addCustomerReply({ ticketId: id, userId: owner, body: "Danke!" });
    expect(ok.ok).toBe(true);
    const t = await getSupportTicket(id);
    expect(t!.status).toBe("open");
    expect(t!.lastReplyBy).toBe("customer");
  });

  it("assignTicket + setTicketPriority + Status closed setzt closedAt", async () => {
    const operator = await seedUser({ admin: true });
    const id = await createSupportTicket({
      name: "Max",
      email: "max@b.de",
      category: "frage",
      subject: "Frage",
      message: "?"
    });

    await assignTicket({ ticketId: id, assignedToUserId: operator });
    await setTicketPriority({ ticketId: id, priority: "urgent" });
    let t = await getSupportTicket(id);
    expect(t!.assignedToUserId).toBe(operator);
    expect(t!.assigneeEmail).toContain("@test.local");
    expect(t!.priority).toBe("urgent");

    await setSupportTicketStatus({ ticketId: id, status: "closed" });
    t = await getSupportTicket(id);
    expect(t!.status).toBe("closed");
    expect(t!.closedAt).not.toBeNull();

    // Zuweisung entfernen.
    await assignTicket({ ticketId: id, assignedToUserId: null });
    t = await getSupportTicket(id);
    expect(t!.assignedToUserId).toBeNull();
  });

  it("listSupportTickets filtert nach status/priority/assignee/unassigned/category", async () => {
    const operator = await seedUser({ admin: true });
    const a = await createSupportTicket({ name: "A", email: "a@b.de", category: "bug", subject: "A", message: "xxxxxxxxxx", priority: "high" });
    const b = await createSupportTicket({ name: "B", email: "b@b.de", category: "frage", subject: "B", message: "xxxxxxxxxx" });
    await assignTicket({ ticketId: a, assignedToUserId: operator });

    expect((await listSupportTickets({ assignedTo: operator })).tickets.map((t) => t.id)).toEqual([a]);
    expect((await listSupportTickets({ unassigned: true })).tickets.map((t) => t.id)).toEqual([b]);
    expect((await listSupportTickets({ priority: "high" })).tickets.map((t) => t.id)).toEqual([a]);
    expect((await listSupportTickets({ category: "frage" })).tickets.map((t) => t.id)).toEqual([b]);
    expect((await listSupportTickets({ search: "a@b.de" })).tickets.map((t) => t.id)).toEqual([a]);
    expect((await listSupportTickets()).total).toBe(2);
  });

  it("countOpenTickets zählt nur offene", async () => {
    const op = await seedUser({ admin: true });
    const a = await createSupportTicket({ name: "A", email: "a@b.de", category: "frage", subject: "A", message: "xxxxxxxxxx" });
    await createSupportTicket({ name: "B", email: "b@b.de", category: "frage", subject: "B", message: "xxxxxxxxxx" });
    expect(await countOpenTickets()).toBe(2);
    await addSupportReply({ ticketId: a, operatorUserId: op, body: "reply" }); // → waiting
    expect(await countOpenTickets()).toBe(1);
  });

  it("listOverdueTickets: nur alt + Kunde-wartet, sortiert nach Priorität", async () => {
    const op = await seedUser({ admin: true });

    const oldUrgent = await createSupportTicket({ name: "U", email: "u@b.de", category: "frage", subject: "alt-urgent", message: "xxxxxxxxxx", priority: "urgent" });
    const oldNormal = await createSupportTicket({ name: "N", email: "n@b.de", category: "frage", subject: "alt-normal", message: "xxxxxxxxxx", priority: "normal" });
    const fresh = await createSupportTicket({ name: "F", email: "f@b.de", category: "frage", subject: "frisch", message: "xxxxxxxxxx" });
    const answered = await createSupportTicket({ name: "A", email: "a@b.de", category: "frage", subject: "beantwortet", message: "xxxxxxxxxx" });

    await ageTicket(oldUrgent, 48);
    await ageTicket(oldNormal, 48);
    await ageTicket(answered, 48);
    await addSupportReply({ ticketId: answered, operatorUserId: op, body: "schon beantwortet" }); // lastReplyBy=operator → nicht overdue

    const overdue = await listOverdueTickets(24);
    const ids = overdue.map((t) => t.id);
    expect(ids).toContain(oldUrgent);
    expect(ids).toContain(oldNormal);
    expect(ids).not.toContain(fresh); // zu jung
    expect(ids).not.toContain(answered); // Operator hat zuletzt geantwortet
    // urgent vor normal
    expect(ids.indexOf(oldUrgent)).toBeLessThan(ids.indexOf(oldNormal));
  });

  it("listTicketsForUser liefert nur eigene Tickets", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const mine = await createSupportTicket({ name: "Me", email: "me@b.de", category: "frage", subject: "meins", message: "xxxxxxxxxx", userId: me });
    await createSupportTicket({ name: "O", email: "o@b.de", category: "frage", subject: "fremd", message: "xxxxxxxxxx", userId: other });

    const list = await listTicketsForUser(me);
    expect(list.map((t) => t.id)).toEqual([mine]);
    // Fremdes Ticket ist via getTicketForUser nicht erreichbar.
    expect(await getTicketForUser(mine, other)).toBeNull();
  });
});
