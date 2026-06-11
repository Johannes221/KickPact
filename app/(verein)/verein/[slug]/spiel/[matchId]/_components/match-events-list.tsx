import { cn } from "@/lib/utils";
import type { MatchChargeRow } from "@/lib/db/queries/matches";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { specialGoalSubtypeLabel } from "@/lib/triggers/special-goals";
import { MatchEventIcon } from "@/components/shared/match-event-icon";
import { EventRowActions } from "./event-row-actions";
import { eur } from "@/lib/utils/currency";

type MatchEvent = {
  id: string;
  minute: number | null;
  type: "tor" | "auswechslung" | "spezial" | "karte";
  subtype: string | null;
  side: "heim" | "gast";
  playerName: string | null;
  source: "scraped" | "manual";
};

function eventLabel(type: MatchEvent["type"], subtype: string | null): string {
  if (type === "tor") return "Tor";
  if (type === "auswechslung") return "Auswechslung";
  if (type === "karte") return subtype === "rot" ? "Rote Karte" : "Gelbe Karte";
  // B3 (Audit 2026-06-11): Label aus der single source of truth — inkl.
  // Lesbarkeits-Fallback für Alt-Subtypen aus Bestands-Events.
  if (type === "spezial") return specialGoalSubtypeLabel(subtype);
  return type;
}

export function MatchEventsList({
  events,
  chargesByEvent = [],
  canEdit = false
}: {
  events: MatchEvent[];
  chargesByEvent?: MatchChargeRow[];
  /**
   * Wenn true werden pro Event Edit + Delete-Buttons gerendert. Nur an die
   * Komponente weitergeben wenn der User mindestens Trainer-Rolle hat
   * (Server-Page entscheidet — siehe page.tsx).
   */
  canEdit?: boolean;
}) {
  // Build a lookup: matchEventId → charges
  const eventChargeMap = new Map<string, MatchChargeRow[]>();
  for (const c of chargesByEvent) {
    if (!c.matchEventId) continue;
    const existing = eventChargeMap.get(c.matchEventId) ?? [];
    existing.push(c);
    eventChargeMap.set(c.matchEventId, existing);
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60 text-center">
        Noch keine Events erfasst.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((e) => {
        const eventCharges = eventChargeMap.get(e.id) ?? [];
        const eventTotal = eventCharges.reduce((s, c) => s + c.amountCents, 0);

        return (
          <li key={e.id}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-white px-3 py-2",
                e.side === "heim"
                  ? "border-accent/30 mr-8 md:mr-16"
                  : "border-brand-neutral/40 ml-8 md:ml-16"
              )}
            >
              <span className="font-mono text-xs text-brand-night-navy/50 w-10 tabular-nums shrink-0">
                {e.minute !== null ? `${e.minute}'` : "—"}
              </span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-off-white">
                <MatchEventIcon type={e.type} subtype={e.subtype} className="h-[1.1rem] w-[1.1rem]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-brand-night-navy truncate">
                  {eventLabel(e.type, e.subtype)}
                  {e.playerName && (
                    <span className="font-normal text-brand-night-navy/60"> · {e.playerName}</span>
                  )}
                </div>
                {/* Charges die durch dieses Event ausgelöst wurden */}
                {eventCharges.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {eventCharges.map((c) => {
                      const meta = (
                        TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>
                      )[c.triggerType];
                      return (
                        <span
                          key={c.chargeId}
                          className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent-dark px-1.5 py-0.5 text-[0.6rem] font-semibold"
                        >
                          {meta?.emoji ?? "💚"} {c.sponsorDisplayName} +{eur(c.amountCents)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {eventTotal > 0 && (
                  <span className="font-mono tabular-nums text-xs font-semibold text-accent">
                    +{eur(eventTotal)}
                  </span>
                )}
                {e.source === "manual" && (
                  <span className="text-[0.6rem] uppercase tracking-widest font-bold text-accent-dark bg-accent/10 px-1.5 py-0.5 rounded">
                    Manuell
                  </span>
                )}
                {canEdit && (
                  <EventRowActions
                    eventId={e.id}
                    initial={{
                      minute: e.minute,
                      type: e.type,
                      subtype: e.subtype,
                      playerName: e.playerName
                    }}
                  />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
