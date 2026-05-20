import { cn } from "@/lib/utils";

type MatchEvent = {
  id: string;
  minute: number | null;
  type: "tor" | "auswechslung" | "spezial" | "karte";
  subtype: string | null;
  side: "heim" | "gast";
  playerName: string | null;
  source: "scraped" | "manual";
};

function eventEmoji(type: MatchEvent["type"], subtype: string | null): string {
  if (type === "tor") return "⚽";
  if (type === "auswechslung") return "🔄";
  if (type === "karte") {
    if (subtype === "rot") return "🟥";
    return "🟨";
  }
  if (type === "spezial") {
    if (subtype === "kopfball") return "🎯";
    if (subtype === "hackentor") return "🔥";
    if (subtype === "elfmeter") return "💥";
    return "🎭";
  }
  return "•";
}

function eventLabel(type: MatchEvent["type"], subtype: string | null): string {
  if (type === "tor") return "Tor";
  if (type === "auswechslung") return "Auswechslung";
  if (type === "karte") return subtype === "rot" ? "Rote Karte" : "Gelbe Karte";
  if (type === "spezial") {
    if (subtype === "kopfball") return "Kopfballtor";
    if (subtype === "hackentor") return "Hackentor";
    if (subtype === "elfmeter") return "Elfmeter";
    if (subtype === "volley") return "Volley";
    return subtype ?? "Spezial-Event";
  }
  return type;
}

export function MatchEventsList({ events }: { events: MatchEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60 text-center">
        Noch keine Events erfasst.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li
          key={e.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border bg-white px-3 py-2",
            e.side === "heim"
              ? "border-accent/30 mr-12"
              : "border-brand-neutral/40 ml-12"
          )}
        >
          <span className="font-mono text-xs text-brand-night-navy/50 w-10 tabular-nums">
            {e.minute !== null ? `${e.minute}'` : "—"}
          </span>
          <span className="text-xl">{eventEmoji(e.type, e.subtype)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-brand-night-navy truncate">
              {eventLabel(e.type, e.subtype)}
            </div>
            {e.playerName && (
              <div className="text-xs text-brand-night-navy/60 truncate">{e.playerName}</div>
            )}
          </div>
          {e.source === "manual" && (
            <span className="text-[0.6rem] uppercase tracking-widest font-bold text-accent-dark bg-accent/10 px-1.5 py-0.5 rounded">
              Manual
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
