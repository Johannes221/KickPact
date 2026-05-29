"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";
import {
  searchVereineAction,
  getMannschaftenAction,
  type MannschaftWithStatus
} from "../verein/_actions/search";
import { createDraftClub } from "../_actions/create-draft-club";

/**
 * Erkennt den „Server Action … was not found on the server"-Fehler. Tritt auf,
 * wenn der Browser-Tab noch altes Client-JS hält, nachdem ein Deploy die
 * (gehashten) Server-Action-IDs geändert hat. Kein echter Bug — der Tab ist
 * schlicht veraltet.
 */
function isStaleServerAction(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message || "";
  return (
    e.name === "UnrecognizedActionError" ||
    /server action.*was not found/i.test(m) ||
    /failed-to-find-server-action/i.test(m)
  );
}

/**
 * Recovery für den Stale-Action-Fehler: einmal pro Tab automatisch neu laden
 * (holt frisches Client-JS mit den korrekten Action-IDs). Der sessionStorage-
 * Guard verhindert eine Reload-Schleife, falls der Server tatsächlich kaputt ist.
 */
function reloadForStaleAction(): void {
  try {
    if (sessionStorage.getItem("kp_stale_action_reloaded") === "1") {
      toast.error("Neue Version verfügbar — bitte die Seite manuell neu laden (Cmd/Strg+R).");
      return;
    }
    sessionStorage.setItem("kp_stale_action_reloaded", "1");
  } catch {
    /* sessionStorage evtl. nicht verfügbar — dann eben direkt neu laden. */
  }
  toast.message("Neue Version verfügbar — Seite wird aktualisiert…");
  window.location.reload();
}

type VereinHit = {
  name: string;
  ort: string | null;
  slug: string;
  vereinId: string;
  url: string;
};

interface Props {
  role: "mannschaft" | "verein";
}

/**
 * Step 1: Verein suchen, Mannschaft(en) auswählen, Draft anlegen.
 *
 *  - role=mannschaft → Radio-Select für genau EINE Mannschaft → erzeugt
 *    Club mit plan='pro' Trial.
 *  - role=verein → Multi-Checkbox für mehrere Mannschaften (min. 1) →
 *    erzeugt Club mit plan='verein' Trial, eine Team-License pro Team.
 *
 * Bei Erfolg wird der Draft in der DB committed (siehe create-draft-club.ts)
 * und der User landet auf Step 2 (`/onboarding/{role}/stammdaten`).
 */
