import Link from "next/link";

export const metadata = { title: "Anfrage gesendet · KickPact" };

export default async function GesendetPage({
  searchParams
}: {
  searchParams: Promise<{ clubName?: string }>;
}) {
  const { clubName } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-5 md:px-6 py-16 text-center">
      <div className="text-6xl mb-4">📨</div>
      <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
        Anfrage gesendet
      </h1>
      <p className="mt-3 text-sm text-brand-night-navy/60">
        Wir haben die Admins von {clubName ? <strong>{clubName}</strong> : "dem Verein"} per Mail
        informiert. Sobald sie entscheiden, kriegst du eine Mail — meistens innerhalb von 1–2 Tagen.
      </p>
      <div className="mt-8">
        <Link href="/dashboard" className="text-sm font-semibold text-accent hover:underline">
          ← Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
