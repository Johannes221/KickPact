import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Mannschaft anlegen · KickPact" };

export default async function OnboardingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Mannschaft anlegen
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          4 Schritte, dauert ca. 5 Minuten. Verein mit mehreren Teams? → Vereinslizenz im Plan-Schritt wählen.
        </p>
      </div>
      {children}
    </main>
  );
}
