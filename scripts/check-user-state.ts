import { db } from "@/lib/db/client";
import { users, clubMemberships, clubs, teams, teamMemberships, sponsors, subscriptions, teamLicenses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = "johannes.schartl@gmail.com";
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) { console.log("NO USER"); process.exit(1); }
  console.log("USER:", { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });

  const cms = await db.select().from(clubMemberships).where(eq(clubMemberships.userId, user.id));
  console.log("CLUB-MEMBERSHIPS:", cms.length, cms);

  if (cms.length > 0) {
    for (const m of cms) {
      const [c] = await db.select().from(clubs).where(eq(clubs.id, m.clubId));
      console.log("  CLUB:", c?.slug, c?.name, c?.id);
      const ts = await db.select().from(teams).where(eq(teams.clubId, m.clubId));
      console.log("  TEAMS:", ts.length, ts.map(t => ({id: t.id, name: t.name, saison: t.saison, isActive: t.isActive})));
      const sub = await db.select().from(subscriptions).where(eq(subscriptions.clubId, m.clubId));
      console.log("  SUBSCRIPTION:", sub);
      const tls = await db.select().from(teamLicenses).where(eq(teamLicenses.subscriptionClubId, m.clubId));
      console.log("  TEAM-LICENSES:", tls);
    }
  }

  const tms = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, user.id));
  console.log("TEAM-MEMBERSHIPS:", tms.length, tms);

  const sps = await db.select().from(sponsors).where(eq(sponsors.userId, user.id));
  console.log("SPONSORS:", sps);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
