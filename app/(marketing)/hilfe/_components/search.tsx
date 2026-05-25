"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface SearchableArticle {
  slug: string;
  title: string;
  category: string;
  category_label: string;
  snippet: string;
}

export function HilfeSearch({ articles }: { articles: SearchableArticle[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    // Einfache Substring-Suche über Title + Snippet. Bei mehr als 60 Artikeln
    // sollte das auf Fuse.js wechseln, hier reicht's.
    return articles
      .filter((a) => {
        const haystack = (a.title + " " + a.snippet).toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [articles, query]);

  return (
    <div className="relative mx-auto max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-night-navy/40" />
        <Input
          type="search"
          autoComplete="off"
          placeholder={'Was suchst du? z.B. „Cap", „Saison-Pass", „Trigger"…'}
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full rounded-lg border border-brand-neutral/40 bg-white shadow-lg overflow-hidden z-10">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-brand-night-navy/55">
              Keine Treffer für „{query}". Probiers mit einem anderen Begriff.
            </p>
          ) : (
            <ul className="divide-y divide-brand-neutral/30">
              {results.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/hilfe/${r.category}/${r.slug}`}
                    className="block p-3 hover:bg-brand-off-white transition-colors"
                    onClick={() => setQuery("")}
                  >
                    <span className="block text-sm font-semibold text-brand-night-navy">
                      {r.title}
                    </span>
                    <span className="block text-[0.7rem] uppercase tracking-widest text-accent-dark mt-0.5">
                      {r.category_label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
