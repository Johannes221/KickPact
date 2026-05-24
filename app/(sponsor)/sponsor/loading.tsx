import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading-State für das Sponsor-Dashboard.
 * Spiegelt das Layout der echten page.tsx grob wider (4 KPI-Cards + Sparkline-Card
 * + Pledges-Liste) damit kein Layout-Shift entsteht.
 */
export default function SponsorDashboardLoading() {
  return (
    <div className="space-y-10">
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 md:h-9 w-20 mt-2" />
              <Skeleton className="h-3 w-16 mt-1.5" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
          <div className="flex items-baseline justify-between mb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-32 w-full" />
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <ul className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-brand-neutral/40 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="space-y-2 text-right">
                  <Skeleton className="h-3 w-16 ml-auto" />
                  <Skeleton className="h-3 w-20 ml-auto" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
