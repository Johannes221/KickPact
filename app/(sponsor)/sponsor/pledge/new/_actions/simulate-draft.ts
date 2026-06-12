"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import {
  TRIGGER_TYPES,
  CAP_PERIODS,
  normalizeTriggerParams
} from "@/lib/validations/pledge";
import { prevSaisonCode, saisonLabel } from "@/lib/utils/saison";
import { simulateForTeamSeason } from "@/lib/db/queries/simulation";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SimulationResult } from "@/lib/simulation/pact-simulation";

/**
 * W3 (Saison-Features 2026-06-12) — „Rückblick"-Simulation im Pact-Builder.
 *
 * Zugangs-Gate identisch zum Builder selbst (createPledge): der Aufrufer muss
 * eingeloggt sein UND einen GÜLTIGEN Einladungs-Token besitzen — die teamId
 * kommt ausschließlich aus der Einladung, nie vom Client. Damit gibt die
 * Action nichts preis, was der Builder (öffentliches Profil + Invite) nicht
 * ohnehin zeigt: aggregierte Vorsaison-Zahlen der eingeladenen Mannschaft.
 *
 * Bewusst LENIENT validiert (keine Pflicht-Params wie in createPledge):
 * eine halb ausgefüllte Spieler-Regel feuert in der Engine schlicht nicht,
 * statt die ganze Vorschau zu blockieren.
 */
const simulateInputSchema = z.object({
  invitationToken: z.string().min(1),
  rules: z
    .array(
      z.object({
        triggerType: z.enum(TRIGGER_TYPES),
        amountEur: z.number().min(0.5).max(500),
        capEur: z.number().positive().max(100000).optional(),
        capPeriod: z.enum(CAP_PERIODS).optional(),
        params: z.record(z.unknown()).default({})
      })
    )
    .min(1)
    .max(30),
  monthlyCapEur: z.number().positive().optional()
});

export type SimulateDraftInput = z.input<typeof simulateInputSchema>;

export type SimulateDraftResult =
  | {
      ok: true;
      result: SimulationResult;
      /** Vorsaison-Code ("2526") + UI-Label ("25/26"). */
      prevSaison: string;
      prevSaisonLabel: string;
    }
  | { ok: false; message: string };

export async function simulateDraftRules(
  input: SimulateDraftInput
): Promise<SimulateDraftResult> {
  await requireUser();

  const parsed = simulateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Ungültige Regel-Daten für die Vorschau." };
  }

  // Gate wie createPledge: Token muss auf eine pending Sponsor-Einladung mit
  // Mannschaft zeigen (abgelaufene/benutzte/zurückgezogene fallen schon im
  // Query-Filter raus).
  const invitation = await findInvitationByToken(parsed.data.invitationToken);
  if (!invitation?.teamId) {
    return { ok: false, message: "Einladung nicht gefunden oder abgelaufen." };
  }

  const [team] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, invitation.teamId))
    .limit(1);
  if (!team) {
    return { ok: false, message: "Mannschaft zur Einladung nicht gefunden." };
  }

  const prevSaison = prevSaisonCode(team.saison);
  if (!prevSaison) {
    return { ok: false, message: "Keine Vorsaison für diese Mannschaft." };
  }

  const monthlyCapCents =
    parsed.data.monthlyCapEur !== undefined
      ? Math.round(parsed.data.monthlyCapEur * 100)
      : null;

  const result = await simulateForTeamSeason(
    invitation.teamId,
    prevSaison,
    parsed.data.rules.map((r, i) => ({
      id: `draft_${i}`,
      pledgeId: "draft",
      triggerType: r.triggerType,
      triggerParams: normalizeTriggerParams(r.params),
      amountCents: Math.round(r.amountEur * 100),
      capCents: r.capEur !== undefined ? Math.round(r.capEur * 100) : null,
      capPeriod: r.capPeriod ?? null,
      monthlyCapCents
    }))
  );
  if (!result) {
    return { ok: false, message: "Vorschau aktuell nicht verfügbar." };
  }

  return {
    ok: true,
    result,
    prevSaison,
    prevSaisonLabel: saisonLabel(prevSaison)
  };
}
