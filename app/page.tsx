import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { RolesTabs } from "./_components/roles-tabs";

export const metadata = { title: "KickPact — Mehr als ein Spiel" };

export default function LandingPage() {
  return (
    <main>
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-accent-dark">
          Performance-Sponsoring für den Amateurfußball
        </span>
        <h1 className="mt-6 font-display font-black text-6xl md:text-8xl tracking-tight leading-[0.95] text-brand-night-navy">
          Sponsoring,
          <br />
          <span className="text-accent">das mitfiebert.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-xl text-brand-night-navy/70">
          Familie, Freunde und lokale Unternehmen versprechen Beträge an Spielereignisse —
          5 € pro Tor, 10 € pro Sieg, 20 € pro Comeback. KickPact rechnet jedes Spiel
          automatisch ab und stellt am Monatsende eine ordentliche Rechnung aus.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="accent" size="lg" asChild>
            <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/login">Ich bin schon dabei</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-brand-night-navy/60">
          Ab 9 € pro Monat — weniger als 1 € pro Spieler.
        </p>
      </section>

      {/* ROLES TABS */}
      <section className="border-y border-brand-neutral/40 bg-brand-night-navy text-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight">
            Was bringt&apos;s <span className="text-accent">dir?</span>
          </h2>
          <p className="mt-2 text-white/60">Wähle deine Rolle.</p>
          <div className="mt-8">
            <RolesTabs />
          </div>
        </div>
      </section>

      {/* SO GEHT'S */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          So geht&apos;s <span className="text-accent">in 4 Schritten</span>
        </h2>
        <p className="mt-2 text-brand-night-navy/60">Onboarding bis erste Rechnung: ~5 Minuten plus 4 Wochen Saison.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Step
            num="01"
            title="Verein anlegen"
            body="Magic-Link per Mail, Wizard sucht dich auf Fußball.de, wählt Mannschaft + Plan. Dauert 90 Sekunden."
          />
          <Step
            num="02"
            title="Sponsoren einladen"
            body="Du teilst einen Einladungslink — per Whatsapp, Mail, am Stammtisch. Jeder Sponsor legt seine Pledges selbst fest."
          />
          <Step
            num="03"
            title="Spiele werden ausgewertet"
            body="Crawler holt Tore, Siege, Halbzeiten direkt von Fußball.de. Spezial-Events (Kopfballtor, Elfmeter) meldet der Trainer per Smartphone."
          />
          <Step
            num="04"
            title="Monats-Rechnung"
            body="Am Monatsersten wandert eine PDF-Rechnung an jeden Sponsor. Verein zieht das Geld selbst ein — KickPact bleibt Tool."
          />
        </div>
      </section>

      {/* TRIGGER-BEISPIELE */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
            Was kann ein <span className="text-accent">Pledge</span> sein?
          </h2>
          <p className="mt-2 text-brand-night-navy/60 max-w-2xl">
            Sponsoren versprechen Beträge an Ereignisse. Wir kennen 16 Trigger-Typen
            — alles vom simplen Tor bis zum Spezial-Event.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TriggerCard emoji="⚽" name="Pro Tor" examples={["5 € · 10 €"]} auto />
            <TriggerCard emoji="🏆" name="Pro Sieg" examples={["10 € · 50 €"]} auto />
            <TriggerCard emoji="🛡️" name="Pro Zu-Null" examples={["5 € · 15 €"]} auto />
            <TriggerCard emoji="🔥" name="Pro Comeback" examples={["20 € · 50 €"]} auto />
            <TriggerCard emoji="🎯" name="Pro Hattrick" examples={["25 € · 100 €"]} auto />
            <TriggerCard emoji="🎭" name="Pro Spezial-Tor" examples={["Kopfball, Volley, Elfmeter"]} />
            <TriggerCard emoji="💎" name="Custom" examples={["Bizeps-Tor von Schmidt"]} />
            <TriggerCard emoji="🟨🟥" name="Karten (optional)" examples={["1 € · 5 €"]} />
          </div>
          <p className="mt-6 text-xs text-brand-night-navy/50">
            <span className="inline-flex items-center gap-1 mr-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Auto (von Fußball.de)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-night-navy" /> Verein meldet + Sponsor bestätigt
            </span>
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          Faire <span className="text-accent">Preise.</span>
        </h2>
        <p className="mt-2 text-brand-night-navy/60">Pro Mannschaft. 30 Tage gratis. Monatlich kündbar.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <PriceCard
            plan="Basic"
            price="9 €"
            unit="/ Mannschaft / Monat"
            features={[
              "Bis zu 20 Sponsoren pro Mannschaft",
              "Alle 10 Auto-Trigger (Tor, Sieg, Comeback, ...)",
              "Alle 6 Manuelle Trigger (Spezial-Tor, Karten, ...)",
              "Monatliche PDF-Rechnung",
              "Tenant-Dashboard"
            ]}
          />
          <PriceCard
            plan="Pro"
            price="19 €"
            unit="/ Mannschaft / Monat"
            highlight
            features={[
              "Alles aus Basic",
              "Unlimited Sponsoren",
              "Vereins-Logo auf PDF-Rechnungen",
              'Custom Trigger-Texte (z.B. "Bizeps-Tor")',
              "CSV-Export aller Charges",
              "Sponsor-Stats-Widgets"
            ]}
          />
        </div>
        <p className="mt-8 text-sm text-brand-night-navy/60">
          Typischer Kader hat 18–25 Spieler — das macht <strong>0,36 – 1,06 € pro Spieler/Monat.</strong>
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
            Häufige <span className="text-accent">Fragen</span>
          </h2>
          <Accordion type="single" collapsible className="mt-8">
            <FaqItem
              q="Sind die Beträge für den Sponsor steuerlich absetzbar?"
              a="Bei Unternehmens-Sponsoren: ja, als Werbeleistung. KickPact erzeugt eine ordentliche Vereins-Rechnung mit USt-ID (oder §19-Kleinunternehmer-Hinweis). Bei Privatpersonen (Familie, Freunde) gilt der allgemeine Status — keine Steuervorteile, aber auch keine Pflichten."
            />
            <FaqItem
              q="Was passiert wenn meine Mannschaft schlecht spielt?"
              a="Sponsoren zahlen weniger. Das ist genau die Idee von Performance-Sponsoring. Im worst case (kein Tor, keine Siege) bekommt der Verein gar nichts — aber dann gibt's auch nichts zu feiern."
            />
            <FaqItem
              q="Wie verhindere ich, dass ein Sponsor von einer hohen Rechnung überrascht wird?"
              a="Jeder Pledge kann einen optionalen Monats-Cap haben (z.B. „maximal 50 € pro Monat egal was passiert“). Wir empfehlen das aktiv im Pledge-Wizard. Außerdem zeigt KickPact dem Sponsor immer eine Worst-Case-Schätzung."
            />
            <FaqItem
              q="Funktioniert das auch für Junioren-Mannschaften?"
              a="Ja. Solange die Mannschaft auf Fußball.de gelistet ist, scrapt unser Crawler die Spielergebnisse. Junioren-Mannschaften sind oft sogar besonders dankbar für Familien-Sponsoring."
            />
            <FaqItem
              q="Was, wenn der Trainer einen Spezial-Event falsch meldet?"
              a="Spezial-Events (Kopfballtor, Hackentor, etc.) erscheinen als „pending“ beim Sponsor. Er kann bestätigen oder bestreiten. Erst bestätigte Events landen auf der Rechnung. Trust by design."
            />
            <FaqItem
              q="Kann ich jederzeit kündigen?"
              a="Ja, das Abo ist monatlich kündbar. Nach Kündigung läuft KickPact noch bis Monatsende weiter. Bestehende Pledges enden zum Saison-Ende; Sponsoren können erneuern."
            />
            <FaqItem
              q="Müssen Vereine USt-pflichtig sein?"
              a="Nein. Im Wizard markierst du, ob dein Verein Kleinunternehmer (§19 UStG) ist. Wir generieren die Rechnungen entsprechend mit oder ohne USt-Aufschlag und mit dem korrekten Hinweistext."
            />
          </Accordion>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-brand-night-navy">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center text-white">
          <h2 className="font-display font-black text-4xl md:text-6xl tracking-tight">
            Bereit, mehr aus
            <br />
            <span className="text-accent">jedem Spiel</span> zu machen?
          </h2>
          <p className="mt-4 text-white/70 text-lg max-w-xl mx-auto">
            30 Tage gratis. Kein Vertrag. Kein Risiko für deinen Verein.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Button variant="accent" size="lg" asChild>
              <Link href="/signup">Verein anlegen</Link>
            </Button>
            <Button
              size="lg"
              asChild
              className="border border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/login">Login</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* MINI-FOOTER */}
      <section className="mx-auto max-w-6xl px-6 py-10 text-sm text-brand-night-navy/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/status" className="hover:text-accent">
            System-Status &amp; Live-Demo →
          </Link>
          <span>© {new Date().getFullYear()} KickPact</span>
        </div>
      </section>
    </main>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <Card className="border-brand-neutral/40 shadow-none hover:border-accent/40 transition-colors">
      <CardContent className="p-6">
        <div className="font-mono text-xs text-accent font-bold tracking-widest">{num}</div>
        <h3 className="mt-3 font-display font-black text-xl tracking-tight text-brand-night-navy">
          {title}
        </h3>
        <p className="mt-2 text-sm text-brand-night-navy/70 leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}

function TriggerCard({
  emoji,
  name,
  examples,
  auto = false
}: {
  emoji: string;
  name: string;
  examples: string[];
  auto?: boolean;
}) {
  return (
    <div className="rounded-lg border border-brand-neutral/40 bg-white p-4 hover:border-accent/40 transition-colors">
      <div className="flex items-start justify-between">
        <div className="text-2xl">{emoji}</div>
        <span
          className={
            "h-1.5 w-1.5 mt-2 rounded-full " + (auto ? "bg-accent" : "bg-brand-night-navy")
          }
          title={auto ? "Auto" : "Manuell"}
        />
      </div>
      <div className="mt-3 font-display font-black text-sm tracking-tight text-brand-night-navy">
        {name}
      </div>
      <div className="mt-1 text-xs text-brand-night-navy/60">{examples.join(" · ")}</div>
    </div>
  );
}

function PriceCard({
  plan,
  price,
  unit,
  features,
  highlight
}: {
  plan: string;
  price: string;
  unit: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-8 " +
        (highlight
          ? "border-accent bg-accent/5"
          : "border-brand-neutral/40 bg-white")
      }
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-black text-3xl tracking-tight text-brand-night-navy">
          {plan}
        </h3>
        {highlight && (
          <span className="rounded-full bg-accent text-white text-[0.6rem] uppercase tracking-widest font-bold px-2 py-1">
            empfohlen
          </span>
        )}
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display font-black text-5xl tracking-tight text-brand-night-navy">
          {price}
        </span>
        <span className="text-sm text-brand-night-navy/60">{unit}</span>
      </div>
      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-brand-night-navy/80">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 flex-shrink-0 text-accent"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Button
          variant={highlight ? "accent" : "outline"}
          className="w-full"
          asChild
          size="lg"
        >
          <Link href="/signup">Mit {plan} starten</Link>
        </Button>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <AccordionItem value={q} className="border-brand-neutral/40">
      <AccordionTrigger className="text-left text-brand-night-navy hover:no-underline hover:text-accent">
        {q}
      </AccordionTrigger>
      <AccordionContent className="text-brand-night-navy/70 leading-relaxed">
        {a}
      </AccordionContent>
    </AccordionItem>
  );
}
