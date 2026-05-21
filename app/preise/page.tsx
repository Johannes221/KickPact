import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Preise — KickPact" };

type Feature = string;

interface PlanConfig {
  plan: string;
  price: string;
  unit: string;
  perPlayer: string;
  features: Feature[];
  highlight?: boolean;
  cta: string;
}

const PLANS: PlanConfig[] = [
  {
    plan: "Basic",
    price: "9 €",
    unit: "/ Mannschaft / Monat",
    perPlayer: "≈ 0,36 – 0,50 € pro Spieler/Monat",
    features: [
      "Eine Mannschaft, eigenständig verwaltet",
      "Bis zu 20 Sponsoren",
      "Alle Auto-Trigger (Tor, Sieg, Comeback, …)",
      "Manual Events (Kopfballtor, Elfmeter, …)",
      "Monatliches PDF-Reporting",
      "30 Tage gratis · monatlich kündbar"
    ],
    cta: "Basic testen"
  },
  {
    plan: "Pro",
    price: "19 €",
    unit: "/ Mannschaft / Monat",
    perPlayer: "≈ 0,76 – 1,06 € pro Spieler/Monat",
    features: [
      "Alles aus Basic",
      "Unlimited Sponsoren",
      "Saison-Wetten (Aufstieg, Klassenerhalt, …)",
      "Custom-Trigger-Texte",
      "Vereins-Logo auf PDF-Rechnungen",
      "CSV-Export aller Pledge-Daten"
    ],
    highlight: true,
    cta: "Pro testen"
  },
  {
    plan: "Vereinslizenz",
    price: "49 €",
    unit: "/ Verein / Monat",
    perPlayer: "bei 4 Teams à 22 Spielern ≈ 0,56 € pro Spieler",
    features: [
      "Alle Mannschaften des Vereins inklusive",
      "Alle Pro-Features für jedes Team",
      "Zentrales Admin-Cockpit für den Verein",
      "Konsolidierte Vereins-Rechnung",
      "Übergreifende Sponsor-Übersicht",
      "Lohnt ab ~3 Mannschaften"
    ],
    cta: "Verein anlegen"
  }
];

