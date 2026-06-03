import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import {
  listNotifications,
  getNotificationSettings
} from "@/lib/db/queries/notifications";
import { NotificationSettings } from "./_components/notification-settings";
import { NotificationInbox, type InboxItem } from "./_components/notification-inbox";

export const metadata = { title: "Benachrichtigungen · KickPact" };

export default async function NotificationsPage() {
  const user = await requireUser();

  const [rows, settings] = await Promise.all([
    listNotifications(user.id, 50),
    getNotificationSettings(user.id)
  ]);

  // Opt-out-Default: fehlt die Settings-Zeile, gelten alle Kategorien als an.
  const initialSettings = {
    matchResults: settings?.matchResults ?? true,
    accessRequests: settings?.accessRequests ?? true,
    sponsorRequests: settings?.sponsorRequests ?? true,
    billing: settings?.billing ?? true
  };

  // Dates -> serialisierbar für die Client-Komponente.
  const items: InboxItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.readAt != null,
    createdAtIso: r.createdAt.toISOString()
  }));

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12 space-y-6 md:space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
          <Link href="/konto" className="hover:text-accent">
            Mein Konto
          </Link>{" "}
          / Benachrichtigungen
        </p>
        <h1 className="font-display font-bold text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          Benachrichtigungen
        </h1>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Push-Mitteilungen in der App steuern und den Verlauf einsehen.
        </p>
      </header>

      <NotificationSettings initial={initialSettings} />
      <NotificationInbox initial={items} />
    </main>
  );
}
