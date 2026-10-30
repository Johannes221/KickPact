"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getClubById } from "@/lib/db/queries/club-admin";
import { sendRequesterMail } from "@/lib/mail/access-request-mail";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

const approveSchema = z.object({ requestId: z.string().min(1), clubSlug: z.string().min(1) });
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function approveRequestAction(input: { requestId: string; clubSlug: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }
  // Cross-Tenant-Guard: requestedTeamId ist client-kontrolliert. Team muss zum
  // Verein der Anfrage gehören, sonst würde ein Fremd-Request Team-Admin auf ein
  // Team eines anderen Vereins erschleichen (Confused Deputy). Fail closed.
  if (req.requestedTeamId && !(await getTeamInClub(req.requestedTeamId, club.id))) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  // Mail läuft als beforeCommit: schlägt der Versand fehl, bleibt der Request
  // "pending" (kein stiller "freigegeben, aber nie benachrichtigt"-Verlust) und
  // ist per erneutem Klick sauber wiederholbar.
  try {
    await approveRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      beforeCommit: () =>
        sendRequesterMail(req.userId, () => {
          const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
          const homeUrl = req.requestedTeamId
            ? `${base}/verein/${club.slug}/mannschaft/${req.requestedTeamId}`
            : `${base}/verein/${club.slug}`;
          const scopeLabel = req.requestedTeamId
            ? "Mannschafts-Zugriff"
            : "Vereins-Zugriff";
          return accessRequestApprovedEmail({
            clubName: club.name,
            requestedRole: req.requestedRole,
            scopeLabel,
            homeUrl
          });
        })
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("request not pending")) {
      return { ok: false as const, error: "Anfrage wurde bereits bearbeitet." };
    }
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}

export async function rejectRequestAction(input: { requestId: string; clubSlug: string; reason?: string }) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  try {
    await rejectRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      reason: parsed.data.reason,
      beforeCommit: async () => {
        const clubRow = await getClubById(req.clubId);
        await sendRequesterMail(req.userId, () =>
          accessRequestRejectedEmail({
            clubName: clubRow?.name ?? club.name,
            reason: parsed.data.reason ?? null
          })
        );
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("request not pending")) {
      return { ok: false as const, error: "Anfrage wurde bereits bearbeitet." };
    }
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}