export default function PreisePage() {
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-white to-accent/5" aria-hidden />
        <div className="absolute top-0 right-0 h-72 md:h-96 w-72 md:w-96 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="absolute bottom-0 left-0 h-56 md:h-72 w-56 md:w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-5 md:px-6 py-14 md:py-20 text-center">
          <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-[0.6rem] md:text-xs font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/30">
            Faire Preise · Kein Risiko
          </span>
          <h1 className="mt-4 font-display font-black text-[2rem] leading-[1.1] sm:text-4xl md:text-5xl tracking-tight text-brand-night-navy">
            KickPact — Sponsoring,{" "}
            <span className="text-accent">das mitfiebert.</span>
          </h1>
          <p className="mt-4 text-sm md:text-lg text-brand-night-navy/70 max-w-xl mx-auto leading-relaxed">
            Weniger als 1&nbsp;€ pro Spieler im Monat.{" "}
            <strong className="text-brand-night-navy">100&nbsp;% des Sponsoren-Geldes</strong> geht direkt an eure Mannschaft — KickPact verdient ausschließlich am Abo.
          </p>

          {/* Trial Badge */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 ring-1 ring-accent/30">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden />
            <span className="text-xs md:text-sm font-semibold text-accent-dark">
              30 Tage kostenlos testen — keine Kreditkarte beim Start.
            </span>
          </div>
        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
        <div className="grid gap-6 md:gap-8 md:grid-cols-3 items-stretch">
          {PLANS.map((p) => (
            <PriceCard key={p.plan} {...p} />
          ))}
        </div>

        <p className="mt-6 md:mt-8 text-center text-xs md:text-sm text-brand-night-navy/60 max-w-2xl mx-auto">
          Typischer Amateur-Kader: 18–25 Spieler. Monatlich kündbar. Keine Laufzeitbindung.{" "}
          KickPact zwackt nie etwas vom Sponsoren-Geld ab.
        </p>
      </section>

      {/* FEATURE COMPARISON */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-14">
          <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy text-center">
            Was ist <span className="text-accent">in jedem Plan?</span>
          </h2>
          <p className="mt-2 text-center text-xs md:text-sm text-brand-night-navy/60">
            Alle Pläne starten mit 30 Tagen gratis — ohne Kreditkarte.
          </p>

          <div className="mt-8 md:mt-10 grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureGroup
              icon="⚽"
              title="Auto-Trigger"
              items={[
                "Tor, Sieg, Zu-Null",
                "Comeback (Rückstand aufgeholt)",
                "Hattrick, Aufwärts-Tor",
                "Fußball.de-Daten — vollautomatisch"
              ]}
            />
            <FeatureGroup
              icon="✍️"
              title="Manual Events"
              items={[
                "Kopfballtor, Volley, Elfmeter",
                "Trainer meldet per Smartphone",
                "Sponsor bestätigt → Trust by Design",
                "Custom-Texte ab Pro-Plan"
              ]}
            />
            <FeatureGroup
              icon="🧾"
              title="Abrechnung"
              items={[
                "Monatliches PDF-Reporting",
                "Vereins-Logo ab Pro",
                "CSV-Export ab Pro",
                "Konsolidierte Rechnung bei Vereinslizenz"
              ]}
            />
            <FeatureGroup
              icon="🎯"
              title="Saison-Wetten"
              items={[
                "Ab Pro-Plan verfügbar",
                "Aufstieg, Klassenerhalt, Tabellenplatz",
                "Abrechnung am Saisons-Ende",
                "Tabelle direkt von Fußball.de"
              ]}
            />
            <FeatureGroup
              icon="👥"
              title="Sponsoren"
              items={[
                "Bis 20 Sponsoren bei Basic",
                "Unlimited ab Pro",
                "Einladungslink per WhatsApp/Mail",
                "Frei wählbare Pledges pro Event"
              ]}
            />
            <FeatureGroup
              icon="🏟️"
              title="Vereinsverwaltung"
              items={[
                "Zentrales Admin-Cockpit",
                "Alle Teams auf einen Blick",
                "Übergreifende Sponsor-Übersicht",
                "Nur bei Vereinslizenz"
              ]}
            />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-white to-accent/10" aria-hidden />
        <div className="absolute top-0 right-0 h-72 md:h-96 w-72 md:w-96 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="absolute bottom-0 left-0 h-56 md:h-72 w-56 md:w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-3xl px-5 md:px-6 py-12 md:py-16 text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.6rem] md:text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/20">
            30 Tage gratis · Keine Kreditkarte
          </span>
          <h2 className="mt-3 md:mt-4 font-display font-black text-[1.75rem] sm:text-3xl md:text-5xl leading-[1.05] tracking-tight text-brand-night-navy">
            Bereit für euer
            <br />
            <span className="text-accent">erstes Sponsoring?</span>
          </h2>
          <p className="mt-3 text-sm md:text-base text-brand-night-navy/70 max-w-xl mx-auto">
            In 90 Sekunden online. Kein Vertrag. Kein Risiko für deine Mannschaft.
          </p>
          <div className="mt-6 md:mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="accent" size="lg" asChild className="w-full sm:w-auto">
              <Link href="/onboarding/verein/1">Kostenlos starten</Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
              <Link href="/">Mehr erfahren</Link>
            </Button>
          </div>
          <p className="mt-4 text-[0.7rem] md:text-xs text-brand-night-navy/50">
            30 Tage kostenlos testen — keine Kreditkarte beim Start.
          </p>
        </div>
      </section>
    </main>
  );
}

function PriceCard({
  plan,
  price,
  unit,
  perPlayer,
  features,
  highlight,
  cta
}: PlanConfig) {
  return (
    <div
      className={
        "relative flex flex-col rounded-2xl border p-6 md:p-8 " +
        (highlight
          ? "border-accent bg-accent/5 shadow-lg shadow-accent/10"
          : "border-brand-neutral/40 bg-white")
      }
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-accent text-white text-[0.55rem] md:text-[0.6rem] uppercase tracking-widest font-bold px-3 py-1 shadow-sm">
            Empfohlen
          </span>
        </div>
      )}

      <div>
        <h3 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {plan}
        </h3>
        <div className="mt-4 md:mt-6 flex items-baseline gap-2">
          <span className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
            {price}
          </span>
          <span className="text-xs md:text-sm text-brand-night-navy/60">{unit}</span>
        </div>
        <p className="mt-1.5 text-[0.7rem] md:text-xs font-semibold text-accent-dark">
          {perPlayer}
        </p>
      </div>

      <ul className="mt-5 md:mt-6 flex-1 space-y-2 md:space-y-2.5 text-xs md:text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-brand-night-navy/80">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 md:mt-8">
        <Button
          variant={highlight ? "accent" : "outline"}
          className="w-full"
          asChild
          size="lg"
        >
          <Link href="/onboarding/verein/1">{cta}</Link>
        </Button>
      </div>
    </div>
  );
}

function FeatureGroup({
  icon,
  title,
  items
}: {
  icon: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none">{icon}</span>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          {title}
        </h3>
      </div>
      <ul className="mt-3 md:mt-4 space-y-1.5 text-xs md:text-sm text-brand-night-navy/70">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckIcon className="text-accent/70 mt-0.5 shrink-0" size="sm" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckIcon({
  className = "",
  size = "md"
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4 md:h-5 md:w-5";
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`flex-shrink-0 text-accent mt-0.5 ${sizeClass} ${className}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
