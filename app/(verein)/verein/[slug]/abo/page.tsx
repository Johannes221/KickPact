import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { isNativeAppRequest } from "@/lib/platform/native-server";
import { AboPanel } from "./_components/abo-panel";

export const metadata = { title: "Abo · KickPact" };

/**
 * Vereins-Abo. Nur für echte Vereinslizenzen — basic/pro-User werden von
 * `assertVereinAdminOrRedirect` zur Mannschafts-Seite umgeleitet, wo das Abo
 * im Mannschafts-Kontext liegt (`mannschaft/[teamId]/abo`).
 */
export default async function AboPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "admin");
  const nativeApp = await isNativeAppRequest();
  return <AboPanel clubId={club.id} clubSlug={slug} nativeApp={nativeApp} />;
}
