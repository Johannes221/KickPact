import { getOpponentLogoUrl } from "@/lib/db/queries/story";
import { readDocumentBytes, imageMime } from "@/lib/storage/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Öffentlicher, gecachter Vereinswappen-Bild-Endpoint für die Match-Listen und
 * -Karten. Auflösung `?team=<fussballdeTeamId>` bevorzugt (hochgeladenes/
 * gescraptes Logo), sonst `?name=<vereinsname>` — beides über den geteilten
 * Resolver `getOpponentLogoUrl` (teams.logoUrl → Crest-Cache-per-id →
 * Crest-Cache-per-Name), damit Listen-Wappen und Story-Vorschau exakt dieselbe
 * Quelle nutzen.
 *
 * KEINE Auth: Vereinswappen sind öffentliche fussball.de-Logos, keine sensiblen
 * Daten (anders als story-image, das Namen + Beträge trägt). Die Response
 * enthält NUR die Bild-Bytes. 404 (leere Response) bei fehlendem/nicht
 * einbettbarem Wappen → `TeamCrest` fällt sauber auf den Platzhalter zurück.
 *
 * Aggressiver Cache: Wappen ändern sich fast nie, eine Match-Liste lädt aber
 * viele davon — CDN/Browser-Cache spart die R2-Roundtrips.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team");
  const name = searchParams.get("name");
  if (!team && !name) return new Response(null, { status: 404 });

  const logoUrl = await getOpponentLogoUrl(team, name);
  if (!logoUrl) return new Response(null, { status: 404 });

  const bytes = await readDocumentBytes(logoUrl);
  if (!bytes) return new Response(null, { status: 404 });

  const mime = imageMime(bytes);
  if (!mime) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
    }
  });
}
