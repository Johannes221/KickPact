"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchVereineAction } from "../_actions/search";
import { toast } from "sonner";

type VereinHit = { name: string; slug: string; vereinId: string; url: string };

export function SearchStep() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VereinHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSearch() {
    if (query.length < 2) {
      toast.error("Bitte mindestens 2 Zeichen eingeben");
      return;
    }
    startTransition(async () => {
      const res = await searchVereineAction({ query });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResults(res.results);
      setSearched(true);
      if (res.results.length === 0) {
        toast.info("Keine Treffer. Anderer Suchbegriff?");
      }
    });
  }

  function selectVerein(v: VereinHit) {
    const params = new URLSearchParams({
      vereinId: v.vereinId,
      slug: v.slug,
      name: v.name
    });
    router.push(`/onboarding/verein/2?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="search" className="text-sm font-semibold text-brand-night-navy">
          Vereinssuche (z.B. Stadtname oder Vereinsname)
        </Label>
        <div className="flex gap-2">
          <Input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="z.B. FC Heidelberg"
            disabled={pending}
          />
          <Button onClick={handleSearch} disabled={pending} variant="accent" size="lg">
            {pending ? "Suche..." : "Suchen"}
          </Button>
        </div>
        <p className="text-xs text-brand-night-navy/50">
          Wir scrapen Fußball.de live — die Suche dauert 3–5 Sekunden.
        </p>
      </div>

      {pending && (
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60 animate-pulse">
          Suche läuft bei Fußball.de…
        </div>
      )}

      {searched && !pending && (
        <div className="rounded-lg border border-brand-neutral/40 bg-white overflow-hidden">
          {results.length === 0 ? (
            <p className="p-6 text-sm text-brand-night-navy/60">
              Keine Treffer. Versuche einen anderen Suchbegriff.
            </p>
          ) : (
            <ul className="divide-y divide-brand-neutral/40">
              {results.map((v) => (
                <li key={v.vereinId}>
                  <button
                    type="button"
                    onClick={() => selectVerein(v)}
                    className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/5 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-brand-night-navy">{v.name}</div>
                      <div className="text-xs text-brand-night-navy/40 mt-0.5">
                        Fußball.de-ID: {v.vereinId}
                      </div>
                    </div>
                    <span className="text-accent text-xl">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
