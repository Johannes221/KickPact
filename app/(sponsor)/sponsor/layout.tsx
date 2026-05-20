import { requireUser } from "@/lib/auth/session";

export default async function SponsorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Sponsor-Dashboard
        </h1>
      </div>
      {children}
    </main>
  );
}
