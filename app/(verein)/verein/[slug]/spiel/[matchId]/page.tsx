import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { getMatchById, listMatchEvents, listMatchCharges } from "@/lib/db/queries/matches";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchEventsList } from "./_components/match-events-list";
import { ManualEventEditor } from "./_components/manual-event-editor";
import { ResultOverrideEditor } from "./_components/result-override-editor";
import { AdminNoteDisplay } from "./_components/admin-note-display";
import { ReportProblemButton } from "@/components/support/report-problem-button";

export const metadata = { title: "Spiel · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function MatchDetailPage({
  params
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  const user = await requireUser();

  // Match laden (scoped per clubSlug), DANN team-aware autorisieren — sonst
  // flogen reine Team-Mitglieder (ohne Club-Mitgliedschaft, z.B. via Zugriffs-
  // Anfrage) hier raus → Redirect-Loop. Zugriff kommt aus der Mannschaft.
  const data = await getMatchById(matchId, slug);
  if (!data) redirect(`/verein/${slug}`);

  const teamAccess = await resolveTeamAccess(user.id, data.team.id, "viewer");
  if (!teamAccess.granted) redirect("/dashboard");

  // Nur Trainer/Admin sehen Edit/Delete + Result-Override: Team-Admin ODER
  // Club-Admin/Trainer (vereinsgeführte Teams).
  const canEdit =
    (teamAccess.scope === "team" && teamAccess.role === "admin") ||
    (teamAccess.scope === "club" &&
      (teamAccess.role === "admin" || teamAccess.role === "trainer"));

  const [events, chargesData] = await Promise.all([
    listMatchEvents(matchId),
    listMatchCharges(matchId)
  ]);

  const { match, team } = data;
  const datumStr = match.datum.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Welche Seite ist unser Team? Vereinsname als zusätzliche Token-Quelle,
  // weil der Mannschafts-Name (z.B. "1. Herren") oft keinen Vereins-Token hat.
  const isHeim = detectTeamSide([team.name, data.club.name], match.heimName) === "heim";
  const unsereSeite = isHeim ? "heim" : "gast";
  const unsereGoals = isHeim ? (match.ergebnisHeim ?? 0) : (match.ergebnisGast ?? 0);
  const gegnerGoals = isHeim ? (match.ergebnisGast ?? 0) : (match.ergebnisHeim ?? 0);
  const result =
    match.ergebnisHeim === null
      ? "ausstehend"
      : unsereGoals > gegnerGoals
        ? "sieg"
        : unsereGoals < gegnerGoals
          ? "niederlage"
          : "unentschieden";

  const resultColors: Record<string, string> = {
    sieg: "bg-emerald-100 text-emerald-800",
    niederlage: "bg-rose-100 text-rose-700",
    unentschieden: "bg-amber-100 text-amber-800",
    ausstehend: "bg-neutral-100 text-neutral-600"
  };
  const resultLabels: Record<string, string> = {
    sieg: "Sieg",
    niederlage: "Niederlage",
    unentschieden: "Unentschieden",
    ausstehend: "Noch nicht gespielt"
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-brand-night-navy/60">
        <Link href={`/verein/${slug}`} className="hover:text-accent">
          ← Dashboard
        </Link>
        <span>/</span>
        <span>{team.name}</span>
      </div>

      {/* Score-Header */}
      <Card className="border-brand-neutral/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
              {datumStr} · Saison {team.saison}
            </CardTitle>
            <span
              className={
                "text-[0.65rem] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full " +
                resultColors[result]
              }
            >
              {resultLabels[result]}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className={`flex-1 min-w-0 text-right ${isHeim ? "font-semibold" : ""}`}>
              <div className="font-display font-black text-base md:text-xl tracking-tight text-brand-night-navy leading-tight break-words hyphens-auto">
                {match.heimName}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">
                {isHeim ? `← ${team.name}` : "Heimteam"}
              </div>
            </div>
            <div className="shrink-0 text-center">
              <div className="font-display font-black text-4xl sm:text-5xl md:text-6xl tracking-tight text-brand-night-navy tabular-nums">
                {match.ergebnisHeim ?? "—"}
                <span className="text-brand-night-navy/30 mx-1.5 sm:mx-2">:</span>
                {match.ergebnisGast ?? "—"}
              </div>
              {match.halbzeitHeim !== null && match.halbzeitGast !== null && (
                <div className="mt-1 text-xs text-brand-night-navy/50 tabular-nums">
                  HZ {match.halbzeitHeim} : {match.halbzeitGast}
                </div>
              )}
            </div>
            <div className={`flex-1 min-w-0 ${!isHeim ? "font-semibold" : ""}`}>
              <div className="font-display font-black text-base md:text-xl tracking-tight text-brand-night-navy leading-tight break-words hyphens-auto">
                {match.gastName}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">
                {!isHeim ? `${team.name} →` : "Gastteam"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── CHARGES-SEKTION ─── */}
      {chargesData.totalCents > 0 ? (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Sponsor-Charges
            </h2>
            <span className="font-display font-black text-2xl tracking-tight text-accent">
              {eur(chargesData.totalCents)}
            </span>
          </div>

          {/* Trigger-Breakdown */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            {chargesData.byTrigger.map((t) => (
              <div
                key={t.triggerType}
                className="rounded-xl border border-brand-neutral/40 bg-white p-3 flex items-center gap-3"
              >
                <span className="text-2xl shrink-0">{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-brand-night-navy/60 uppercase tracking-widest truncate">
                    {t.label}
                  </div>
                  <div className="font-display font-black text-base tracking-tight text-brand-night-navy">
                    {t.count}× · {eur(t.totalCents)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Sponsor-Breakdown */}
          <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Sponsor</th>
                  <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">Trigger</th>
                  <th className="px-4 py-3 text-right font-semibold">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {chargesData.bySponsor.map((s) => (
                  <tr key={s.sponsorDisplayName} className="hover:bg-brand-off-white/60">
                    <td className="px-4 py-3 font-medium text-brand-night-navy">
                      {s.sponsorDisplayName}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-night-navy/60 hidden sm:table-cell truncate max-w-[180px]">
                      {s.triggerSummary}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-brand-night-navy">
                      {eur(s.totalCents)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-brand-off-white">
                  <td
                    className="px-4 py-2.5 text-xs uppercase tracking-widest font-bold text-brand-night-navy/50"
                    colSpan={2}
                  >
                    Gesamt
                  </td>
                  <td className="px-4 py-2.5 text-right font-display font-black text-base text-accent tabular-nums">
                    {eur(chargesData.totalCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        match.status === "finished" && (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-5 text-sm text-brand-night-navy/60">
            <strong>Keine Charges für dieses Spiel.</strong> Entweder sind noch keine Pledges aktiv oder
            dieses Spiel hat keinen Trigger ausgelöst.
          </div>
        )
      )}

      {/* ─── SPIELVERLAUF ─── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
            Spielverlauf
          </h2>
          <span className="text-xs text-brand-night-navy/50">
            {events.length} Event{events.length === 1 ? "" : "s"}
          </span>
        </div>
        <MatchEventsList
          events={events}
          chargesByEvent={chargesData.rows}
          canEdit={canEdit}
        />
      </section>

      {/* Admin-Korrekturen (Audit-Trail) */}
      <AdminNoteDisplay adminNote={match.adminNote} />

      {/* Admin-Controls — Manual-Event hinzufügen + Result-Override */}
      {canEdit && (
        <section className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <ManualEventEditor matchId={match.id} />
          <ResultOverrideEditor
            matchId={match.id}
            initial={{
              ergebnisHeim: match.ergebnisHeim,
              ergebnisGast: match.ergebnisGast,
              halbzeitHeim: match.halbzeitHeim,
              halbzeitGast: match.halbzeitGast,
              heimName: match.heimName,
              gastName: match.gastName
            }}
          />
        </section>
      )}

      {/* „Stimmt etwas nicht?" — für ALLE Rollen (auch Viewer/Team-Mitglieder
          ohne Edit-Rechte). Erzeugt ein Support-Ticket mit verlinktem Spiel. */}
      <section className="border-t border-brand-neutral/30 pt-6 text-center">
        <p className="mb-2 text-sm text-brand-night-navy/60">
          Falsches Ergebnis, fehlendes Tor oder ein anderer Fehler bei diesem Spiel?
        </p>
        <div className="flex justify-center">
          <ReportProblemButton
            label="Stimmt etwas nicht?"
            title="Problem mit diesem Spiel melden"
            description="Beschreib kurz, was nicht stimmt (z.B. falsches Ergebnis oder fehlendes Tor). Wir prüfen es und melden uns."
            defaultCategory="spieldaten"
            variant="outline"
            context={{
              contextType: "match",
              contextId: match.id,
              clubId: data.club.id,
              teamId: team.id,
              contextMeta: {
                label: `${match.heimName} ${match.ergebnisHeim ?? "–"}:${match.ergebnisGast ?? "–"} ${match.gastName} (${datumStr})`,
                matchId: match.id,
                team: team.name,
                saison: team.saison
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}
