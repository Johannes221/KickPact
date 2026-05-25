"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  teamLicenses,
  subscriptions,
  players,
  clubMemberships,
  users
} from "@/lib/db/schema";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { storeDocument } from "@/lib/storage/documents";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import {
  signOptOutToken,
  verifyOptOutToken,
  type OptOutTokenPayload
} from "@/lib/auth/opt-out-token";

/**
 * Plan 3 Teil 1 — Mannschafts-Lifecycle Server Actions.
 *
 * Public surface:
 *   - createTeamForExistingClub   → Verein hat schon Account und legt
 *                                    ein zusätzliches Team an.
 *   - renameTeam                  → Stammdaten-Korrektur.
 *   - deactivateTeam / reactivateTeam → Soft-Disable.
 *   - uploadTeamLogo              → Logo-Upload via lib/storage/documents.
 *   - togglePlayerBlock           → DSGVO-Opt-out (Roster-UI).
 *   - generatePlayerOptOutLink    → Admin generiert Self-Service-Link.
 *   - confirmPlayerOptOut         → Public-Opt-out confirm (kein Login nötig).
 *
 * Permissions:
 *   - createTeamForExistingClub / renameTeam / deactivate / reactivate /
 *     uploadLogo / generatePlayerOptOutLink: "admin"
 *   - togglePlayerBlock: "trainer"
 *   - confirmPlayerOptOut: signed-token, kein Login
 *
 * Notifications:
 *   - deactivateTeam / togglePlayerBlock / confirmPlayerOptOut senden Mail
 *     an alle Club-Admins. Mail-Fehler werden geloggt, nicht propagiert.
 */

// ───────────────────────── Helpers ──────────────────────────

async function getClubAdminEmails(clubId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(
      and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin"))
    );
  return rows.map((r) => r.email);
}

