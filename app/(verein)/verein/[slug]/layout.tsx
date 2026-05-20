import { assertClubAccess } from "@/lib/auth/scope";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "viewer");
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          {club.name}
        </h1>
        <p className="text-brand-night-navy/60">Vereins-Dashboard</p>
      </div>
      {children}
    </main>
  );
}
