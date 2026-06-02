import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/admin";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

export const metadata = { title: "Rolle wählen · KickPact" };

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function SelectRolePage() {
  const user = await requireUser();
  if (await isPlatformAdminEmail(user.email)) redirect("/admin");
  const identities = await getUserIdentities(user.id);

  // If the user landed here with 0 or 1 identity (bookmark, refresh after
  // role-revocation, etc.), bounce them to where they actually belong.
  const total =
    identities.clubs.length + identities.teamOnly.length + (identities.sponsor ? 1 : 0);
  if (total < 2) {
    redirect(pickDashboardDestination(identities));
  }

  return (
    <main className="mx-auto max-w-4xl px-5 md:px-6 py-12 md:py-16">
      <div className="mb-8 md:mb-10 text-center">
        <h1 className="font-display font-black text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Mit welcher Rolle willst du arbeiten?
        </h1>
        <p className="mt-2 md:mt-3 text-sm md:text-base text-brand-night-navy/60 max-w-xl mx-auto">
          Du bist in {total} Rollen unterwegs. Wähle eine — du kannst jederzeit oben rechts wechseln.
        </p>
      </div>

      <div className="grid gap-4 md:gap-5 md:grid-cols-2">
        {identities.clubs.map((c) => {
          // basic/pro = Mannschafts-Lizenz: als Mannschaft darstellen und direkt
          // in die Team-Page verlinken — der Verein ist nur Container. Nur echte
          // Vereinslizenzen erscheinen als Vereins-Karte.
          const asTeam =
            (c.effectivePlan === "basic" || c.effectivePlan === "pro") &&
            c.firstTeamId;
          if (asTeam) {
            return (
              <Link
                key={`club-team-${c.firstTeamId}`}
                href={`/verein/${c.slug}/mannschaft/${c.firstTeamId}`}
                className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
              >
                <div className="text-3xl shrink-0">⚽</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                      {c.firstTeamName ?? c.name}
                    </h2>
                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                      {ROLE_LABEL[c.role]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-brand-night-navy/60 truncate">
                    {c.name} · {c.sponsorCount} aktive Sponsor{c.sponsorCount === 1 ? "" : "en"}
                  </p>
                  <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                    Weiter →
                  </div>
                </div>
              </Link>
            );
          }
          return (
            <Link
              key={`club-${c.clubId}`}
              href={`/verein/${c.slug}`}
              className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
            >
              <div className="text-3xl shrink-0">🏟️</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                    {c.name}
                  </h2>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                    {ROLE_LABEL[c.role]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-brand-night-navy/60">
                  {c.teamCount} Mannschaft{c.teamCount === 1 ? "" : "en"} · {c.sponsorCount} aktive Sponsor{c.sponsorCount === 1 ? "" : "en"}
                </p>
                <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                  Weiter →
                </div>
              </div>
            </Link>
          );
        })}

        {identities.teamOnly.map((t) => (
          <Link
            key={`team-${t.teamId}`}
            href={`/verein/${t.clubSlug}/mannschaft/${t.teamId}`}
            className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
          >
            <div className="text-3xl shrink-0">⚽</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                  {t.teamName}
                </h2>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  {ROLE_LABEL[t.role]}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-night-navy/60 truncate">
                {t.clubName} · Saison {t.saison}
              </p>
              <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                Weiter →
              </div>
            </div>
          </Link>
        ))}

        {identities.sponsor && (
          <Link
            href="/sponsor"
            className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
          >
            <div className="text-3xl shrink-0">💚</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                {identities.sponsor.displayName}
              </h2>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                {identities.sponsor.activePledgeCount} aktive Pact{identities.sponsor.activePledgeCount === 1 ? "" : "s"}
                {identities.sponsor.thisMonthCents > 0 && (
                  <> · {eur(identities.sponsor.thisMonthCents)} diesen Monat</>
                )}
              </p>
              <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                Sponsor-Dashboard →
              </div>
            </div>
          </Link>
        )}

        <Link
          href="/signup?add=1"
          className="group flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-neutral/60 bg-transparent p-5 text-sm font-semibold text-brand-night-navy/60 transition-all hover:border-accent hover:text-accent hover:bg-accent/5"
        >
          <span className="text-2xl">+</span>
          <span>Neue Rolle hinzufügen</span>
        </Link>
      </div>
    </main>
  );
}
