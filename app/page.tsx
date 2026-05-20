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

// Echte Mannschaftsfotos mit KickPact-Branding (lokale Assets).
// Hinweis: team-hero.png ist ein Mockup mit aufgebranntem K-Wasserzeichen —
// nur als Marketing-Visual im Trigger-Banner sinnvoll, NICHT als Hero-Background.
const PHOTOS = {
  // Hero: SG Reichenbach #9 mit erhobener Faust, Team-Umarmung —
  // sauberes Jubelfoto ohne Overlay, perfekt für "Wenn die Jungs jubeln".
  teamHero: "/brand/photos/team-celebration.png",
  // Mannschaft in KickPact-Trikots (schwarz/grün), Jubelumarmung — Story-Card
  teamCelebration: "/brand/photos/team-branded-line.png",
  // TSV Abtswind, grüne Trikots, Torjubel
  teamGreen: "/brand/photos/team-green.png",
  // Marketing-Mockup mit aufgebranntem "K KICKPACT" — als Trigger-Banner-Visual
  teamBrandedLine: "/brand/photos/team-hero.png",
  // Mixed-Ages Team in weißen KickPact-Trikots
  teamWhiteMixed: "/brand/photos/team-white-mixed.png"
};

export default function LandingPage() {
  return (
    <main>
      {/* HERO — full-bleed unter transparentem Header, ken-burns Background.
          Text liegt in einem Glass-Panel (backdrop-blur + bg-white/65), damit
          Lesbarkeit unabhängig vom Foto-Inhalt + Viewport-Crop garantiert ist. */}
      <section className="relative w-full overflow-hidden bg-brand-night-navy h-svh min-h-[640px] max-h-[920px]">
        {/* Background: echtes Mannschaftsfoto */}
        <div className="absolute inset-0">
          <Image
            src={PHOTOS.teamHero}
            alt="Amateur-Fußballmannschaft jubelt nach Torerfolg, Spieler mit Faust nach oben"
            fill
            priority
            sizes="100vw"
            className="object-cover animate-ken-burns"
            style={{ objectPosition: "65% center" }}
          />
          {/* Sehr dezenter Gradient-Wash: gibt dem Foto mehr Atmosphäre,
              Lesbarkeit kommt aus dem Glass-Panel selbst. */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-transparent md:from-white/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/30 via-transparent to-white/10" />
        </div>

        {/* Content: linksbündig, vertikal zentriert */}
        <div className="relative z-10 mx-auto max-w-6xl px-6 h-full flex flex-col justify-center pt-16">
          {/* Glass-Panel — robuste Lesbarkeit über jedem Foto */}
          <div className="animate-fade-up max-w-2xl rounded-3xl bg-white/75 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-black/10 px-6 py-7 md:px-8 md:py-9">
            <span className="inline-flex w-fit items-center rounded-full bg-accent/15 px-3 py-1 text-[0.65rem] md:text-xs font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/30">
              Kick · Pact · Impact
            </span>
            <h1 className="animate-fade-up delay-1 mt-3 md:mt-4 font-display font-black text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.02] text-brand-night-navy">
              Wenn die Jungs jubeln,
              <br />
              <span className="text-accent">jubelst du mit.</span>
            </h1>
            <p className="animate-fade-up delay-2 mt-4 md:mt-5 text-base md:text-lg text-brand-night-navy/85 leading-relaxed">
              <strong className="text-brand-night-navy">Du wählst die Beträge selbst.</strong>{" "}
              Zum Beispiel: 3 € wenn Schmidt trifft. 10 € pro Sieg. 20 € pro Comeback. KickPact
              rechnet jedes Spiel automatisch ab.
            </p>
            <div className="animate-fade-up delay-3 mt-5 md:mt-6 flex flex-wrap gap-3">
              <Button variant="accent" size="lg" asChild>
                <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="bg-white/80">
                <Link href="/login">Ich bin schon dabei</Link>
              </Button>
            </div>
            <p className="animate-fade-up delay-4 mt-3 text-xs md:text-sm text-brand-night-navy/60">
              Frei wählbar pro Trigger — von 50 Cent bis 500 € pro Event.
            </p>
          </div>
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
              Echte Geschichten · Beträge frei gewählt
            </span>
            <h2 className="mt-3 font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
              Sponsoring, das <span className="text-accent">eine Geschichte erzählt.</span>
            </h2>
            <p className="mt-2 text-brand-night-navy/70">
              Keine Plakate, keine Trikot-Werbung. Sondern Menschen, die mitfiebern —
              jeder mit seinem eigenen Betrag, frei gewählt. Drei Beispiele aus dem echten Leben:
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <StoryCard
              image={PHOTOS.teamWhiteMixed}
              imageAlt="Mannschaft in weißen KickPact-Trikots jubelt nach Tor"
              kicker="Tante Erna · Familie · Ihre Wahl"
              headline="3 € wenn Schmidt ein Tor schießt."
              body="Sie ist Patentante. Schmidt ist 13, spielt B-Jugend. Sie hat sich für 3 € pro Tor entschieden — könnten auch 1 € oder 20 € sein. Letzte Saison waren&apos;s 87 €. Schmidt hat&apos;s gewusst — und 4 Mal nach dem Tor zu ihr in die Tribüne gewinkt."
            />
            <StoryCard
              image={PHOTOS.teamCelebration}
              imageAlt="SG-Reichenbach-Mannschaft umarmt sich nach Tor"
              kicker="Bäckerei Müller · Business · Sein Setup"
              headline="50 € pro Comeback-Sieg."
              body="Stefan vom Bäcker hat sich bewusst für 50 €/Comeback entschieden — selten genug, dass es nicht ausartet. Über die Saison kommen ~600 € rein. Steuerlich absetzbar als Werbeleistung."
            />
            <StoryCard
              image={PHOTOS.teamGreen}
              imageAlt="TSV-Abtswind-Mannschaft jubelt in grünen Trikots"
              kicker="Onkel Tom · Familie · Seine Wahl"
              headline="10 € pro Kopfballtor."
              body="Toms Spezial-Wette für seinen Neffen. Hat 10 € gewählt — andere geben 5 € oder 25 €. Trainer meldet&apos;s im Bus per Smartphone, Tom bestätigt. Saison-Rechnung listet jedes Kopfballtor mit Datum + Minute."
            />
          </div>
          <p className="mt-8 text-sm text-brand-night-navy/60 text-center max-w-2xl mx-auto">
            <strong>Du legst deinen Betrag selbst fest.</strong> Pro Trigger einzeln, mit optionalem
            Monats-Cap, jederzeit anpassbar. Es gibt keine Mindest-Pledge-Höhe.
          </p>
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
            src={PHOTOS.teamBrandedLine}
            alt="Mannschaft in KickPact-Trikots jubelt in der Reihe"
            fill
            sizes="100vw"
            className="object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-night-navy/30 via-brand-night-navy/20 to-brand-night-navy" />
        </div>
        <div className="mx-auto max-w-6xl px-6 py-14 -mt-12 relative">
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight">
            Was kann ein <span className="text-accent">Pledge</span> sein?
          </h2>
          <p className="mt-2 text-white/80 max-w-2xl text-sm">
            16 Trigger-Typen — vom simplen Tor bis zum Lieblings-Stürmer-Bonus.{" "}
            <strong className="text-white">Beträge unten sind nur Beispiele — du wählst pro Trigger frei zwischen 0,50 € und 500 €.</strong>
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TriggerCard
              emoji="⚽"
              name="Pro Tor"
              examples={["z.B. 5 € · 10 € · 25 €"]}
              auto
            />
            <TriggerCard
              emoji="💚"
              name="Pro Spieler-Tor"
              examples={["z.B. 3 € wenn Schmidt trifft"]}
              auto
              highlight
            />
            <TriggerCard
              emoji="🏆"
              name="Pro Sieg"
              examples={["z.B. 10 € · 25 € · 50 €"]}
              auto
            />
            <TriggerCard
              emoji="🛡️"
              name="Pro Zu-Null"
              examples={["z.B. 5 € · 15 € · 30 €"]}
              auto
            />
            <TriggerCard
              emoji="🔥"
              name="Pro Comeback"
              examples={["z.B. 20 € · 50 € · 100 €"]}
              auto
            />
            <TriggerCard
              emoji="🎯"
              name="Pro Hattrick"
              examples={["z.B. 25 € · 50 € · 100 €"]}
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
              q="Sind die Beträge irgendwie vorgegeben?"
              a="Nein. Beträge sind komplett frei wählbar — von 0,50 € bis 500 € pro Event. Familie nimmt oft 1–5 €/Tor, Unternehmen 25–100 €/Sieg. Im Pledge-Wizard siehst du eine Worst-Case-Hochrechnung, damit du nicht überraschend mehr zahlst als gedacht. Plus optionaler Monats-Cap."
            />
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
          src={image}
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
