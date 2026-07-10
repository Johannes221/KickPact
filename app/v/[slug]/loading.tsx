import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading-State für das öffentliche Vereinsprofil (/v/[slug]).
 * Spiegelt das Layout grob wider (dunkler Hero + Textblock + Team-Karten),
 * damit kein Layout-Shift entsteht. Pattern wie app/m/[slug]/loading.tsx.
 */
export default function PublicClubProfileLoading() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-screen-sm bg-white pb-12">
      {/* Hero (dunkel) */}
      <div className="bg-brand-night-navy px-4 pb-6 pt-24">
        <Skeleton className="h-12 w-12 rounded-xl bg-white/10" />
        <Skeleton className="mt-3 h-7 w-56 bg-white/10" />
        <Skeleton className="mt-2 h-3 w-36 bg-white/10" />
      </div>

      {/* Beschreibung */}
      <div className="space-y-2 px-4 pt-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>

      {/* Team-Karten */}
      <div className="space-y-2 px-4 pt-6">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
