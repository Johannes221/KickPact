/**
 * Server-safe DataTable helpers.
 *
 * Lives OUTSIDE the "use client" `data-table.tsx` on purpose: Server Components
 * (page.tsx) call `parseSortFromSearchParams` during render. Exports of a
 * "use client" module become client references and throw when invoked on the
 * server ("Attempted to call … from the server"). Keeping the pure helper here
 * lets both server and client import it.
 */

export type SortDirection = "asc" | "desc";

/**
 * Parse `sort` + `dir` from searchParams with an explicit allowlist of sortable
 * keys. Returns `undefined` for invalid/unknown keys; `dir` defaults to "desc".
 */
export function parseSortFromSearchParams<TKey extends string>(
  sp: { get: (key: string) => string | null },
  allowed: readonly TKey[]
): { sort: TKey | undefined; dir: SortDirection } {
  const rawSort = sp.get("sort");
  const rawDir = sp.get("dir");
  const sort =
    rawSort && (allowed as readonly string[]).includes(rawSort)
      ? (rawSort as TKey)
      : undefined;
  const dir: SortDirection = rawDir === "asc" ? "asc" : "desc";
  return { sort, dir };
}
