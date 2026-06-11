/**
 * Deep-Link-Auswahl für den Ergebnis-Push (`notify-match-result`).
 *
 * Pure Helpers (kein DB-Import) — testbar in Vitest ohne Integration-DB.
 *
 * Hintergrund (Audit 2026-06-11 / Phase 4 / A1): Sponsoren wurden auf die
 * interne Vereins-Route `/verein/<slug>/mannschaft/<id>` gelinkt, deren Guard
 * Nicht-Mitglieder bounced — der Push war eine Sackgasse. Sponsoren bekommen
 * jetzt das öffentliche Mannschafts-Profil `/m/<publicSlug>` (Fallback:
 * `/sponsor`), Vereins-Mitglieder behalten den internen Link.
 */

export interface MatchResultLinkGroups {
  /** Vereins-Mitglieder + Club-Staff → interner Team-Link (null ohne Club-Slug). */
  members: { userIds: string[]; link: string | null };
  /** Reine Sponsoren (keine Mitglieder) → öffentliches Profil bzw. /sponsor. */
  sponsors: { userIds: string[]; link: string };
}

function uniq(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function buildMatchResultLinkGroups(input: {
  memberUserIds: string[];
  sponsorUserIds: string[];
  teamId: string;
  clubSlug: string | null;
  publicSlug: string | null;
}): MatchResultLinkGroups {
  const members = uniq(input.memberUserIds);
  const memberSet = new Set(members);
  // Wer Mitglied UND Sponsor ist, bekommt den internen Link (Guard lässt ihn
  // durch) — nie doppelt benachrichtigen.
  const sponsorsOnly = uniq(input.sponsorUserIds).filter((id) => !memberSet.has(id));

  return {
    members: {
      userIds: members,
      link: input.clubSlug
        ? `/verein/${input.clubSlug}/mannschaft/${input.teamId}`
        : null
    },
    sponsors: {
      userIds: sponsorsOnly,
      link: input.publicSlug ? `/m/${input.publicSlug}` : "/sponsor"
    }
  };
}