async function sendAdminMail(
  clubId: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  const to = await getClubAdminEmails(clubId);
  if (to.length === 0) return;
  try {
    await resend.emails.send({ from: MAIL_FROM, to, subject, text, html });
  } catch (err) {
    console.error("[team-lifecycle] admin-mail failed", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ───────────────────── createTeamForExistingClub ─────────────────────

const createTeamSchema = z.object({
  clubSlug: z.string().min(1),
  team: z.object({
    teamId: z.string().min(1),
    teamSlug: z.string().min(1),
    teamName: z.string().min(1).max(80),
    saison: z.string().min(4)
  }),
  /**
   * Explizit gewählter Plan für das neue Team. Wenn Club bereits eine
   * Vereinslizenz hat, wird `verein` erzwungen (Auto-Bündelung).
   */
  plan: z.enum(["basic", "pro", "verein"]).optional()
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export async function createTeamForExistingClub(
  input: CreateTeamInput
): Promise<{ teamId: string }> {
  const parsed = createTeamSchema.parse(input);
  const { club } = await assertClubWriteAccess(parsed.clubSlug, "admin");

  // Subscription muss existieren (Onboarding legt eine Trial-Sub an).
  const [sub] = await db
    .select({ clubId: subscriptions.clubId })
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);
  if (!sub) {
    throw new Error("Keine Subscription für diesen Verein gefunden.");
  }

  // Vereinslizenz-Detection: wenn irgendeine Team-License des Clubs `verein`
  // ist, wird das neue Team auto-gebündelt unter dieser Master-License.
  const existingLicenses = await db
    .select({
      id: teamLicenses.id,
      plan: teamLicenses.plan
    })
    .from(teamLicenses)
    .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
    .where(eq(teams.clubId, club.id));

  const vereinLicense = existingLicenses.find((l) => l.plan === "verein");
  const hasVereinPlan = !!vereinLicense;

  // Plan-Auflösung: Vereinslizenz erzwingt `verein`, sonst User-Pick oder
  // `basic` als Safe-Default.
  const effectivePlan: "basic" | "pro" | "verein" = hasVereinPlan
    ? "verein"
    : (parsed.plan ?? "basic");

  // Duplicate-Check (DB-Unique-Index existiert, schöner Error vor Insert).
  const [existingTeam] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.fussballdeTeamId, parsed.team.teamId),
        eq(teams.saison, parsed.team.saison)
      )
    )
    .limit(1);
  if (existingTeam) {
    throw new Error(
      "Diese Mannschaft existiert bereits in KickPact für diese Saison."
    );
  }

  const teamId = await db.transaction(async (tx) => {
    const [insertedTeam] = await tx
      .insert(teams)
      .values({
        clubId: club.id,
        name: parsed.team.teamName,
        saison: parsed.team.saison,
        fussballdeTeamId: parsed.team.teamId,
        fussballdeSlug: parsed.team.teamSlug,
        isActive: true
      })
      .returning({ id: teams.id });

    await tx.insert(teamLicenses).values({
      subscriptionClubId: club.id,
      teamId: insertedTeam.id,
      plan: effectivePlan,
      stripeSubscriptionItemId: null,
      status: "trialing",
      parentClubLicenseId: hasVereinPlan ? vereinLicense!.id : null
    });

    return insertedTeam.id;
  });

  revalidatePath(`/verein/${parsed.clubSlug}`);
  revalidatePath(`/verein/${parsed.clubSlug}/mannschaften`);

  return { teamId };
}

// ───────────────────────── renameTeam ──────────────────────────

const renameSchema = z.object({
  teamId: z.string().min(1),
  newName: z.string().min(1).max(80)
});

export async function renameTeam(input: z.infer<typeof renameSchema>): Promise<void> {
  const parsed = renameSchema.parse(input);

  const [row] = await db
    .select({ team: teams, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, parsed.teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  await db
    .update(teams)
    .set({ name: parsed.newName })
    .where(eq(teams.id, parsed.teamId));

  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${parsed.teamId}`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${parsed.teamId}/einstellungen`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaften`);
}

// ─────────────────── deactivateTeam / reactivateTeam ───────────────────

export async function deactivateTeam(teamId: string): Promise<void> {
  const [row] = await db
    .select({ team: teams, clubSlug: clubs.slug, clubId: clubs.id })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  await db.update(teams).set({ isActive: false }).where(eq(teams.id, teamId));

  revalidatePath(`/verein/${row.clubSlug}`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaften`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${teamId}`);

  await sendAdminMail(
    row.clubId,
    `Mannschaft deaktiviert: ${row.team.name}`,
    `Hallo,

die Mannschaft "${row.team.name}" wurde im KickPact-Dashboard deaktiviert.

Was das bedeutet:
- Der Crawler überspringt diese Mannschaft.
- Neue Sponsoring-Pacts können nicht mehr abgeschlossen werden.
- Bestehende Pacts laufen automatisch zum Saisonende aus.

Falls das ein Versehen war, kannst du die Mannschaft im Dashboard
unter "Einstellungen" wieder aktivieren.

— KickPact`,
    `<p>Hallo,</p>
<p>die Mannschaft <strong>${escapeHtml(row.team.name)}</strong> wurde im KickPact-Dashboard deaktiviert.</p>
<p><strong>Was das bedeutet:</strong></p>
<ul>
  <li>Der Crawler überspringt diese Mannschaft.</li>
  <li>Neue Sponsoring-Pacts können nicht mehr abgeschlossen werden.</li>
  <li>Bestehende Pacts laufen automatisch zum Saisonende aus.</li>
</ul>
<p>Falls das ein Versehen war, kannst du die Mannschaft im Dashboard
unter "Einstellungen" wieder aktivieren.</p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
  );
}

export async function reactivateTeam(teamId: string): Promise<void> {
  const [row] = await db
    .select({ team: teams, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  await db.update(teams).set({ isActive: true }).where(eq(teams.id, teamId));

  revalidatePath(`/verein/${row.clubSlug}`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaften`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${teamId}`);
}

// ───────────────────────── uploadTeamLogo ──────────────────────────

const ALLOWED_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 1_000_000; // 1 MB

/**
 * Logo-Upload aus einer FormData (kommt aus `<form action={...}>` mit
 * Client-Wrapper, der die Buffer-Konvertierung macht). Pure Server-Action,
 * akzeptiert direkt `Buffer`.
 */
export async function uploadTeamLogo(input: {
  teamId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<{ logoUrl: string }> {
  if (!input.teamId || !input.filename || !input.contentType || !input.bytes) {
    throw new Error("Unvollständige Logo-Upload-Daten.");
  }
  if (!ALLOWED_LOGO_MIME.has(input.contentType)) {
    throw new Error("Nur PNG, JPEG oder WebP erlaubt.");
  }
  if (input.bytes.byteLength > MAX_LOGO_BYTES) {
    throw new Error("Logo zu groß (max. 1 MB).");
  }

  const [row] = await db
    .select({ team: teams, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, input.teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  const ext =
    input.contentType === "image/png"
      ? "png"
      : input.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const key = `teams/${input.teamId}/logo-${createId()}.${ext}`;
  const storageUrl = await storeDocument(key, input.bytes, input.contentType);

  await db
    .update(teams)
    .set({ logoUrl: storageUrl })
    .where(eq(teams.id, input.teamId));

  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${input.teamId}`);
  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${input.teamId}/einstellungen`);

  return { logoUrl: storageUrl };
}

/**
 * FormData-Wrapper für `uploadTeamLogo`. Wird direkt als `<form action>`
 * verwendet.
 */
export async function uploadTeamLogoFromForm(formData: FormData): Promise<void> {
  const teamId = formData.get("teamId");
  const file = formData.get("file");
  if (typeof teamId !== "string" || !teamId) throw new Error("teamId fehlt.");
  if (!(file instanceof File)) throw new Error("Datei fehlt.");
  if (file.size === 0) throw new Error("Datei ist leer.");

  const buf = Buffer.from(await file.arrayBuffer());
  await uploadTeamLogo({
    teamId,
    filename: file.name,
    contentType: file.type,
    bytes: buf
  });
}

// ───────────────────────── togglePlayerBlock ──────────────────────────

const togglePlayerBlockSchema = z.object({
  playerId: z.string().min(1),
  /** Explicit desired state. If omitted, flips current value. */
  desired: z.boolean().optional()
});

export async function togglePlayerBlock(
  input: z.infer<typeof togglePlayerBlockSchema>
): Promise<{ blocked: boolean }> {
  const parsed = togglePlayerBlockSchema.parse(input);

  const [row] = await db
    .select({
      player: players,
      teamName: teams.name,
      teamId: teams.id,
      clubSlug: clubs.slug,
      clubId: clubs.id
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(players.id, parsed.playerId))
    .limit(1);
  if (!row) throw new Error("Spieler nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "trainer");

  const next = parsed.desired ?? !row.player.blocked;

  await db
    .update(players)
    .set(
      next
        ? { blocked: true, name: "Anonymisiert" }
        : { blocked: false }
    )
    .where(eq(players.id, parsed.playerId));

  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${row.teamId}/spieler`);

  if (next) {
    await sendAdminMail(
      row.clubId,
      `Spieler anonymisiert in ${row.teamName}`,
      `Hallo,

ein Spieler der Mannschaft "${row.teamName}" wurde gerade auf Wunsch
(oder durch dich) anonymisiert. Der Name erscheint in KickPact
fortan als "Anonymisiert" und der Crawler ignoriert Updates dieses
Spielers.

— KickPact`,
      `<p>Hallo,</p>
<p>ein Spieler der Mannschaft <strong>${escapeHtml(row.teamName)}</strong> wurde gerade
auf Wunsch (oder durch dich) anonymisiert. Der Name erscheint in KickPact
fortan als „Anonymisiert" und der Crawler ignoriert Updates dieses Spielers.</p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
    );
  }

  return { blocked: next };
}

// ───────────────────── Player-Opt-out (public) ─────────────────────

export type OptOutLinkResult = {
  url: string;
  expiresAt: Date;
};

/**
 * Generiert einen signed Opt-out-Link für einen Spieler. Nutzt
 * BETTER_AUTH_SECRET. Token läuft 30 Tage. Nur Admins können Links
 * erzeugen — der Link selbst ist dann ohne Login einlösbar.
 */
export async function generatePlayerOptOutLink(
  playerId: string
): Promise<OptOutLinkResult> {
  const [row] = await db
    .select({ clubSlug: clubs.slug })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(players.id, playerId))
    .limit(1);
  if (!row) throw new Error("Spieler nicht gefunden.");

  await assertClubWriteAccess(row.clubSlug, "admin");

  const ttlSec = 30 * 24 * 60 * 60;
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = signOptOutToken({
    playerId,
    iat: issuedAt,
    exp: issuedAt + ttlSec
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
  const url = `${baseUrl.replace(/\/$/, "")}/spieler-opt-out?token=${encodeURIComponent(token)}`;

  return { url, expiresAt: new Date((issuedAt + ttlSec) * 1000) };
}

/**
 * Inspect-Action für die public Confirm-Page. Verifiziert Token und liefert
 * Spielername + Team-Kontext zurück. Fehler-Returns statt Throws, weil das
 * Result direkt in der UI angezeigt wird.
 */
export async function inspectPlayerOptOutToken(token: string): Promise<
  | {
      ok: true;
      playerName: string;
      teamName: string;
      clubName: string;
      alreadyBlocked: boolean;
    }
  | { ok: false; error: string }
> {
  let payload: OptOutTokenPayload;
  try {
    payload = verifyOptOutToken(token);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ungültiger Link."
    };
  }

  const [row] = await db
    .select({
      playerName: players.name,
      blocked: players.blocked,
      teamName: teams.name,
      clubName: clubs.name
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(players.id, payload.playerId))
    .limit(1);
  if (!row) return { ok: false, error: "Spieler nicht gefunden." };

  return {
    ok: true,
    playerName: row.playerName,
    teamName: row.teamName,
    clubName: row.clubName,
    alreadyBlocked: row.blocked
  };
}

/**
 * Confirm-Action für `/spieler-opt-out`. Verifiziert Token, setzt blocked=true,
 * anonymisiert den Namen und benachrichtigt die Club-Admins. Idempotent: ein
 * zweiter Confirm-Call für denselben Spieler wirft NICHT (Replay-Schutz ist
 * über die Idempotenz selbst gegeben — der Spieler ist bereits blocked und
 * keine Aktion findet statt; eine zweite Mail würde unterdrückt).
 */
export async function confirmPlayerOptOut(
  token: string
): Promise<{ ok: true; alreadyBlocked: boolean } | { ok: false; error: string }> {
  let payload: OptOutTokenPayload;
  try {
    payload = verifyOptOutToken(token);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ungültiger Link."
    };
  }

  const [row] = await db
    .select({
      player: players,
      teamName: teams.name,
      teamId: teams.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      clubId: clubs.id
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(players.id, payload.playerId))
    .limit(1);
  if (!row) return { ok: false, error: "Spieler nicht gefunden." };

  if (row.player.blocked) {
    // Replay/Doppelklick: Idempotent zurückgeben, KEINE zweite Mail.
    return { ok: true, alreadyBlocked: true };
  }

  await db
    .update(players)
    .set({ blocked: true, name: "Anonymisiert" })
    .where(eq(players.id, payload.playerId));

  revalidatePath(`/verein/${row.clubSlug}/mannschaft/${row.teamId}/spieler`);

  await sendAdminMail(
    row.clubId,
    `Spieler-Opt-out: Spieler aus ${row.teamName} hat sich anonymisiert`,
    `Hallo,

ein Spieler der Mannschaft "${row.teamName}" hat über den Self-Service-
Opt-out-Link seine Daten anonymisiert. Der Name erscheint fortan als
"Anonymisiert" und der Crawler ignoriert Updates dieses Spielers.

Bei Fragen oder wenn der Spieler später doch wieder aufgenommen werden
möchte, kontaktiert ihn direkt — KickPact speichert keine Kontaktdaten
der Spieler.

— KickPact`,
    `<p>Hallo,</p>
<p>ein Spieler der Mannschaft <strong>${escapeHtml(row.teamName)}</strong> hat über
den Self-Service-Opt-out-Link seine Daten anonymisiert. Der Name erscheint
fortan als „Anonymisiert" und der Crawler ignoriert Updates dieses Spielers.</p>
<p>Bei Fragen oder wenn der Spieler später doch wieder aufgenommen werden
möchte, kontaktiert ihn direkt — KickPact speichert keine Kontaktdaten
der Spieler.</p>
<p style="color:#999;font-size:12px;margin-top:24px">— KickPact</p>`
  );

  return { ok: true, alreadyBlocked: false };
}
