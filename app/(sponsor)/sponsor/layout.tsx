import { requireUser } from "@/lib/auth/session";

export default async function SponsorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          Sponsor-Dashboard
        </h1>
      </div>
      {children}
    </main>
  );
}
