import { z } from "zod";

/**
 * @deprecated pledgeProxy / Eltern-Proxy-Feature ist deprecated (Migration 0027).
 * Code bleibt als Reference — wird nicht mehr in der App verwendet.
 *
 * export const pledgeProxySchema = z.object({ name, sharePercent, note? });
 * export const pledgeProxiesSchema = z.array(pledgeProxySchema).refine(...);
 * export type PledgeProxy = z.infer<typeof pledgeProxySchema>;
 */

/**
 * Beziehungs-Rollen für Privat-Sponsoren (type=familie). Grobe Kategorie; das
 * freie `description`-Feld liefert den Kontext ("Papa von Tim").
 */
export const SPONSOR_ROLES = [
  { value: "verwandt", label: "Familie / Verwandt" },
  { value: "freund", label: "Freund" },
  { value: "bekannter", label: "Bekannter" },
  { value: "fan", label: "Fan / Unterstützer" },
  { value: "sonstiges", label: "Sonstiges" }
] as const;

export const SPONSOR_ROLE_VALUES = SPONSOR_ROLES.map((r) => r.value);

export function sponsorRoleLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SPONSOR_ROLES.find((r) => r.value === value)?.label ?? value;
}

const baseSchema = z.object({
  displayName: z.string().min(2, "Name fehlt")
});

/** Rolle + Beschreibung für Privat-Sponsoren — beide optional. */
const privateRelationFields = {
  role: z.string().max(40).optional().or(z.literal("")),
  description: z.string().max(200, "Max. 200 Zeichen").optional().or(z.literal(""))
};

/**
 * Privatpersonen-only (Spec 2026-07-06): KickPact-Sponsoren sind ausschließlich
 * Privatpersonen (Familie, Freunde, Fans). Das frühere sponsorBusinessSchema
 * (Firmenname, Rechnungsadresse, USt-ID) wurde ersatzlos entfernt — der
 * DB-Enum-Wert 'business' bleibt inert bestehen (siehe lib/db/schema/sponsors.ts,
 * Muster: inerter 'annual'-Billing-Cycle). `type` bleibt als Literal im Schema,
 * damit bestehende Aufrufer/Analytics weiter einen Typ sehen.
 */
export const sponsorFamilieSchema = baseSchema.extend({
  type: z.literal("familie"),
  ...privateRelationFields
});

export const sponsorOnboardingSchema = sponsorFamilieSchema;

export type SponsorOnboardingInput = z.infer<typeof sponsorOnboardingSchema>;

/**
 * Defensives Lesen von sponsors.type: Alt-/Fremdwerte (inertes 'business')
 * werden auf "familie" normalisiert — Pendant zu normalizeBillingCycle für
 * den inerten 'annual'-Cycle. Kein Code-Pfad ERZEUGT mehr 'business'.
 */
export function normalizeSponsorType(raw: string | null | undefined): "familie" {
  void raw;
  return "familie";
}
