import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading-State für das öffentliche Mannschafts-Profil (/m/[slug]).
 * Spiegelt das Editorial-Layout grob wider (dunkler Hero + Insights-Kacheln +
 * Galerie-Streifen + Textblock), damit kein Layout-Shift entsteht.
 * Pattern wie app/(sponsor)/sponsor/loading.tsx.
 */
export default function PublicTeamProfileLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-lg pb-16">
      {/* Hero (dunkel) */}
      <div className="bg-brand-night-navy px-4 pb-8 pt-10">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48 bg-white/10" />
            <Skeleton className="h-3 w-32 bg-white/10" />
          </div>
        </div>
        <Skeleton className="mt-5 h-4 w-64 bg-white/10" />
      </div>

      {/* Saison-Insights */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-3 shadow-ios-card">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-2 h-6 w-10" />
          </div>
        ))}
      </div>

      {/* Galerie-Streifen */}
      <div className="flex gap-2 overflow-hidden px-4 pt-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-36 flex-none rounded-xl" />
        ))}
      </div>

      {/* Über uns / Anfrage */}
      <div className="space-y-3 px-4 pt-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="mt-4 h-11 w-full rounded-full" />
      </div>
    </main>
  );
}
