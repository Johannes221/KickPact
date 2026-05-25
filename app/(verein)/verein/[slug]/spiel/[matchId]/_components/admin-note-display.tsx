/**
 * Plan 3 Teil 2 — Read-Only Display für `matches.adminNote`.
 *
 * Server-Component (kein "use client") — nur Rendering. Parst das JSON,
 * fällt elegant auf "keine Korrekturen" zurück bei leerem/kaputtem Wert.
 */

type AdminNoteEntry = {
  kind: string;
  at: string;
  byUserId: string;
  reason?: string;
  snapshot?: Record<string, unknown>;
};

function parseAdminNote(raw: string | null): AdminNoteEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (e): e is AdminNoteEntry =>
          typeof e === "object" && e !== null && typeof (e as { kind?: unknown }).kind === "string"
      );
    }
  } catch {
    return [];
  }
  return [];
}

const KIND_LABELS: Record<string, string> = {
  "event-edited": "Event bearbeitet",
  "event-deleted": "Event gelöscht",
  "result-override": "Ergebnis korrigiert"
};

const KIND_EMOJI: Record<string, string> = {
  "event-edited": "✏️",
  "event-deleted": "🗑️",
  "result-override": "⚖️"
};

function formatSnapshot(entry: AdminNoteEntry): string {
  const snap = entry.snapshot;
  if (!snap) return "";
  if (entry.kind === "result-override") {
    const h = (snap as Record<string, unknown>).ergebnisHeim;
    const g = (snap as Record<string, unknown>).ergebnisGast;
    return `Vorher: ${h ?? "—"} : ${g ?? "—"}`;
  }
  if (entry.kind === "event-edited" || entry.kind === "event-deleted") {
    const minute = (snap as Record<string, unknown>).minute;
    const playerName = (snap as Record<string, unknown>).playerName;
    const type = (snap as Record<string, unknown>).type;
    return `${type}${minute !== null && minute !== undefined ? ` · ${minute}'` : ""}${
      playerName ? ` · ${playerName}` : ""
    }`;
  }
  return "";
}

export function AdminNoteDisplay({ adminNote }: { adminNote: string | null }) {
  const entries = parseAdminNote(adminNote);
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
          Admin-Korrekturen
        </h2>
        <span className="text-xs text-brand-night-navy/50">
          {entries.length} Eintrag{entries.length === 1 ? "" : "e"}
        </span>
      </div>
      <ol className="space-y-2">
        {entries.map((e, i) => {
          const dt = new Date(e.at);
          const dtStr = isNaN(dt.getTime())
            ? e.at
            : dt.toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });
          return (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
            >
              <span className="text-lg shrink-0">{KIND_EMOJI[e.kind] ?? "📝"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-brand-night-navy">
                  {KIND_LABELS[e.kind] ?? e.kind}
                </div>
                <div className="text-xs text-brand-night-navy/60 mt-0.5">
                  {dtStr}
                  {formatSnapshot(e) && (
                    <>
                      <span className="mx-1.5">·</span>
                      {formatSnapshot(e)}
                    </>
                  )}
                </div>
                {e.reason && (
                  <div className="text-xs text-brand-night-navy/70 mt-1 italic">
                    „{e.reason}"
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