export function VereinSearchStep({ role }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VereinHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [chosenVerein, setChosenVerein] = useState<VereinHit | null>(null);
  const [teams, setTeams] = useState<MannschaftWithStatus[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function handleSearch() {
    if (query.length < 2) {
      toast.error("Bitte mindestens 2 Zeichen eingeben");
      return;
    }
    startTransition(async () => {
      try {
        const res = await searchVereineAction({ query });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setResults(res.results);
        setSearched(true);
        if (res.results.length === 0) toast.info("Keine Treffer. Anderer Suchbegriff?");
      } catch (e) {
        if (isStaleServerAction(e)) return reloadForStaleAction();
        toast.error(e instanceof Error ? e.message : "Suche fehlgeschlagen.");
      }
    });
  }

  async function pickVerein(v: VereinHit) {
    setChosenVerein(v);
    setSelectedTeamIds(new Set());
    setTeams([]);
    setTeamsLoading(true);
    try {
      const res = await getMannschaftenAction({
        vereinId: v.vereinId,
        slug: v.slug,
        vereinName: v.name
      });
      if (!res.ok) {
        toast.error(res.error);
        setChosenVerein(null);
        return;
      }
      setTeams(res.results);
      if (res.results.length === 0) toast.info("Keine Mannschaften gefunden.");
      track("verein_onboarding_step1_completed");
    } catch (e) {
      setChosenVerein(null);
      if (isStaleServerAction(e)) return reloadForStaleAction();
      toast.error(e instanceof Error ? e.message : "Mannschaften konnten nicht geladen werden.");
    } finally {
      // IMMER zurücksetzen — sonst hängt der „Lade Mannschaften…"-Spinner ewig,
      // wenn die Action (z.B. stale nach Deploy) wirft.
      setTeamsLoading(false);
    }
  }

  function toggleTeam(teamId: string) {
    // Belegte (fremd betreute) Mannschaften sind nicht wählbar.
    if (teams.find((t) => t.teamId === teamId)?.isLocked) return;
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (role === "mannschaft") {
        next.clear();
        next.add(teamId);
      } else if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!chosenVerein) return;
    if (selectedTeamIds.size === 0) {
      toast.error(
        role === "mannschaft"
          ? "Bitte eine Mannschaft auswählen"
          : "Bitte mindestens eine Mannschaft auswählen"
      );
      return;
    }
    const picked = teams.filter((t) => selectedTeamIds.has(t.teamId));
    startTransition(async () => {
      try {
        const input =
          role === "mannschaft"
            ? {
                role: "mannschaft" as const,
                verein: { vereinId: chosenVerein.vereinId, name: chosenVerein.name },
                team: {
                  teamId: picked[0].teamId,
                  teamSlug: picked[0].slug,
                  teamName: picked[0].name,
                  saison: picked[0].saison
                }
              }
            : {
                role: "verein" as const,
                verein: { vereinId: chosenVerein.vereinId, name: chosenVerein.name },
                teams: picked.map((t) => ({
                  teamId: t.teamId,
                  teamSlug: t.slug,
                  teamName: t.name,
                  saison: t.saison
                }))
              };
        await createDraftClub(input);
        track("verein_onboarding_step2_completed", { role, teamCount: picked.length });
        router.push(`/onboarding/${role}/stammdaten`);
      } catch (e) {
        // Session-Verlust während der Server-Action (Better-Auth Cookie
        // intermittierend nicht sichtbar SSR-side) — hard reload zwingt
        // Browser zur frischen Cookie-Auswertung, dann redirect zu /login.
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          toast.error("Session abgelaufen — bitte neu einloggen.");
          window.location.href = "/login";
          return;
        }
        if (isStaleServerAction(e)) return reloadForStaleAction();
        const msg = e instanceof Error ? e.message : "Verein konnte nicht angelegt werden.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Suche */}
      <div className="space-y-2">
        <Label htmlFor="search" className="text-sm font-semibold text-brand-night-navy">
          Vereinssuche (z.B. Stadtname oder Vereinsname)
        </Label>
        <div className="flex gap-2">
          <Input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="z.B. FC Heidelberg"
            disabled={pending || teamsLoading}
          />
          <Button
            onClick={handleSearch}
            disabled={pending || teamsLoading}
            variant="accent"
            size="lg"
          >
            {pending ? "Suche..." : "Suchen"}
          </Button>
        </div>
      </div>

      {/* Such-Ergebnisse */}
      {!chosenVerein && searched && (
        <div className="rounded-lg border border-brand-neutral/40 bg-white overflow-hidden">
          {results.length === 0 ? (
            <p className="p-6 text-sm text-brand-night-navy/60">
              Keine Treffer. Versuche einen anderen Suchbegriff.
            </p>
          ) : (
            <ul className="divide-y divide-brand-neutral/40">
              {results.map((v) => (
                <li key={v.vereinId}>
                  <button
                    type="button"
                    onClick={() => pickVerein(v)}
                    disabled={pending}
                    className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/5 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-brand-night-navy">{v.name}</div>
                      {v.ort && <div className="text-xs text-brand-night-navy/40 mt-0.5">{v.ort}</div>}
                    </div>
                    <span className="text-accent text-xl">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Verein gewählt → Mannschafts-Liste */}
      {chosenVerein && (
        <div className="space-y-6">
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
                Gewählter Verein
              </div>
              <div className="mt-1 font-display font-black text-xl tracking-tight text-brand-night-navy">
                {chosenVerein.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setChosenVerein(null);
                setSelectedTeamIds(new Set());
                setTeams([]);
              }}
              className="text-xs font-semibold text-brand-night-navy/60 hover:text-brand-night-navy underline"
            >
              Anderen Verein wählen
            </button>
          </div>

          <div>
            <Label className="text-sm font-semibold text-brand-night-navy">
              {role === "mannschaft"
                ? "Welche Mannschaft willst du sponsoring-fähig machen?"
                : "Welche Mannschaften willst du einbinden? (du kannst später jederzeit weitere hinzufügen)"}
            </Label>
            {teamsLoading ? (
              <div className="mt-3 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60 animate-pulse">
                Lade Mannschaften…
              </div>
            ) : teams.length === 0 ? (
              <div className="mt-3 rounded-lg border border-brand-neutral/40 bg-white p-4 text-sm text-brand-night-navy/60">
                Keine Mannschaften gefunden.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {teams.map((t) => {
                  // Belegt durch jemand anderen → nicht wählbar, „Zugriff anfragen".
                  if (t.isLocked) {
                    return (
                      <li key={t.teamId}>
                        <Link
                          href={`/onboarding/zugriff-anfragen?clubSlug=${encodeURIComponent(t.registeredClubSlug ?? "")}`}
                          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 transition-colors hover:bg-amber-50"
                        >
                          <span className="text-amber-600 text-lg" aria-hidden>🔒</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-brand-night-navy">{t.name}</span>
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-amber-800">
                                bereits registriert
                              </span>
                            </div>
                            <div className="text-xs text-brand-night-navy/40 mt-0.5">Saison {t.saison}</div>
                          </div>
                          <span className="text-amber-700 text-sm font-semibold whitespace-nowrap">
                            Zugriff anfragen →
                          </span>
                        </Link>
                      </li>
                    );
                  }

                  const checked = selectedTeamIds.has(t.teamId);
                  return (
                    <li key={t.teamId}>
                      <label
                        className={
                          "flex items-center gap-3 rounded-lg border bg-white p-4 cursor-pointer transition-colors " +
                          (checked
                            ? "border-accent bg-accent/5"
                            : "border-brand-neutral/40 hover:border-accent/40")
                        }
                      >
                        <input
                          type={role === "mannschaft" ? "radio" : "checkbox"}
                          name="team"
                          checked={checked}
                          onChange={() => toggleTeam(t.teamId)}
                          className="h-4 w-4 accent-accent"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-brand-night-navy">{t.name}</span>
                            {t.ownedByMe && (
                              <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-accent-dark">
                                von dir
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-brand-night-navy/40 mt-0.5">Saison {t.saison}</div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {role === "verein" && selectedTeamIds.size > 0 && (
              <p className="mt-2 text-xs text-brand-night-navy/60">
                {selectedTeamIds.size} Mannschaft{selectedTeamIds.size === 1 ? "" : "en"} ausgewählt
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="accent"
              size="lg"
              onClick={handleSubmit}
              disabled={pending || selectedTeamIds.size === 0}
            >
              {pending
                ? role === "mannschaft" ? "Lege Mannschaft an…" : "Lege Verein an…"
                : role === "mannschaft" ? "Mannschaft anlegen →" : "Verein anlegen →"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
