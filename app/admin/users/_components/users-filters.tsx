"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";

export function UsersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [hasSponsor, setHasSponsor] = useState(sp.get("sponsor") === "1");
  const [hasClub, setHasClub] = useState(sp.get("club") === "1");
  const [hasPledges, setHasPledges] = useState(sp.get("pledges") === "1");

  useEffect(() => {
    setSearch(sp.get("q") ?? "");
    setHasSponsor(sp.get("sponsor") === "1");
    setHasClub(sp.get("club") === "1");
    setHasPledges(sp.get("pledges") === "1");
  }, [sp]);

  function navigate(patch: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({
          q: search.trim(),
          sponsor: hasSponsor ? "1" : "",
          club: hasClub ? "1" : "",
          pledges: hasPledges ? "1" : ""
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-brand-night-navy/70">
        <span>Suche</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Email / Name"
          className="h-9 w-56 rounded-md border border-brand-neutral bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
        />
      </label>
      <label className="inline-flex items-center gap-2 text-xs text-brand-night-navy/70">
        <input
          type="checkbox"
          checked={hasSponsor}
          onChange={(e) => {
            setHasSponsor(e.target.checked);
            navigate({ sponsor: e.target.checked ? "1" : "" });
          }}
        />
        hat Sponsor
      </label>
      <label className="inline-flex items-center gap-2 text-xs text-brand-night-navy/70">
        <input
          type="checkbox"
          checked={hasClub}
          onChange={(e) => {
            setHasClub(e.target.checked);
            navigate({ club: e.target.checked ? "1" : "" });
          }}
        />
        hat Club-Membership
      </label>
      <label className="inline-flex items-center gap-2 text-xs text-brand-night-navy/70">
        <input
          type="checkbox"
          checked={hasPledges}
          onChange={(e) => {
            setHasPledges(e.target.checked);
            navigate({ pledges: e.target.checked ? "1" : "" });
          }}
        />
        hat Pacts
      </label>
      <button
        type="submit"
        className="h-9 rounded-md bg-brand-night-navy px-3 text-sm font-semibold text-white hover:bg-brand-night-navy/90"
      >
        Suchen
      </button>
    </form>
  );
}
