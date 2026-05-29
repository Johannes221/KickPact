import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
  addSupportReply,
  setSupportTicketStatus
} from "@/lib/db/queries/support";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeOperator(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `op-${id}@kickpact.local`,
    emailVerified: true,
    name: "Operator",
    isPlatformAdmin: true
  });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("support tickets", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a ticket and lists it as open", async () => {
    const id = await createSupportTicket({
      name: "Max Muster",
      email: "Max@Example.de",
      category: "frage",
      subject: "Wie funktioniert das?",
      message: "Ich habe eine Frage zu Pacts."
    });
    expect(id).toBeTruthy();

    const { tickets, total, openCount } = await listSupportTickets();
    expect(total).toBe(1);
    expect(openCount).toBe(1);
    expect(tickets[0].email).toBe("max@example.de");
    expect(tickets[0].status).toBe("open");
  });

  it("filters by status", async () => {
    await createSupportTicket({
      name: "A",
      email: "a@example.de",
      category: "bug",
      subject: "Bug",
      message: "Etwas ist kaputt."
    });
    const closedId = await createSupportTicket({
      name: "B",
      email: "b@example.de",
      category: "frage",
      subject: "Frage",
      message: "Eine Frage."
    });
    await setSupportTicketStatus({ ticketId: closedId, status: "closed" });

    const open = await listSupportTickets({ status: "open" });
    expect(open.total).toBe(1);
    const closed = await listSupportTickets({ status: "closed" });
    expect(closed.total).toBe(1);
    expect(closed.tickets[0].id).toBe(closedId);
  });

  it("adds a reply, moves open→waiting, and returns the thread", async () => {
    const opId = await makeOperator();
    const ticketId = await createSupportTicket({
      name: "C",
      email: "c@example.de",
      category: "abrechnung",
      subject: "Rechnung",
      message: "Frage zur Rechnung."
    });

    await addSupportReply({ ticketId, operatorUserId: opId, body: "Hallo, hier die Antwort.", mailId: "mail_1" });

    const detail = await getSupportTicket(ticketId);
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("waiting");
    expect(detail!.replies).toHaveLength(1);
    expect(detail!.replies[0].body).toBe("Hallo, hier die Antwort.");
    expect(detail!.replies[0].mailId).toBe("mail_1");
  });
});
