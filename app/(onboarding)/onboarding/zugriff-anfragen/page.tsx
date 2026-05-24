import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { RequestForm } from "./_components/request-form";

export const metadata = { title: "Zugriff anfragen · KickPact" };

export default async function ZugriffAnfragenPage({
  searchParams
}: {
  searchParams: Promise<{ clubSlug?: string }>;
}) {
  const { clubSlug } = await searchParams;
  if (!clubSlug) redirect("/onboarding/verein/1");

  await requireUser();

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) redirect("/onboarding/verein/1");

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.clubId, club.id));

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Zugriff anfragen
        </div>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          {club.name}
        </h1>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          Dieser Verein ist schon bei KickPact. Stell eine Anfrage — die Admins entscheiden,
          ob du Zugriff bekommst.
        </p>
      </div>

      <RequestForm clubSlug={club.slug} clubName={club.name} teams={teamRows} />
    </main>
  );
}
