import { notFound } from "next/navigation";
import Link from "next/link";
import { getVereinDetail } from "@/lib/db/queries/platform-stats";
import { ClubActions } from "./_components/club-actions";
import { ClubEditForm } from "@/components/admin/club-edit-form";
import { TeamRowActions } from "@/components/admin/team-row-actions";
import { StripeClubActions } from "@/components/admin/stripe-club-actions";
import { isStripeConfigured } from "@/lib/stripe/client";

export const metadata = { title: "Verein-Detail · Admin · KickPact" };
export const dynamic = "force-dynamic";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  });
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Aktiv",
  past_due: "Past Due",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
  paused: "Pausiert"
};

export default async function VereinDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getVereinDetail(slug);
  if (!detail) notFound();

  const { club, subscription, members, teams, recentCharges } = detail;
  const stripeConfigured = isStripeConfigured();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/vereine"
            className="text-xs text-brand-night-navy/50 hover:text-brand-night-navy"
          >
            ← Alle Vereine
          </Link>
          <h2 className="mt-1 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
            {club.name}
          </h2>
          <div className="text-xs text-brand-night-navy/60 font-mono">{club.slug}</div>
        </div>
        <ClubActions
          clubSlug={club.slug}
          verified={Boolean(club.verifiedAt)}
          subStatus={subscription?.status ?? null}
        />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Stammdaten">
          <DefRow label="Ort">{club.ort ?? "—"}</DefRow>
          <DefRow label="IBAN">
            <span className="font-mono text-xs">{club.iban ?? "—"}</span>
          </DefRow>
          <DefRow label="Erstellt">
            {new Date(club.createdAt).toLocaleString("de-DE")}
          </DefRow>
          <DefRow label="Verifiziert">
            {club.verifiedAt
              ? new Date(club.verifiedAt).toLocaleString("de-DE")
              : "—"}
          </DefRow>
          <DefRow label="Onboarding">{club.onboardingStatus}</DefRow>
        </Card>

        <Card title="Subscription">
          {subscription ? (
            <>
              <DefRow label="Status">
                <span className="rounded-full border border-brand-neutral/30 bg-brand-off-white px-2 py-0.5 text-xs">
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </span>
              </DefRow>
              <DefRow label="Cycle">{subscription.billingCycle}</DefRow>
              <DefRow label="Trial endet">
                {subscription.trialEndsAt
                  ? new Date(subscription.trialEndsAt).toLocaleString("de-DE")
                  : "—"}
              </DefRow>
              <DefRow label="Period endet">
                {subscription.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleString("de-DE")
                  : "—"}
              </DefRow>
              <DefRow label="Pausiert bis">
                {subscription.pausedUntil
                  ? new Date(subscription.pausedUntil).toLocaleString("de-DE")
                  : "—"}
              </DefRow>
              <DefRow label="Stripe Customer">
                <span className="font-mono text-[0.7rem]">
                  {subscription.stripeCustomerId ?? "—"}
                </span>
              </DefRow>
              <div className="border-t border-brand-neutral/20 pt-2 mt-1">
                <StripeClubActions
                  clubSlug={club.slug}
                  hasStripeSub={Boolean(subscription.stripeSubscriptionId)}
                  stripeConfigured={stripeConfigured}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-brand-night-navy/60">
              Keine Subscription für diesen Verein.
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Stammdaten bearbeiten
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <ClubEditForm
            clubSlug={club.slug}
            defaults={{
              name: club.name,
              ort: club.ort ?? "",
              iban: club.iban ?? "",
              taxId: club.taxId ?? ""
            }}
          />
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Members ({members.length})
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Email</th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Rolle</th>
                <th className="px-3 py-2 text-left font-semibold">Beigetreten</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine Members.
                  </td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.userId}>
                  <td className="px-3 py-2 font-mono text-xs">{m.email}</td>
                  <td className="px-3 py-2">{m.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-brand-neutral/30 bg-brand-off-white px-2 py-0.5 text-xs">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-brand-night-navy/60">
                    {new Date(m.joinedAt).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Teams ({teams.length})
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Saison</th>
                <th className="px-3 py-2 text-left font-semibold">Plan</th>
                <th className="px-3 py-2 text-left font-semibold">License-Status</th>
                <th className="px-3 py-2 text-left font-semibold">Aktiv</th>
                <th className="px-3 py-2 text-left font-semibold">Discover</th>
                <th className="px-3 py-2 text-left font-semibold">Verifiziert</th>
                <th className="px-3 py-2 text-left font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {teams.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine Teams.
                  </td>
                </tr>
              )}
              {teams.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-semibold">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.saison}</td>
                  <td className="px-3 py-2 font-mono text-xs uppercase">
                    {t.plan ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{t.licenseStatus ?? "—"}</td>
                  <td className="px-3 py-2">
                    {t.isActive ? (
                      <span className="text-emerald-700">✓</span>
                    ) : (
                      <span className="text-brand-night-navy/60">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {t.discoverable ? (
                      <span className="text-emerald-700">✓</span>
                    ) : (
                      <span className="text-brand-night-navy/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {t.verifiedAt ? (
                      <span className="text-emerald-700">✓</span>
                    ) : (
                      <span className="text-brand-night-navy/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TeamRowActions
                      teamId={t.id}
                      name={t.name}
                      isActive={t.isActive}
                      discoverable={t.discoverable}
                      verified={Boolean(t.verifiedAt)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Letzte 20 Charges
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Datum</th>
                <th className="px-3 py-2 text-left font-semibold">Sponsor</th>
                <th className="px-3 py-2 text-left font-semibold">Team</th>
                <th className="px-3 py-2 text-left font-semibold">Trigger</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Betrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {recentCharges.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Noch keine Charges.
                  </td>
                </tr>
              )}
              {recentCharges.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 text-xs font-mono tabular-nums text-brand-night-navy/70">
                    {new Date(c.createdAt).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-3 py-2">{c.sponsorDisplayName}</td>
                  <td className="px-3 py-2 text-xs">{c.teamName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.triggerType}</td>
                  <td className="px-3 py-2 text-xs">{c.status}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {eur(c.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5">
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-3">
        {title}
      </div>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  );
}

function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-brand-night-navy/50 w-32 shrink-0">{label}</dt>
      <dd className="text-right text-brand-night-navy">{children}</dd>
    </div>
  );
}
