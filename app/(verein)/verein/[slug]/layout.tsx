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
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {club.name}
        </h1>
        <p className="text-sm md:text-base text-brand-night-navy/60">Vereins-Dashboard</p>
      </div>
      {children}
    </main>
  );
}
