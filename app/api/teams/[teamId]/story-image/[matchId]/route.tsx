import { ImageResponse } from "next/og";
import { requireUser } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { buildStoryModel } from "@/lib/story/story-data";
import { StoryCard, STORY_SIZE } from "@/lib/story/story-card";

// DB-Zugriff (postgres-js) → Node-Runtime, NICHT edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Story-Motiv (1080×1920) für ein Spiel der Mannschaft — Vorschau oder
 * Rückblick, je nach Spielstatus (Aufgabe #44).
 *
 * Auth-gated wie das Wrapped-Bild: Mannschafts-/Spielernamen und hochgeladene
 * Logos sind keine öffentlichen Daten. Der Nutzer teilt die fertige PNG selbst
 * — die Route ist keine öffentliche og:image-Quelle.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; matchId: string }> }
) {
  const { teamId, matchId } = await params;

  const user = await requireUser();
  const access = await resolveTeamAccess(user.id, teamId, "viewer");
  if (!access.granted) return new Response("Forbidden", { status: 403 });

  // matchId ist client-kontrolliert → buildStoryModel filtert intern auf die
  // teamId und liefert null für fremde Spiele (kein Cross-Tenant-Rendering).
  const model = await buildStoryModel(teamId, matchId);
  if (!model) return new Response("Not found", { status: 404 });

  return new ImageResponse(<StoryCard model={model} />, STORY_SIZE);
}
