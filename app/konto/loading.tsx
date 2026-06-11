import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading-State für „Mein Konto" (/konto). Spiegelt das Seitengerüst grob
 * wider (Titel + Profil-Card + Rollen-Liste + Einstellungs-Cards), damit kein
 * Layout-Shift entsteht. Pattern wie app/(sponsor)/sponsor/loading.tsx.
 */
export default function KontoLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:py-10">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* Profil-Card */}
      <div className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </div>

      {/* Rollen-Liste */}
      <div className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-5 rounded" />
          </div>
        ))}
      </div>

      {/* Einstellungs-Cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
      ))}
    </div>
  );
}
