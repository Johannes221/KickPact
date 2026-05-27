/**
 * @deprecated Spieler-Opt-out ist deprecated. Diese Seite leitet auf
 * eine statische "nicht verfügbar"-Message um. Code in
 * _components/opt-out-confirm.tsx + lib/actions/team-lifecycle.ts
 * bleibt als Reference erhalten.
 */

export const metadata = {
  title: "Spieler-Opt-out · KickPact",
  robots: { index: false, follow: false }
};

export default function SpielerOptOutPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display font-black text-3xl text-brand-night-navy">
        Spieler-Opt-out
      </h1>
      <p className="mt-4 text-sm text-brand-night-navy/70">
        Dieses Feature ist aktuell nicht verfügbar. Bitte wende dich direkt an
        deinen Verein, wenn du deine Daten anonymisiert haben möchtest.
      </p>
    </main>
  );
}
