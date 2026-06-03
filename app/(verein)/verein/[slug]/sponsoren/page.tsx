import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { getClubSponsorenOverview } from "@/lib/db/queries/sponsoring-admin";
import { SponsorsManager } from "./_components/sponsors-manager";
import { InquiriesInbox } from "./_components/inquiries-inbox";
import { DiscoverabilityPanel } from "./_components/discoverability-panel";

export const metadata = { title: "Sponsoren · KickPact" };

export default async function SponsorenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  // Teams (inkl. Container-Verifizierung, Sponsoren-Gate Design 2026-05-29
  // §3.5/§6), aktive Einladungen, aktive Sponsoren + offene Discover-Anfragen.
  const { teamRows, invitations, activeSponsors, inquiries } =
    await getClubSponsorenOverview(club.id);

  return (
    <div className="space-y-6 md:space-y-10">
      <SponsorsManager
        clubSlug={slug}
        teams={teamRows.map((t) => {
          // Vereinslizenz → Verein-Verifikation (Teams erben). Einzel-Mannschaft
          // (basic/pro) → eigene Mannschafts-Verifikation.
          const isVereinslizenz = t.plan === "verein";
          return {
            id: t.id,
            name: t.name,
            canInvite: isVereinslizenz
              ? t.containerVerifiedAt !== null
              : t.teamVerifiedAt !== null,
            verifyEntity: (isVereinslizenz
              ? "Verein"
              : "Mannschaft") as "Mannschaft" | "Verein",
            verifyHref: isVereinslizenz
              ? `/verein/${slug}/verifikation`
              : `/verein/${slug}/mannschaft/${t.id}/verifikation`
          };
        })}
        invitations={invitations.map((i) => ({
          id: i.inv.id,
          token: i.inv.token,
          status: i.inv.status,
          createdAt: i.inv.createdAt,
          teamId: i.team.id,
          teamName: i.team.name,
          recipientName: i.inv.recipientName ?? null
        }))}
      />

      {/* Sponsor-Inquiries (Discover) — Inbox-Sektion */}
      {inquiries.length > 0 && (
        <InquiriesInbox
          inquiries={inquiries.map((i) => ({
            ...i,
            createdAt: i.createdAt,
            sponsorName: i.sponsorName ?? null
          }))}
        />
      )}

      {/* Discoverability-Toggle pro Team */}
      <DiscoverabilityPanel
        teams={teamRows.map((t) => ({
          id: t.id,
          name: t.name,
          discoverable: t.discoverable,
          publicTagline: t.publicTagline ?? ""
        }))}
      />

      <section>
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Aktive Sponsoren ({activeSponsors.length})
        </h2>
        {activeSponsors.length === 0 ? (
          <p className="mt-3 text-sm text-brand-night-navy/60">
            Noch keine. Über Einladungslinks oben werben oder Discover aktivieren.
          </p>
        ) : (
          <ul className="mt-3 md:mt-4 space-y-2">
            {activeSponsors.map((s, i) => (
              <li
                key={`${s.sponsorId}-${i}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 md:p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm md:text-base text-brand-night-navy truncate">
                    {s.displayName}
                  </div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5 truncate">
                    {s.userEmail} · <span className="capitalize">{s.type}</span> · {s.teamName}
                  </div>
                </div>
                <div className="text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-accent-dark shrink-0">
                  {s.pledgeStatus}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
