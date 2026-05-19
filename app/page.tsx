import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "KickPact — Sponsoring, das mitfiebert" };

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="py-24">
        <h1 className="font-display text-6xl md:text-8xl tracking-wide leading-none">
          Sponsoring,
          <br />
          <span className="text-accent">das mitfiebert.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-xl text-neutral-600">
          Familie, Freunde und lokale Unternehmen unterstützen deine Mannschaft mit
          performance-basierten Versprechen — 5 € pro Tor, 10 € pro Sieg, 20 € pro
          Comeback. KickPact rechnet jedes Spiel automatisch ab.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="accent" size="lg" asChild>
            <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/login">Ich bin schon dabei</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          Weniger als 1 € pro Spieler im Monat.
        </p>
      </section>

      <section className="grid gap-6 border-t border-neutral-200 py-16 md:grid-cols-3">
        <Feature
          title="Automatisch"
          body="Spielergebnisse werden direkt von Fußball.de gescraped. Tore, Siege, Comebacks — alles wird vollautomatisch erkannt und abgerechnet."
        />
        <Feature
          title="Transparent"
          body="Jeder Sponsor sieht jeden Pledge live mit Worst-Case-Schätzung. Monatliche PDF-Rechnung direkt vom Verein. Steuerlich absetzbar als Werbeleistung."
        />
        <Feature
          title="Flexibel"
          body="Spezial-Events wie Kopfballtore oder Hackentore meldet der Trainer, Sponsor bestätigt. Optional Caps pro Spiel oder Monat, damit niemand erschlagen wird."
        />
      </section>

      <section className="border-t border-neutral-200 py-8 text-sm text-neutral-500">
        <Link href="/status" className="hover:underline">
          System-Status &amp; Live-Demo
        </Link>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-2xl tracking-wide">{title}</h3>
      <p className="mt-2 text-neutral-600">{body}</p>
    </div>
  );
}
