import Link from "next/link";
import Image from "next/image";
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

// Verifizierte Football-Photos (Source: unsplash.com, alle visuell geprüft)
const PHOTOS = {
  // Action-Match (zwei Spieler im Zweikampf, hell, sonnig)
  matchAction: "https://images.unsplash.com/photo-1543326727-cf6c39e8f84c",
  // Einzelner Spieler beim Schuss (sonnig, freundlich)
  playerKick: "https://images.unsplash.com/photo-1517466787929-bc90951d0974",
  // Drei Bälle auf Rasen (bright, technisch)
  balls: "https://images.unsplash.com/photo-1551958219-acbc608c6377",
  // Fuß am Ball (sportlich, fokussiert)
  football: "https://images.unsplash.com/photo-1574629810360-7efbbe195018",
  // Jugendspieler + Ball (Jugendfußball-Detail)
  youth: "https://images.unsplash.com/photo-1606925797300-0b35e9d1794e"
};

export default function LandingPage() {
  return (
    <main>
      {/* HERO — first-fold, photo-dominant, animated background, compact text */}
      <section className="relative w-full overflow-hidden bg-brand-night-navy h-[calc(100svh-65px)] min-h-[560px] max-h-[860px]">
        {/* Background: animated football photo */}
        <div className="absolute inset-0">
          <Image
            src={`${PHOTOS.matchAction}?auto=format&fit=crop&w=2400&q=85`}
            alt="Amateur-Fußballspieler im Zweikampf bei sonnigem Wetter"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center animate-ken-burns"
          />
          {/* Gradient overlay für Lesbarkeit — bright but readable */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />
        </div>

        {/* Content: linksbündig, vertikal zentriert, compact spacing */}
        <div className="relative z-10 mx-auto max-w-6xl px-6 h-full flex flex-col justify-center">
          <span className="animate-fade-up inline-flex w-fit items-center rounded-full bg-accent/15 px-3 py-1 text-[0.65rem] md:text-xs font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/30 backdrop-blur-sm">
            Kick · Pact · Impact
          </span>
          <h1 className="animate-fade-up delay-1 mt-4 md:mt-5 font-display font-black text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.02] text-brand-night-navy max-w-3xl">
            Wenn die Jungs jubeln,
            <br />
            <span className="text-accent">jubelst du mit.</span>
          </h1>
          <p className="animate-fade-up delay-2 mt-4 md:mt-5 max-w-xl text-base md:text-lg text-brand-night-navy/85 leading-relaxed">
            <strong className="text-brand-night-navy">3 €</strong> wenn Schmidt trifft.{" "}
            <strong className="text-brand-night-navy">10 €</strong> pro Sieg.{" "}
            <strong className="text-brand-night-navy">20 €</strong> pro Comeback. KickPact rechnet jedes Spiel automatisch ab.
          </p>
          <div className="animate-fade-up delay-3 mt-6 md:mt-7 flex flex-wrap gap-3">
            <Button variant="accent" size="lg" asChild>
              <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="bg-white/70 backdrop-blur">
              <Link href="/login">Ich bin schon dabei</Link>
            </Button>
          </div>
          <p className="animate-fade-up delay-4 mt-3 text-xs md:text-sm text-brand-night-navy/60">
            Ab 9 € pro Monat — weniger als 1 € pro Spieler.
          </p>
        </div>
      </section>

      {/* ROLES TABS */}
      <section className="border-y border-brand-neutral/40 bg-brand-night-navy text-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight">
            Was bringt&apos;s <span className="text-accent">dir?</span>
          </h2>
          <p className="mt-2 text-white/60 text-sm">Wähle deine Rolle.</p>
          <div className="mt-6">
            <RolesTabs />
          </div>
        </div>
      </section>

      {/* ECHTE GESCHICHTEN — Image-driven Testimonial-Style */}
      <section className="bg-brand-off-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-dark">
              Echte Geschichten · Echter Impact
            </span>
            <h2 className="mt-3 font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
              Sponsoring, das <span className="text-accent">eine Geschichte erzählt.</span>
            </h2>
            <p className="mt-2 text-brand-night-navy/70">
              Keine Plakate, keine Trikot-Werbung. Sondern Menschen, die mitfiebern —
              weil ihr Versprechen mit jedem Tor ein bisschen mehr wert wird.
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <StoryCard
              image={PHOTOS.youth}
              imageAlt="Junger Fußballer im Schuss am Ball"
              kicker="Tante Erna · Familie"
              headline="3 € wenn Schmidt ein Tor schießt."
              body="Sie ist Patentante. Schmidt ist 13, spielt B-Jugend. Sie schaut jedes Spiel, jubelt am lautesten. Letzte Saison waren&apos;s 87 €. Schmidt hat&apos;s gewusst — und 4 Mal nach dem Tor zu ihr in die Tribüne gewinkt."
            />
            <StoryCard
              image={PHOTOS.playerKick}
              imageAlt="Amateur-Fußballer beim Schuss"
              kicker="Bäckerei Müller · Business"
              headline="50 € pro Comeback-Sieg."
              body="Stefan vom Bäcker an der Ecke. Hatte früher Trikot-Sponsoring für 500 € pauschal. Jetzt: nur wenn die Jungs richtig liefern. Comeback gegen Eintracht? 50 € fließen. Über die Saison kommen 600 € rein. Steuerlich absetzbar."
            />
            <StoryCard
              image={PHOTOS.balls}
              imageAlt="Fußbälle auf grünem Rasen vor dem Anpfiff"
              kicker="Onkel Tom · Familie"
              headline="10 € pro Kopfballtor."
              body="Spezial-Wette von Tom für seinen Neffen. Trainer meldet's nach dem Spiel im Bus per Smartphone, Tom bestätigt per Klick. Auf der Saison-Rechnung steht jedes Kopfballtor mit Datum, Spiel und Minute."
            />
          </div>
        </div>
      </section>

      {/* SO GEHT'S */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
          So geht&apos;s <span className="text-accent">in 4 Schritten</span>
        </h2>
        <p className="mt-2 text-brand-night-navy/60 text-sm">
          Onboarding bis erste Rechnung: ~5 Minuten plus 4 Wochen Saison.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Step
            num="01"
            title="Verein anlegen"
            body="Magic-Link per Mail, Wizard sucht dich auf Fußball.de, wählt Mannschaft + Plan. Dauert 90 Sekunden."
          />
          <Step
            num="02"
            title="Sponsoren einladen"
            body="Du teilst einen Einladungslink — per WhatsApp, Mail, am Stammtisch. Jeder Sponsor legt seine Pledges selbst fest."
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

      {/* TRIGGER-BEISPIELE — kompakter Bild-Streifen oberhalb */}
      <section className="bg-brand-night-navy text-white">
        <div className="relative h-32 md:h-40 overflow-hidden">
          <Image
            src={`${PHOTOS.football}?auto=format&fit=crop&w=2400&q=80`}
            alt="Fußball auf dem Rasen vor dem Anstoß"
            fill
            sizes="100vw"
            className="object-cover object-center opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-night-navy/40 via-brand-night-navy/20 to-brand-night-navy" />
        </div>
        <div className="mx-auto max-w-6xl px-6 py-14 -mt-12 relative">
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight">
            Was kann ein <span className="text-accent">Pledge</span> sein?
          </h2>
          <p className="mt-2 text-white/70 max-w-2xl text-sm">
            16 Trigger-Typen — vom simplen Tor bis zum spieler-spezifischen Lieblings-Stürmer-Bonus. Jeder Trigger = mehr Impact pro Spieltag.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TriggerCard
              emoji="⚽"
              name="Pro Tor"
              examples={["5 € · 10 €"]}
              auto
            />
            <TriggerCard
              emoji="💚"
              name="Pro Spieler-Tor"
              examples={["3 € wenn Schmidt trifft"]}
              auto
              highlight
            />
            <TriggerCard
              emoji="🏆"
              name="Pro Sieg"
              examples={["10 € · 50 €"]}
              auto
            />
            <TriggerCard
              emoji="🛡️"
              name="Pro Zu-Null"
              examples={["5 € · 15 €"]}
              auto
            />
            <TriggerCard
              emoji="🔥"
              name="Pro Comeback"
              examples={["20 € · 50 €"]}
              auto
            />
            <TriggerCard
              emoji="🎯"
              name="Pro Hattrick"
              examples={["25 € · 100 €"]}
              auto
            />
            <TriggerCard
              emoji="🎭"
              name="Pro Spezial-Tor"
              examples={["Kopfball, Volley, Elfmeter"]}
            />
            <TriggerCard
              emoji="💎"
              name="Custom-Event"
              examples={["Bizeps-Tor · Trainer-Trinkrunde"]}
            />
          </div>
          <p className="mt-6 text-xs text-white/50">
            <span className="inline-flex items-center gap-1 mr-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Auto (von Fußball.de)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white/60" /> Verein meldet + Sponsor bestätigt
            </span>
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
          Faire <span className="text-accent">Preise.</span>
        </h2>
        <p className="mt-2 text-brand-night-navy/60 text-sm">
          Pro Mannschaft. 30 Tage gratis. Monatlich kündbar.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <PriceCard
            plan="Basic"
            price="9 €"
            unit="/ Mannschaft / Monat"
            features={[
              "Bis zu 20 Sponsoren pro Mannschaft",
              "Alle 10 Auto-Trigger (Tor, Sieg, Comeback, …)",
              "Alle 6 Manuelle Trigger (Spezial-Tor, Karten, …)",
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
          Typischer Kader hat 18–25 Spieler — das macht{" "}
          <strong>0,36 – 1,06 € pro Spieler/Monat.</strong>
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
            Häufige <span className="text-accent">Fragen</span>
          </h2>
          <Accordion type="single" collapsible className="mt-6">
            <FaqItem
              q="Sind die Beträge für den Sponsor steuerlich absetzbar?"
              a="Bei Unternehmens-Sponsoren: ja, als Werbeleistung. KickPact erzeugt eine ordentliche Vereins-Rechnung mit USt-ID (oder §19-Kleinunternehmer-Hinweis). Bei Privatpersonen (Familie, Freunde) gilt der allgemeine Status — keine Steuervorteile, aber auch keine Pflichten."
            />
            <FaqItem
              q="Kann ich einen Pledge auf einen bestimmten Spieler binden?"
              a={'Ja. Beispiel: "3 € wenn Schmidt ein Tor schießt." Im Pledge-Setup wählst du den Trigger „Tor von Spieler X", suchst den Spieler über Fußball.de-Profil aus, und KickPact erkennt automatisch nach jedem Spiel ob Schmidt getroffen hat. Bei nicht zuordenbaren Spielern (z.B. Junioren ohne öffentliches Profil) meldet der Trainer manuell.'}
            />
            <FaqItem
              q="Was passiert wenn meine Mannschaft schlecht spielt?"
              a="Sponsoren zahlen weniger. Das ist genau die Idee von Performance-Sponsoring. Im Worst Case (kein Tor, keine Siege) bekommt der Verein gar nichts — aber dann gibt&apos;s auch nichts zu feiern."
            />
            <FaqItem
              q="Wie verhindere ich, dass ein Sponsor von einer hohen Rechnung überrascht wird?"
              a='Jeder Pledge kann einen optionalen Monats-Cap haben (z.B. "maximal 50 € pro Monat egal was passiert"). Wir empfehlen das aktiv im Pledge-Wizard. Außerdem zeigt KickPact dem Sponsor immer eine Worst-Case-Schätzung.'
            />
            <FaqItem
              q="Funktioniert das auch für Junioren-Mannschaften?"
              a="Ja. Solange die Mannschaft auf Fußball.de gelistet ist, scrapt unser Crawler die Spielergebnisse. Junioren-Mannschaften sind oft sogar besonders dankbar für Familien-Sponsoring."
            />
            <FaqItem
              q="Was, wenn der Trainer einen Spezial-Event falsch meldet?"
              a={'Spezial-Events (Kopfballtor, Hackentor, etc.) erscheinen als "pending" beim Sponsor. Er kann bestätigen oder bestreiten. Erst bestätigte Events landen auf der Rechnung. Trust by design.'}
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

      {/* FINAL CTA — bright + accent gradient */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-white to-accent/10" aria-hidden />
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-accent/15 blur-3xl" aria-hidden />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/20">
            Kick · Pact · Impact
          </span>
          <h2 className="mt-4 font-display font-black text-3xl md:text-5xl tracking-tight text-brand-night-navy">
            Bereit für mehr
            <br />
            <span className="text-accent">Impact pro Spiel?</span>
          </h2>
          <p className="mt-3 text-brand-night-navy/70 max-w-xl mx-auto">
            30 Tage gratis. Kein Vertrag. Kein Risiko für deinen Verein.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Button variant="accent" size="lg" asChild>
              <Link href="/signup">Verein anlegen</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
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

function StoryCard({
  image,
  imageAlt,
  kicker,
  headline,
  body
}: {
  image: string;
  imageAlt: string;
  kicker: string;
  headline: string;
  body: string;
}) {
  return (
    <article className="group rounded-2xl bg-white border border-brand-neutral/40 overflow-hidden hover:border-accent/40 transition-colors">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={`${image}?auto=format&fit=crop&w=900&q=80`}
          alt={imageAlt}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
        />
      </div>
      <div className="p-6">
        <div className="text-xs uppercase tracking-[0.15em] text-accent-dark font-bold">
          {kicker}
        </div>
        <h3 className="mt-3 font-display font-black text-xl tracking-tight text-brand-night-navy">
          {headline}
        </h3>
        <p className="mt-3 text-sm text-brand-night-navy/70 leading-relaxed">{body}</p>
      </div>
    </article>
  );
}

function TriggerCard({
  emoji,
  name,
  examples,
  auto = false,
  highlight = false
}: {
  emoji: string;
  name: string;
  examples: string[];
  auto?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 transition-colors " +
        (highlight
          ? "border-accent bg-accent/10"
          : "border-white/15 bg-white/5 hover:border-accent/40")
      }
    >
      <div className="flex items-start justify-between">
        <div className="text-2xl">{emoji}</div>
        <span
          className={
            "h-1.5 w-1.5 mt-2 rounded-full " + (auto ? "bg-accent" : "bg-white/60")
          }
          title={auto ? "Auto" : "Manuell"}
        />
      </div>
      <div className="mt-3 font-display font-black text-sm tracking-tight text-white">
        {name}
      </div>
      <div className="mt-1 text-xs text-white/70">{examples.join(" · ")}</div>
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
        (highlight ? "border-accent bg-accent/5" : "border-brand-neutral/40 bg-white")
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
