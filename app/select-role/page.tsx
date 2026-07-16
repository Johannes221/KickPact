import Link from "next/link";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdminUser } from "@/lib/auth/admin";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { listMyPendingRequests } from "@/lib/db/queries/membership-requests";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";
import { eur } from "@/lib/utils/currency";
import { saisonLabel } from "@/lib/utils/saison";

export const metadata = { title: "Rolle wählen · KickPact" };

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

export default async function SelectRolePage() {
  const user = await requireUser();
  if (await isPlatformAdminUser(user.id)) redirect("/admin");
  const [identities, pendingRequests] = await Promise.all([
    getUserIdentities(user.id),
    listMyPendingRequests(user.id)
  ]);

  // Diese Seite ist der „Account vorhanden"-Hub: vorhandene Rollen zur Auswahl
  // + „Neue Rolle hinzufügen". Sie wird auch bei EINER Rolle gezeigt — der User
  // soll seine Rolle(n) sehen und gezielt wählen können, statt stumm
  // deep-gelinkt zu werden. Nur wenn es gar nichts zu zeigen gibt (0 Rollen,
  // 0 offene Anfragen), bouncen wir zum Dispatcher (→ /signup-Chooser).
  // Hinweis: Der Post-Login-Flow läuft über /dashboard (Hauptrolle) — diese
  // Seite erreicht man bewusst (Header-Switcher, /signup), nie automatisch.
  const total =
    identities.clubs.length + identities.teamOnly.length + (identities.sponsor ? 1 : 0);
  if (total + pendingRequests.length < 1) {
    redirect(pickDashboardDestination(identities));
  }

  return (
    // pt: Safe-Area + Luft — in der nativen App ist diese Seite chromelos
    // (kein Header); ohne env(safe-area-inset-top) klebte der Titel direkt
    // unter der iOS-Statusbar. Im Browser ist env()=0 → normales Padding.
    <main className="mx-auto max-w-4xl px-5 md:px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-12 md:pt-16 md:pb-16">
      <div className="mb-8 md:mb-10 text-center">
        <h1 className="font-display font-black text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Mit welcher Rolle willst du arbeiten?
        </h1>
        <p className="mt-2 md:mt-3 text-sm md:text-base text-brand-night-navy/60 max-w-xl mx-auto">
          {total === 1
            ? "Hier ist deine Rolle — oder leg eine weitere an."
            : `Du bist in ${total} Rollen unterwegs. Wähle eine — du kannst jederzeit oben rechts wechseln.`}
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
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy break-words">
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
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy break-words">
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
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy break-words">
                  {t.teamName}
                </h2>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  {ROLE_LABEL[t.role]}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-night-navy/60 truncate">
                {t.clubName} · Saison {saisonLabel(t.saison)}
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
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy break-words">
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

        {pendingRequests.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-5"
          >
            <Hourglass className="mt-0.5 h-7 w-7 shrink-0 text-amber-500" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy break-words">
                  {r.requestedTeamName ?? r.clubName}
                </h2>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-amber-800">
                  Angefragt
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-night-navy/60 truncate">
                Zugriff angefragt — wartet auf Freigabe durch einen Admin.
              </p>
            </div>
          </div>
        ))}

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
