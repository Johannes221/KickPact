import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading-State für das Vereins-Dashboard.
 * Spiegelt das Layout (5 Stat-Cards + Revenue-Chart + Top-Sponsoren +
 * PledgesTable + Letzte Spiele) damit kein Layout-Shift entsteht.
 */
export default function ClubDashboardLoading() {
  return (
    <div className="space-y-6 md:space-y-10">
      {/* Stat-Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-brand-neutral/40 bg-white p-6"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 md:h-9 w-24 mt-3" />
          </div>
        ))}
      </div>

      {/* Revenue + Top-Sponsoren */}
      <section className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-7 w-72" />
          <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
            <Skeleton className="h-56 md:h-64 w-full" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <div className="rounded-2xl border border-brand-neutral/40 bg-white p-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PledgesTable */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
