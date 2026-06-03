import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { getMatchById, listMatchEvents, listMatchCharges } from "@/lib/db/queries/matches";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchEventsList } from "./match-events-list";
import { ManualEventEditor } from "./manual-event-editor";
import { ResultOverrideEditor } from "./result-override-editor";
import { AdminNoteDisplay } from "./admin-note-display";
import { ReportProblemButton } from "@/components/support/report-problem-button";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** "2526" → "25/26"; lässt bereits formatierte oder unbekannte Werte unangetastet. */
function formatSaison(saison: string): string {
  return /^\d{4}$/.test(saison) ? `${saison.slice(0, 2)}/${saison.slice(2)}` : saison;
}

export interface MatchDetailViewProps {
  slug: string;
  matchId: string;
  /** Ziel des Zurück-Links (Club-Dashboard oder Team-Spiele-Liste). */
  backHref: string;
}

/**
 * Geteilte Server-Component für die Spiel-Detailansicht. Wird sowohl von der
 * Club-Route (`/verein/[slug]/spiel/[matchId]`) als auch von der team-scoped
 * Route (`/verein/[slug]/mannschaft/[teamId]/spiel/[matchId]`) gerendert.
 *
 * Access-Check 1:1 wie zuvor: Match wird scoped per `slug` geladen, danach
 * team-aware autorisiert (`resolveTeamAccess`), damit reine Team-Mitglieder
 * ohne Club-Membership nicht in einen Redirect-Loop fallen. Edit-Rechte nur
 * für Team-Admin oder Club-Admin/-Trainer.
 */
export async function MatchDetailView({ slug, matchId, backHref }: MatchDetailViewProps) {
  const user = await requireUser();

  const data = await getMatchById(matchId, slug);
  if (!data) redirect(`/verein/${slug}`);

  const teamAccess = await resolveTeamAccess(user.id, data.team.id, "viewer");
  if (!teamAccess.granted) redirect("/dashboard");

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
  const metaLine = `${datumStr} · Saison ${formatSaison(team.saison)}`;

  const isHeim = detectTeamSide([team.name, data.club.name], match.heimName) === "heim";
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
    <div className="space-y-8 pb-24">
      {/* Zurück-Link (kein wrappender Breadcrumb mehr) */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-brand-night-navy/60 hover:text-accent transition-colors"
      >
        <span aria-hidden>←</span>
        <span>Zurück</span>
      </Link>

      {/* Score-Header */}
      <Card className="border-brand-neutral/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
              {metaLine}
            </CardTitle>
            <span
              className={
                "text-[0.65rem] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full shrink-0 " +
                resultColors[result]
              }
            >
              {resultLabels[result]}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Score-Zeile: Heim (rechtsbündig, gekürzt/truncate) — Ergebnis (fix
              mittig, tabular-nums) — Gast (linksbündig, gekürzt/truncate). Die
              feste mittlere Spalte sorgt dafür, dass das Ergebnis IMMER sichtbar
              und ausgerichtet bleibt, egal wie lang die Vereinsnamen sind. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
            {/* Heim */}
            <div className={`min-w-0 text-right ${isHeim ? "font-semibold" : ""}`}>
              <div
                className="truncate text-sm sm:text-base font-semibold text-brand-night-navy leading-snug"
                title={match.heimName}
              >
                {abbreviateTeamName(match.heimName)}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">
                {isHeim ? "Heim · deine Mannschaft" : "Heim"}
              </div>
            </div>

            {/* Ergebnis — feste mittige Spalte */}
            <div className="flex flex-col items-center">
              <div className="font-bold text-4xl sm:text-5xl tracking-tight text-brand-night-navy tabular-nums whitespace-nowrap">
                {match.ergebnisHeim ?? "—"}
                <span className="text-brand-night-navy/30 mx-1.5 sm:mx-2">:</span>
                {match.ergebnisGast ?? "—"}
              </div>
              {match.halbzeitHeim !== null && match.halbzeitGast !== null && (
                <div className="mt-1 text-xs text-brand-night-navy/50 tabular-nums whitespace-nowrap">
                  HZ {match.halbzeitHeim} : {match.halbzeitGast}
                </div>
              )}
            </div>

            {/* Gast */}
            <div className={`min-w-0 text-left ${!isHeim ? "font-semibold" : ""}`}>
              <div
                className="truncate text-sm sm:text-base font-semibold text-brand-night-navy leading-snug"
                title={match.gastName}
              >
                {abbreviateTeamName(match.gastName)}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">
                {!isHeim ? "Gast · deine Mannschaft" : "Gast"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── CHARGES-SEKTION ─── */}
      {chargesData.totalCents > 0 ? (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="text-2xl font-bold tracking-tight text-brand-night-navy">
              Sponsor-Charges
            </h2>
            <span className="text-2xl font-bold tracking-tight text-accent">
              {eur(chargesData.totalCents)}
            </span>
          </div>

          {/* Trigger-Breakdown */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            {chargesData.byTrigger.map((t) => (
              <div
                key={t.triggerType}
                className="rounded-xl bg-white shadow-ios-card p-3 flex items-center gap-3"
              >
                <span className="text-2xl shrink-0">{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-brand-night-navy/60 uppercase tracking-widest truncate">
                    {t.label}
                  </div>
                  <div className="text-base font-bold tracking-tight text-brand-night-navy">
                    {t.count}× · {eur(t.totalCents)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Sponsor-Breakdown */}
          <div className="rounded-2xl bg-white shadow-ios-card overflow-x-auto">
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
                  <td className="px-4 py-2.5 text-right text-base font-bold text-accent tabular-nums">
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
          <h2 className="text-2xl font-bold tracking-tight text-brand-night-navy">
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
