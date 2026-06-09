import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  listNotifications,
  countUnreadNotifications
} from "@/lib/db/queries/notifications";

export const dynamic = "force-dynamic";

/**
 * Benachrichtigungen des eingeloggten Users für die App-Bar-Glocke.
 * Liefert die letzten Events + die Anzahl ungelesener — der Client zeigt sie
 * im Notifications-Sheet und nutzt `unreadCount` für den Badge.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ unreadCount: 0, items: [] }, { status: 200 });
  }

  const [rows, unreadCount] = await Promise.all([
    listNotifications(session.user.id, 30),
    countUnreadNotifications(session.user.id)
  ]);

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    read: n.readAt != null,
    createdAtIso: n.createdAt.toISOString()
  }));

  return NextResponse.json({ unreadCount, items }, { status: 200 });
}
