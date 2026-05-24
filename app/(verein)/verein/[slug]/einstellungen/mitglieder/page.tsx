import Link from "next/link";
import { eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubMemberships, teamMemberships, users, teams } from "@/lib/db/schema";
import { listPendingRequestsForClub } from "@/lib/db/queries/membership-requests";
import { RequestsTable } from "./_components/requests-table";

export const metadata = { title: "Mitglieder · KickPact" };

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

export default async function MitgliederPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "admin");

  const [pendingRequests, clubMems, teamMems] = await Promise.all([
    listPendingRequestsForClub(club.id),
    db
      .select({
        userId: clubMemberships.userId,
        email: users.email,
        role: clubMemberships.role,
        createdAt: clubMemberships.createdAt
      })
      .from(clubMemberships)
      .innerJoin(users, eq(clubMemberships.userId, users.id))
      .where(eq(clubMemberships.clubId, club.id)),
    db
      .select({
        userId: teamMemberships.userId,
        email: users.email,
        role: teamMemberships.role,
        teamName: teams.name,
        teamId: teams.id,
        createdAt: teamMemberships.createdAt
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(eq(teams.clubId, club.id))
  ]);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/verein/${slug}/einstellungen`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Mitglieder
        </h2>
        <p className="text-sm text-brand-night-navy/60">
          Wer hat Zugriff auf {club.name} — und wer will Zugriff.
        </p>
      </div>

      {/* Offene Anfragen */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Offene Anfragen
          {pendingRequests.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {pendingRequests.length}
            </span>
          )}
        </h3>
        <RequestsTable clubSlug={slug} requests={pendingRequests} />
      </section>

      {/* Aktive Mitglieder */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Aktive Mitglieder
        </h3>

        {clubMems.length === 0 && teamMems.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">Noch keine Mitglieder.</p>
        ) : (
          <ul className="space-y-2">
            {clubMems.map((m) => (
              <li
                key={`c-${m.userId}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-brand-night-navy truncate">{m.email}</span>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  Verein · {ROLE_LABEL[m.role]}
                </span>
              </li>
            ))}
            {teamMems.map((m) => (
              <li
                key={`t-${m.userId}-${m.teamId}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-brand-night-navy truncate">{m.email}</span>
                <span className="shrink-0 rounded-full bg-brand-neutral/30 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-brand-night-navy">
                  {m.teamName} · {m.role === "trainer" ? "Trainer" : "Viewer"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* TODO (future iteration): role-change + revoke buttons here.
            Admin-self-demotion guard must check clubMemberships(role=admin) count > 1
            before allowing role-down or revoke on self. */}
      </section>
    </div>
  );
}
