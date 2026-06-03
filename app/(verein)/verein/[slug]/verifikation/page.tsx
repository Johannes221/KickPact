import { assertClubAccess } from "@/lib/auth/scope";
import { VerificationForm } from "./_components/verification-form";

export const metadata = { title: "Verein verifizieren · KickPact" };

/**
 * Asynchrone Verein-Verifikation (PDF-Upload). Seit dem 2026-05 Onboarding-
 * Rewrite läuft das nicht mehr blockierend im Wizard, sondern als opt-in
 * Aktion über die `StatusBar` im Vereins-Layout. Bis zur Verifikation
 * werden Sponsoren-Rechnungen zurückgehalten — das Trial selbst läuft trotzdem.
 */
export default async function VereinVerifikationPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // assertClubAccess (nicht assertVereinAdminOrRedirect): auch Solo-Mannschafts-
  // Admins (basic/pro) müssen IHREN Container verifizieren können. Der Plan-
  // Redirect von assertVereinAdminOrRedirect schickte sie sonst zur Team-Seite
  // zurück → „Verifizieren" führte ins Leere.
  const { club } = await assertClubAccess(slug, "admin");

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Verein-Verifikation
        </div>
        <h2 className="mt-1 font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          {club.name}
        </h2>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          Lade einen Vertretungsnachweis hoch (Vereinsregister-Auszug, Vorstandsbeschluss
          o.ä.). Unser Team prüft das innerhalb von 1–2 Werktagen. Solange die Verifikation
          aussteht, werden Sponsoren-Rechnungen zurückgehalten — alles andere läuft normal
          weiter.
        </p>
      </div>
      <VerificationForm clubSlug={slug} />
    </div>
  );
}
