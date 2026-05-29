import { notFound } from "next/navigation";
import Link from "next/link";
import { getUserDetail } from "@/lib/db/queries/platform-stats";
import { UserProfileEdit } from "@/components/admin/user-profile-edit";
import { UserAccountActions } from "@/components/admin/user-account-actions";
import { UserClubMembershipActions } from "@/components/admin/user-club-membership-actions";

export const metadata = { title: "User-Detail · Admin · KickPact" };
export const dynamic = "force-dynamic";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  });
}

export default async function UserDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { user, sponsors, clubMemberships, recentPledges } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/users"
          className="text-xs text-brand-night-navy/50 hover:text-brand-night-navy"
        >
          ← Alle User
        </Link>
        <h2 className="mt-1 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {user.name ?? user.email}
        </h2>
        <div className="text-xs text-brand-night-navy/60 font-mono">{user.email}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-brand-neutral/30 bg-brand-off-white px-2 py-0.5">
            {user.emailVerified ? "Verifiziert" : "Nicht verifiziert"}
          </span>
          <span className="rounded-full border border-brand-neutral/30 bg-brand-off-white px-2 py-0.5">
            Erstellt {new Date(user.createdAt).toLocaleDateString("de-DE")}
          </span>
          {user.deletionRequestedAt && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-800">
              Löschung beantragt{" "}
              {new Date(user.deletionRequestedAt).toLocaleDateString("de-DE")}
            </span>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Profil bearbeiten
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <UserProfileEdit
            userId={user.id}
            defaultName={user.name ?? ""}
            defaultEmail={user.email}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Account-Aktionen
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <UserAccountActions
            userId={user.id}
            isPlatformAdmin={user.isPlatformAdmin}
            deletionRequested={Boolean(user.deletionRequestedAt)}
          />
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Sponsor-Profile ({sponsors.length})
        </h3>
        {sponsors.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
            Kein Sponsor-Profil.
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Display-Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Typ</th>
                  <th className="px-3 py-2 text-left font-semibold">Erstellt</th>
                  <th className="px-3 py-2 text-right font-semibold">Pacts</th>
                  <th className="px-3 py-2 text-right font-semibold">Charges-Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {sponsors.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-semibold">{s.displayName}</td>
                    <td className="px-3 py-2 text-xs">{s.type}</td>
                    <td className="px-3 py-2 text-xs text-brand-night-navy/60">
                      {new Date(s.createdAt).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {s.pledgeCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {eur(s.totalAmountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Club-Memberships ({clubMemberships.length})
        </h3>
        {clubMemberships.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
            Keine Club-Memberships.
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Verein</th>
                  <th className="px-3 py-2 text-left font-semibold">Rolle</th>
                  <th className="px-3 py-2 text-left font-semibold">Beigetreten</th>
                  <th className="px-3 py-2 text-left font-semibold">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {clubMemberships.map((m) => (
                  <tr key={`${m.clubId}-${user.id}`}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/vereine/${m.clubSlug}`}
                        className="font-semibold hover:text-accent transition-colors"
                      >
                        {m.clubName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{m.role}</td>
                    <td className="px-3 py-2 text-xs text-brand-night-navy/60">
                      {new Date(m.createdAt).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-3 py-2">
                      <UserClubMembershipActions
                        userId={user.id}
                        clubId={m.clubId}
                        currentRole={m.role as "admin" | "trainer" | "viewer"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Letzte 20 Pacts
        </h3>
        {recentPledges.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
            Keine Pacts.
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Verein</th>
                  <th className="px-3 py-2 text-left font-semibold">Team</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Endet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {recentPledges.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/vereine/${p.clubSlug}`}
                        className="font-semibold hover:text-accent transition-colors"
                      >
                        {p.clubName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.teamName}</td>
                    <td className="px-3 py-2 text-xs">{p.status}</td>
                    <td className="px-3 py-2 text-xs text-brand-night-navy/60 font-mono">
                      {new Date(p.endsAt).toLocaleDateString("de-DE")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
