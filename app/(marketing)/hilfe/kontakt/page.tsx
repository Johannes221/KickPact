import { ContactForm } from "@/components/support/contact-form";
import { getServerSession } from "@/lib/auth/session";

export const metadata = { title: "Kontakt & Hilfe · KickPact" };

export default async function KontaktPage() {
  const session = await getServerSession();
  const defaults = session?.user
    ? { name: session.user.name ?? undefined, email: session.user.email }
    : undefined;

  return (
    <main className="mx-auto max-w-xl px-5 md:px-6 py-12 md:py-16">
      <div className="mb-6">
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
          Kontakt & Hilfe
        </h1>
        <p className="mt-2 text-brand-night-navy/60">
          Frage, Problem oder Feedback? Schreib uns — wir antworten per E-Mail.
        </p>
      </div>
      <ContactForm defaults={defaults} />
    </main>
  );
}
