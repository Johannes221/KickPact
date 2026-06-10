"use client";

import { useRouter } from "next/navigation";

export function DiscoverFilters({
  basePath,
  facets,
  current
}: {
  basePath: string;
  facets: { leagues: string[]; orte: string[] };
  current: { q: string; league: string; ort: string };
}) {
  const router = useRouter();

  function update(next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    const sp = new URLSearchParams();
    if (merged.q) sp.set("q", merged.q);
    if (merged.league) sp.set("league", merged.league);
    if (merged.ort) sp.set("ort", merged.ort);
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilter = current.q || current.league || current.ort;

  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row">
      <form
        className="flex-1"
        onSubmit={(e) => {
          // Enter/„Suchen" auf Mobile löste vorher nur preventDefault aus → nichts
          // passierte (Filter lief ausschließlich onBlur). Jetzt Query lesen + filtern.
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          update({ q: typeof q === "string" ? q : "" });
        }}
        action={basePath}
        method="GET"
      >
        <input
          type="search"
          name="q"
          defaultValue={current.q}
          onBlur={(e) => update({ q: e.target.value })}
          placeholder="Mannschaft, Verein oder Ort …"
          className="w-full rounded-lg bg-white shadow-ios-card px-4 py-3 text-base text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </form>
      <select
        value={current.league}
        onChange={(e) => update({ league: e.target.value })}
        className="rounded-lg bg-white shadow-ios-card px-3 py-3 text-sm text-brand-night-navy"
      >
        <option value="">Alle Ligen</option>
        {facets.leagues.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={current.ort}
        onChange={(e) => update({ ort: e.target.value })}
        className="rounded-lg bg-white shadow-ios-card px-3 py-3 text-sm text-brand-night-navy"
      >
        <option value="">Alle Orte</option>
        {facets.orte.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hasFilter && (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="rounded-lg px-3 py-3 text-sm font-semibold text-brand-night-navy/60 hover:text-brand-night-navy"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
}
