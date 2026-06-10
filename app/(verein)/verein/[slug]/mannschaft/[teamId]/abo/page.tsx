import { assertTeamPageAccess } from "@/lib/auth/scope";
import { isNativeAppRequest } from "@/lib/platform/native-server";
import { AboPanel } from "../../../abo/_components/abo-panel";

export const metadata = { title: "Abo · KickPact" };

/**
 * Mannschafts-Abo. Rendert dieselbe Abo-Verwaltung wie die Vereins-Seite,
 * aber im Mannschafts-Kontext (TeamSubNav, kein Vereins-Header) — der primäre
 * Kontext für basic/pro-Lizenzen. Die Subscription selbst lebt auf Club-Ebene,
 * deshalb arbeitet das Panel mit der clubId der Mannschaft.
 *
 * Trainer-Level reicht: der Team-Trainer verwaltet das Abo seiner Mannschaft.
 */
export default async function TeamAboPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "admin");
  const nativeApp = await isNativeAppRequest();
  return <AboPanel clubId={club.id} clubSlug={slug} nativeApp={nativeApp} />;
}
