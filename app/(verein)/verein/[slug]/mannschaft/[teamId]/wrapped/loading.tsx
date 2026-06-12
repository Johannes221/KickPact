/**
 * Loading-State des Saison-Wrapped: dunkler Story-Rahmen mit pulsierenden
 * Progress-Bars, damit der Übergang in den Vollbild-Player nicht springt.
 */
export default function WrappedLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F0F1E]">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#16162B] via-[#0F0F1E] to-[#0F0F1E] sm:h-[min(92vh,860px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[430px] sm:rounded-[2rem] sm:border sm:border-white/10">
        <div className="flex gap-1 px-3 pt-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-1 flex-1 animate-pulse rounded-full bg-white/15" />
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-4 px-7">
          <div className="h-3 w-32 animate-pulse rounded bg-white/15" />
          <div className="h-12 w-56 animate-pulse rounded bg-white/15" />
          <div className="h-12 w-40 animate-pulse rounded bg-white/15" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
