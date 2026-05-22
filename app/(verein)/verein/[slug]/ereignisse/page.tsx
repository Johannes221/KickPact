import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { listClubEreignisse } from "@/lib/db/queries/club-dashboard";
import { EreignisseView } from "./_components/ereignisse-view";

export const metadata = { title: "Ereignisse · KickPact" };

export default async function EreignissePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) return null;

  const ereignisse = await listClubEreignisse(club.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Ereignisse
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Alle ausgelösten Sponsoring-Ereignisse dieser Saison.
        </p>
      </div>
      <EreignisseView rows={ereignisse} slug={slug} />
    </div>
  );
}
