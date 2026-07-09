"use server";

/**
 * Audit 2026-05-24 Phase 4 / Tasks 4.1 + 4.2: DSGVO-Rechte
 * (Art. 15/20 Datenexport, Art. 17 Löschung).
 *
 * Beide Aktionen sind User-initiiert via Profil-Page:
 *   - `requestDataExport()` → JSON-Export aller User-Daten als Mail-Attachment
 *   - `requestAccountDeletion()` → markiert User.deletion_requested_at = now,
 *     Anonymisierungs-Cron erledigt die Löschung 14d später (Cooldown gegen
 *     versehentliche Klicks + Audit-Trail)
 *
 * Steuer-relevante Rechnungsdaten (invoices, charges) bleiben gemäß § 147 AO
 * 10 Jahre erhalten — sie werden anonymisiert (sponsor → "Gelöschter Sponsor"),
 * nicht gelöscht.
 */

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  users,
  sponsors,
  pledges,
  pledgeRules,
  invoices,
  clubMemberships,
  teamMemberships,
  sponsorInquiries,
  supportTickets,
  clubVerifications,
  teamVerifications
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { maskEmail } from "@/lib/utils/log-pii";

export async function requestDataExport(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();

    // Sammle alle User-bezogenen Daten (DSGVO Art. 15 Auskunft + Art. 20 Portabilität)
    const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    const sponsorRows = await db.select().from(sponsors).where(eq(sponsors.userId, user.id));
    const sponsorIds = sponsorRows.map((s) => s.id);

    // SECURITY/DSGVO (M6): ALLE Sponsor-Profile berücksichtigen (vorher nur
    // sponsorIds[0] → unvollständiger Export bei Mehrfach-Profilen, Verstoß
    // gegen Art. 15/20 Vollständigkeit).
    const pledgeRows = sponsorIds.length
      ? await db.select().from(pledges).where(inArray(pledges.sponsorId, sponsorIds))
      : [];
    const pledgeIds = pledgeRows.map((p) => p.id);
    const pledgeRuleRows = pledgeIds.length
      ? await db.select().from(pledgeRules).where(inArray(pledgeRules.pledgeId, pledgeIds))
      : [];

    const clubMembershipRows = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, user.id));
    const teamMembershipRows = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, user.id));

    const invoiceRows = sponsorIds.length
      ? await db.select().from(invoices).where(inArray(invoices.sponsorId, sponsorIds))
      : [];

    // M6: bisher fehlende PII-tragende Tabellen ergänzen.
    const supportTicketRows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, user.id));
    const sponsorInquiryRows = await db
      .select()
      .from(sponsorInquiries)
      .where(eq(sponsorInquiries.sponsorUserId, user.id));
    const clubVerificationRows = await db
      .select()
      .from(clubVerifications)
      .where(eq(clubVerifications.submittedByUserId, user.id));
    const teamVerificationRows = await db
      .select()
      .from(teamVerifications)
      .where(eq(teamVerifications.submittedByUserId, user.id));

    const exportData = {
      generatedAt: new Date().toISOString(),
      schema: "kickpact-data-export-v1",
      user: userRow,
      sponsorProfiles: sponsorRows,
      pledges: pledgeRows,
      pledgeRules: pledgeRuleRows,
      clubMemberships: clubMembershipRows,
      teamMemberships: teamMembershipRows,
      invoices: invoiceRows,
      supportTickets: supportTicketRows,
      sponsorInquiries: sponsorInquiryRows,
      clubVerifications: clubVerificationRows,
      teamVerifications: teamVerificationRows,
      info:
        "Diese Datei enthält alle personenbezogenen Daten, die KickPact zu deinem Account speichert. " +
        "Format: JSON. Für DSGVO Art. 20 Datenübertragbarkeit. Bei Fragen: hello@kickpact.com."
    };

    const json = JSON.stringify(exportData, null, 2);
    const buf = Buffer.from(json, "utf-8");

    const send = await resend.emails.send({
      from: MAIL_FROM,
      to: user.email,
      subject: "Deine KickPact-Daten — DSGVO-Export",
      text:
        `Hi,\n\n` +
        `wie angefragt findest du im Anhang einen vollständigen Export deiner KickPact-Daten\n` +
        `im JSON-Format. Diese Datei enthält alle personenbezogenen Daten, die wir zu deinem\n` +
        `Account gespeichert haben (DSGVO Art. 15 Auskunft, Art. 20 Datenübertragbarkeit).\n\n` +
        `Bei Fragen einfach auf diese Mail antworten.\n\n` +
        `KickPact`,
      attachments: [
        { filename: `kickpact-data-export-${new Date().toISOString().slice(0, 10)}.json`, content: buf }
      ],
      headers: {
        "Idempotency-Key": `dsgvo-export-${user.id}-${new Date().toISOString().slice(0, 10)}`
      }
    });
    if (send.error) {
      console.error("[dsgvo] export-mail failed", { to: maskEmail(user.email), error: send.error });
      return { ok: false, error: "Mail-Versand fehlgeschlagen, bitte später erneut versuchen." };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function requestAccountDeletion(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();

    // Bestätigungs-Mail ZUERST (idempotent via Idempotency-Key): schlägt sie
    // fehl, wird das Lösch-Flag NICHT gesetzt → der Nutzer sieht einen echten
    // Fehler statt einer still angelaufenen 14-Tage-Anonymisierung.
    await resend.emails.send({
      from: MAIL_FROM,
      to: user.email,
      subject: "KickPact-Account-Löschung beantragt",
      text:
        `Hi,\n\n` +
        `du hast die Löschung deines KickPact-Accounts beantragt.\n\n` +
        `In den nächsten 14 Tagen kannst du den Vorgang noch widerrufen — einfach\n` +
        `Mail an hello@kickpact.com.\n\n` +
        `Nach Ablauf der 14-Tage-Frist anonymisieren wir deinen Account: persönliche\n` +
        `Daten (Name, E-Mail) werden ersetzt, deine Login-Möglichkeit wird entfernt.\n` +
        `Rechnungsdaten bleiben gemäß § 147 AO 10 Jahre erhalten (anonymisiert).\n\n` +
        `Du kannst dich bis dahin weiterhin einloggen.\n\n` +
        `KickPact`,
      headers: {
        "Idempotency-Key": `dsgvo-deletion-request-${user.id}`
      }
    });

    await db
      .update(users)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(users.id, user.id));

    revalidatePath("/konto");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function cancelAccountDeletion(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await db
      .update(users)
      .set({ deletionRequestedAt: null })
      .where(eq(users.id, user.id));
    revalidatePath("/konto");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
