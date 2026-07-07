/**
 * Retention für unbegrenzt wachsende System-Tabellen (Vibe-Check 2026-07-06).
 *
 * processed_stripe_events (Webhook-Idempotenz) und sent_notifications
 * (Mail-Dedupe) brauchen ihre Rows nur solange das jeweilige Dedupe-Fenster
 * offen ist: Stripe retryt Events max. ~3 Tage, alle Notification-Keys sind
 * zeit-/saisonsgebunden (Reminder-Fenster, Approval-Expiry 21d, Match-Push
 * direkt nach Spiel). 90 Tage sind damit weit auf der sicheren Seite.
 *
 * sponsor_leads (Vibe-Check 2026-07-07): Kontaktdaten (Name/E-Mail) NICHT
 * eingeloggter Besucher — DSGVO-relevante Dritt-PII, die ohne Retention
 * unbegrenzt wüchse und per Betroffenenanfrage nicht auffindbar wäre. Ein Lead
 * ist eine transiente Kontaktaufnahme; nach 180 Tagen ist er entweder in einen
 * Sponsor konvertiert (eigener Datensatz) oder verfallen → löschen.
 *
 * Aufgerufen vom täglichen expire-approvals-Cron (lifecycle-cleanup).
 */
import { lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { processedStripeEvents, sentNotifications, sponsorLeads } from "@/lib/db/schema";

export const SYSTEM_RETENTION_DAYS = 90;
export const LEADS_RETENTION_DAYS = 180;

export async function deleteExpiredSystemRows(
  now: Date
): Promise<{ stripeEvents: number; notifications: number; leads: number }> {
  const cutoff = new Date(
    now.getTime() - SYSTEM_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const leadsCutoff = new Date(
    now.getTime() - LEADS_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const stripeEvents = await db
    .delete(processedStripeEvents)
    .where(lt(processedStripeEvents.processedAt, cutoff))
    .returning({ id: processedStripeEvents.eventId });
  const notifications = await db
    .delete(sentNotifications)
    .where(lt(sentNotifications.sentAt, cutoff))
    .returning({ key: sentNotifications.key });
  const leads = await db
    .delete(sponsorLeads)
    .where(lt(sponsorLeads.createdAt, leadsCutoff))
    .returning({ id: sponsorLeads.id });
  return {
    stripeEvents: stripeEvents.length,
    notifications: notifications.length,
    leads: leads.length
  };
}
