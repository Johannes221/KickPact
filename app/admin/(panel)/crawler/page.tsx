import Link from "next/link";
import { getCrawlerHealth, getRecentCrawls } from "@/lib/db/queries/crawler-health";
import { CrawlButton } from "./_components/crawl-button";

export const metadata = { title: "Crawler · Admin · KickPact" };
export const dynamic = "force-dynamic";

function ageLabel(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const hours = Math.floor(ms / 1000 / 60 / 60);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default async function CrawlerPage() {
  const [health, recentCrawls] = await Promise.all([
    getCrawlerHealth(),
    getRecentCrawls(20)
  ]);

  const totalTeams = health.length;
  const staleTeams = health.filter(
    (t) => !t.lastCrawledAt || Date.now() - t.lastCrawledAt.getTime() > 1000 * 60 * 60 * 48
  ).length;
  const errorTeams = health.filter((t) => t.lastError).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Aktive Teams (gecrawlt)
          </div>
          <div className="mt-1 font-display font-black text-2xl text-brand-night-navy tabular-nums">
            {totalTeams}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Stale (&gt;48h)
          </div>
          <div className="mt-1 font-display font-black text-2xl text-brand-night-navy tabular-nums">
            {staleTeams}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
          <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Letzte 20 Crawls
          </div>
          <div className="mt-1 font-display font-black text-2xl text-brand-night-navy tabular-nums">
            {recentCrawls.length}
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${errorTeams > 0 ? "border-rose-300 bg-rose-50" : "border-brand-neutral/40 bg-white"}`}>
          <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Mit Fehler
          </div>
          <div className={`mt-1 font-display font-black text-2xl tabular-nums ${errorTeams > 0 ? "text-rose-700" : "text-brand-night-navy"}`}>
            {errorTeams}
          </div>
        </div>
      </div>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Crawler-Health pro Team
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Verein / Team</th>
                <th className="px-3 py-2 text-left font-semibold">Saison</th>
                <th className="px-3 py-2 text-left font-semibold">Letzter Crawl</th>
                <th className="px-3 py-2 text-right font-semibold">Matches</th>
                <th className="px-3 py-2 text-right font-semibold">Finished %</th>
                <th className="px-3 py-2 text-left font-semibold">Fehler</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {health.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine aktiven Teams mit Fußball.de-ID.
                  </td>
                </tr>
              )}
              {health.map((t) => {
                const stale =
                  !t.lastCrawledAt ||
                  Date.now() - t.lastCrawledAt.getTime() > 1000 * 60 * 60 * 48;
                return (
                  <tr key={t.teamId}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/vereine/${t.clubSlug}`}
                        className="font-semibold hover:text-accent transition-colors"
                      >
                        {t.clubName}
                      </Link>
                      <div className="text-xs text-brand-night-navy/60">{t.teamName}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{t.saison}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          stale ? "text-rose-700" : "text-brand-night-navy/70"
                        }`}
                      >
                        {ageLabel(t.lastCrawledAt)}
                      </span>
                      {t.lastCrawledAt && (
                        <div className="text-[0.65rem] text-brand-night-navy/40 font-mono">
                          {t.lastCrawledAt.toLocaleString("de-DE")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {t.matchCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {t.finishedPercent}%
                    </td>
                    <td className="px-3 py-2 max-w-[16rem]">
                      {t.lastError ? (
                        <div>
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[0.7rem] font-semibold text-rose-700">
                            Fehler
                          </span>
                          <div className="mt-0.5 truncate text-[0.7rem] text-brand-night-navy/60" title={t.lastError}>
                            {t.lastError}
                          </div>
                          {t.lastErrorAt && (
                            <div className="text-[0.65rem] text-brand-night-navy/40 font-mono">
                              {t.lastErrorAt.toLocaleString("de-DE")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-brand-night-navy/30 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CrawlButton teamId={t.teamId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-brand-night-navy/50">
          Hinweis: „Finished %" ist eine Heuristik (status=finished / total).
          Echtes Drift-Alert-Tracking kommt in einer späteren Phase.
        </p>
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Letzte 20 Crawls
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Zeit</th>
                <th className="px-3 py-2 text-left font-semibold">Verein / Team</th>
                <th className="px-3 py-2 text-left font-semibold">Match</th>
                <th className="px-3 py-2 text-left font-semibold">Ergebnis</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {recentCrawls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Noch keine Crawls.
                  </td>
                </tr>
              )}
              {recentCrawls.map((c) => (
                <tr key={c.matchId}>
                  <td className="px-3 py-2 text-xs font-mono tabular-nums text-brand-night-navy/70">
                    {new Date(c.crawledAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-semibold">{c.clubName}</div>
                    <div className="text-brand-night-navy/60">{c.teamName}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.heimName} vs {c.gastName}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">
                    {c.ergebnisHeim ?? "—"} : {c.ergebnisGast ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
