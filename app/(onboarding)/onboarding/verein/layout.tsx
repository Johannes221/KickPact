import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Verein anlegen · KickPact" };

export default async function OnboardingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          Verein anlegen
        </h1>
        <p className="mt-2 text-brand-night-navy/60">
          4 Schritte, dauert ca. 5 Minuten.
        </p>
      </div>
      {children}
    </main>
  );
}
