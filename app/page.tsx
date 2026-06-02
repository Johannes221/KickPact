import Link from "next/link";
import Image from "next/image";
import {
  Goal,
  Trophy,
  ArrowUp,
  Pencil,
  UserRound,
  Shield,
  Flame,
  Target,
  Sparkles,
  Gem,
  LifeBuoy,
  Medal,
  Crown,
  ShieldCheck,
  Flag,
  type LucideIcon
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { RolesTabs } from "./_components/roles-tabs";
import { RotatingTrigger } from "@/components/landing/rotating-trigger";
import { MagneticCard } from "@/components/landing/magnetic-card";
import { MagneticCTA } from "@/components/landing/magnetic-cta";

export const metadata = {
  title: "Amateurfußball-Sponsoring, das mitfiebert",
  description:
    "Familie, Freunde und lokale Sponsoren setzen einen Betrag pro Tor, Sieg oder Aufstieg und füllen so die Mannschaftskasse. 100 % bleibt bei der Mannschaft.",
  keywords: [
    "Amateurfußball Sponsoring",
    "Vereinssponsoring Fußball",
    "Sponsor Amateurverein finden",
    "Performance Sponsoring Sport",
    "Fußballverein Sponsor",
  ],
  openGraph: {
    title: "Amateurfußball-Sponsoring, das mitfiebert",
    description:
      "Jedes Tor füllt die Mannschaftskasse. Familie, Freunde und lokale Sponsoren fiebern mit. 100 % bleibt bei der Mannschaft.",
  },
};

// Echte Mannschaftsfotos mit KickPact-Branding (lokale Assets).
const PHOTOS = {
  // Hero: SG Reichenbach #9 mit erhobener Faust, sauberes Jubelfoto
  teamHero: "/brand/photos/team-celebration.png",
  // Mannschaft in KickPact-Trikots (schwarz/grün), Jubelumarmung — Story
  teamCelebration: "/brand/photos/team-branded-line.png",
  // TSV Abtswind, grüne Trikots, Torjubel
  teamGreen: "/brand/photos/team-green.png",
  // Marketing-Mockup mit aufgebranntem "K KICKPACT" — Trigger-Banner-Visual
  teamBrandedLine: "/brand/photos/team-hero.png",
  // Mixed-Ages Team in weißen KickPact-Trikots
  teamWhiteMixed: "/brand/photos/team-white-mixed.png",
  // U17 / Jugend-Mannschaft in weißen KickPact-Trikots, Jubelszene auf Kunstrasen
  teamYouth: "/brand/photos/team-youth.png",
  // Spieler #21 (weißes Trikot) und Sponsor (Nexora-Polo) reichen sich am
  // Spielfeldrand die Hand — Connection zwischen Mannschaft + Förderer.
  playerAndSponsor: "/brand/photos/player-and-sponsor.png"
};

export default function LandingPage() {
  return (
    <main>
      {/* HERO — Foto + Headline. Auf Mobile ist das Foto als "Hero-Image"
          mit aspect-ratio + rounded-bottom dargestellt für softeren visuellen
          Übergang zum Text-Bereich. Auf Desktop bleibt es full-bleed mit
          Gradient links. */}
      <section className="relative w-full overflow-hidden bg-white">
        <div className="relative md:absolute md:inset-0 aspect-[5/4] md:aspect-auto md:h-full md:min-h-0 md:max-h-none overflow-hidden md:rounded-none">
          <Image
            src={PHOTOS.teamHero}
            alt="Amateur-Fußballmannschaft jubelt nach Torerfolg"
            fill
            priority
            sizes="100vw"
            className="object-cover animate-ken-burns"
            style={{ objectPosition: "center 28%" }}
          />
          {/* Mobile: dezenter Top-Wash für Header-Lesbarkeit + früher und
              dichter einsetzender Weiß-Wash in der Textzone, damit der dunkle
              Body-Text Kontrast ≥4.5:1 erreicht (kein harter Cut). */}
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background:
                "linear-gradient(to bottom, rgba(26,26,46,0.35) 0%, rgba(26,26,46,0.05) 12%, rgba(255,255,255,0) 38%, rgba(255,255,255,0.55) 60%, rgba(255,255,255,0.92) 78%, rgba(255,255,255,1) 92%)"
            }}
          />
          {/* Desktop: stark links deckend weiß bis ~50%, dann fade out nach rechts */}
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background:
                "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 32%, rgba(255,255,255,0.7) 48%, rgba(255,255,255,0) 70%)"
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-5 md:px-6 md:absolute md:inset-0 md:flex md:flex-col md:justify-center md:pt-16">
          <div className="max-w-xl md:max-w-2xl -mt-8 md:mt-0 pb-10 md:pb-0 relative">
            <span className="animate-fade-up inline-flex w-fit items-center rounded-full bg-accent/15 px-3 py-1 text-[0.6rem] md:text-xs font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/30 backdrop-blur-sm">
              Performance-Sponsoring · Amateurfußball
            </span>
            <h1 className="animate-fade-up delay-1 mt-3 md:mt-4 font-display font-black text-[length:clamp(2rem,6vw+0.5rem,3.75rem)] leading-[1.1] tracking-tight text-brand-night-navy">
              <span className="block">
                <RotatingTrigger />
              </span>
              füllt die <span className="text-accent">Mannschaftskasse.</span>
            </h1>
            <p className="animate-fade-up delay-2 mt-3 md:mt-5 text-sm md:text-lg text-brand-night-navy/85 leading-relaxed">
              Familie, Freunde, der Bäcker um die Ecke: jeder setzt seinen eigenen Betrag
              pro Tor, Sieg oder Aufstieg. Ihr fiebert gemeinsam mit, die Kasse wächst von
              allein. <strong>100 % bleibt bei der Mannschaft.</strong>
            </p>

            {/* Beispiel-Chips: sofort verständlich wie ein Pact aussieht */}
            <div className="animate-fade-up delay-2 mt-4 md:mt-5 flex flex-wrap gap-1.5 md:gap-2">
              <PledgeChip icon={Goal} amount="3 €" label="pro Tor" />
              <PledgeChip icon={Trophy} amount="50 €" label="pro Sieg" />
              <PledgeChip icon={ArrowUp} amount="200 €" label="pro Aufstieg" />
              <PledgeChip icon={Pencil} amount="frei wählbar" muted />
            </div>

            <div className="animate-fade-up delay-3 mt-5 md:mt-6 flex flex-col sm:flex-row gap-3">
              <MagneticCTA
                href="/signup?role=mannschaft"
                className="w-full sm:w-auto justify-between sm:justify-start"
              >
                Mannschaft anlegen · 30 Tage gratis
              </MagneticCTA>
              <MagneticCTA
                href="/mannschaften"
                variant="outline"
                className="w-full sm:w-auto justify-between sm:justify-start bg-white/80"
              >
                Mannschaften finden
              </MagneticCTA>
            </div>
            <p className="animate-fade-up delay-4 mt-3 text-[0.7rem] md:text-sm text-brand-night-navy/60">
              In 90 Sekunden online. Kein Vertrag. Kein Risiko für deine Mannschaft.
            </p>
          </div>
        </div>

        <div className="hidden md:block md:h-svh md:min-h-[640px] md:max-h-[920px]" aria-hidden />
      </section>

      {/* ECHTE GESCHICHTEN — Image-driven Testimonial-Style. Direkt nach dem Hero:
          die Geschichten sind das emotionale Herz, sie führen die Seite an. */}
      <section className="bg-brand-off-white">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
          <div className="max-w-2xl">
            <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
              Sponsoring, das <span className="text-accent">eine Geschichte erzählt.</span>
            </h2>
            <p className="mt-2 text-sm md:text-base text-brand-night-navy/70">
              Keine Plakate, keine Trikot-Werbung. Sondern Menschen, die mitfiebern: von der
              Bambini-Tante bis zum Bäcker um die Ecke. Jeder mit seinem eigenen Betrag, frei
              gewählt. Vier Beispiele aus dem echten Leben:
            </p>
          </div>

          <div className="mt-6 md:mt-8 grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StoryCard
              image={PHOTOS.teamYouth}
              imageAlt="Jugend-Mannschaft in weißen KickPact-Trikots jubelt nach Tor"
              kicker="Familie Weber · Jugend · Eltern verwalten"
              headline="2 € pro Tor in der C-Jugend."
              body={'Linus spielt U15. Mama hat den Sponsor-Account für die ganze Familie übernommen, Oma, Onkel, Patentante zahlen alle ein, sie behält den Überblick. So funktioniert Familien-Sponsoring auch für Junioren ohne eigene Mail.'}
            />
            <StoryCard
              image={PHOTOS.teamWhiteMixed}
              imageAlt="Mannschaft in weißen KickPact-Trikots jubelt nach Tor"
              kicker="Tante Erna · Familie · Ihre Wahl"
              headline="3 € wenn Schmidt ein Tor schießt."
              body={'Sie ist Patentante. Schmidt ist 13, spielt B-Jugend. Sie hat sich für 3 €/Tor entschieden, könnten auch 1 € oder 20 € sein. Letzte Saison waren’s 87 €. Schmidt hat’s gewusst und 4 Mal nach dem Tor zu ihr gewinkt.'}
            />
            <StoryCard
              image={PHOTOS.teamCelebration}
              imageAlt="SG-Reichenbach-Mannschaft umarmt sich nach Tor"
              kicker="Bäckerei Müller · Business · Sein Setup"
              headline="50 € pro Comeback-Sieg."
              body="Stefan vom Bäcker hat sich bewusst für 50 €/Comeback entschieden, selten genug, dass es nicht ausartet. Steuerlich absetzbar als Werbeleistung, und jedes Comeback-Erlebnis ist ein Aufhänger für ein Kunden-Gespräch."
            />
            <StoryCard
              image={PHOTOS.teamGreen}
              imageAlt="TSV-Abtswind-Mannschaft jubelt in grünen Trikots"
              kicker="Opa Heinz · Saison-Wette · Seine Wahl"
              headline="200 € wenn der Aufstieg klappt."
              body="Heinz fiebert seit 40 Jahren mit. Er hat 200 € auf den Aufstieg gesetzt und 5 € pro Kopfballtor seines Enkels. Saisonende → Rechnung, Geld geht in die Mannschaftskasse."
            />
          </div>
          <p className="mt-6 md:mt-8 text-xs md:text-sm text-brand-night-navy/60 text-center max-w-2xl mx-auto">
            <strong>Du legst deinen Betrag selbst fest.</strong> Pro Trigger einzeln, mit optionalem
            Monats-Cap, jederzeit anpassbar. Es gibt keine Mindest-Pact-Höhe.
          </p>
          <InlineCTA caption="Bereit für eure eigene Story?" />
        </div>
      </section>

      {/* ROLES TABS */}
      <section className="border-y border-brand-neutral/40 bg-brand-night-navy text-white">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-14">
          <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight">
            Was bringt&apos;s <span className="text-accent">dir?</span>
          </h2>
          <p className="mt-2 text-white/60 text-xs md:text-sm">Wähle deine Rolle.</p>
          <div className="mt-5 md:mt-6">
            <RolesTabs />
          </div>
        </div>
      </section>

      {/* BENEFITS — Foto Spieler<>Sponsor + zwei Spalten */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
          <div className="max-w-2xl">
            <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
              Mannschaft trifft <span className="text-accent">Sponsor.</span>
            </h2>
            <p className="mt-2 text-sm md:text-base text-brand-night-navy/70">
              Damit Sponsoring richtig Spaß macht, muss es für beide Seiten passen.
              Was Mannschaften und Sponsoren an KickPact lieben, auf einen Blick.
            </p>
          </div>

          <div className="mt-6 md:mt-10 grid gap-6 md:gap-10 lg:grid-cols-[1.1fr_1fr] items-center">
            {/* Foto — auf Mobile oberhalb, auf Desktop rechts */}
            <div className="relative aspect-[3/2] md:aspect-[4/3] lg:aspect-[3/2] rounded-2xl overflow-hidden order-first lg:order-last">
              <Image
                src={PHOTOS.playerAndSponsor}
                alt="Spieler und Sponsor reichen sich am Spielfeldrand die Hand"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 via-transparent to-transparent" />
            </div>

            {/* Benefits-Liste — 2 Spalten Sponsor + Mannschaft */}
            <div className="grid gap-4 sm:grid-cols-2 lg:order-first">
              <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 md:p-5">
                <div className="text-xs uppercase tracking-[0.15em] font-bold text-accent-dark">
                  Für Sponsoren
                </div>
                <h3 className="mt-1.5 font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
                  Du belohnst nur Erfolge.
                </h3>
                <ul className="mt-3 space-y-2 text-xs md:text-sm text-brand-night-navy/80">
                  <BenefitLi>Beträge frei wählbar: 50 Cent bis 500 € pro Event</BenefitLi>
                  <BenefitLi><strong>100 % gehen direkt an die Mannschaft.</strong> KickPact zwackt nichts ab</BenefitLi>
                  <BenefitLi>Optionaler Monats-Cap, nie Überraschungen</BenefitLi>
                  <BenefitLi>Steuerlich absetzbar als Werbeleistung</BenefitLi>
                  <BenefitLi>Live mitfiebern, jedes Tor zählt</BenefitLi>
                </ul>
              </div>
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 md:p-5">
                <div className="text-xs uppercase tracking-[0.15em] font-bold text-accent-dark">
                  Für die Mannschaft
                </div>
                <h3 className="mt-1.5 font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
                  Mehr Bock auf jeden Spieltag.
                </h3>
                <ul className="mt-3 space-y-2 text-xs md:text-sm text-brand-night-navy/80">
                  <BenefitLi>Onboarding in 90 Sekunden, ein Einladungslink für alle Sponsoren</BenefitLi>
                  <BenefitLi>Familie, Stammtisch + lokale Firmen, alle in einem System</BenefitLi>
                  <BenefitLi>Mannschaftskasse wächst automatisch, Rechnung zum Monatsersten</BenefitLi>
                  <BenefitLi>Performance-Ansporn: jedes Tor zählt direkt</BenefitLi>
                  <BenefitLi>Eigenständig, keine Vorstands-Politik</BenefitLi>
                </ul>
              </div>
            </div>
          </div>
          <InlineCTA caption="Bereit, eure Mannschaftskasse zu füllen?" />
        </div>
      </section>

      {/* SO GEHT'S */}
      <section className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
        <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          So geht&apos;s <span className="text-accent">in 4 Schritten</span>
        </h2>
        <p className="mt-2 text-brand-night-navy/60 text-xs md:text-sm">
          Onboarding bis erste Rechnung: ~5 Minuten plus 4 Wochen Saison.
        </p>
        <div className="mt-6 md:mt-8 grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            num="01"
            title="Mannschaft anlegen"
            body="Magic-Link per Mail, Wizard findet eure Mannschaft automatisch, wählt Plan. Dauert 90 Sekunden. Verein mit mehreren Teams? → Vereinslizenz."
          />
          <Step
            num="02"
            title="Sponsoren einladen"
            body="Du teilst einen Einladungslink: per WhatsApp, Mail, am Stammtisch. Jeder Sponsor legt seine Pacts selbst fest."
          />
          <Step
            num="03"
            title="Spiele werden ausgewertet"
            body="Wir lesen Tore, Siege und Halbzeiten automatisch ein. Spezial-Events (Kopfballtor, Elfmeter) meldet der Trainer per Smartphone."
          />
          <Step
            num="04"
            title="Monats-Rechnung"
            body="Am Monatsersten wandert eine PDF-Rechnung an jeden Sponsor. Mannschaft/Verein zieht das Geld selbst ein, KickPact bleibt Tool."
          />
        </div>
      </section>

      {/* SAISON-WETTEN — eigene Section, Light-Hintergrund, Akzent-Pop */}
      <section className="relative overflow-hidden bg-gradient-to-br from-accent/10 via-white to-accent/5">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[0.65rem] md:text-xs font-bold text-accent-dark ring-1 ring-accent/30">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Neu
            </span>
            <h2 className="mt-3 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
              Nicht nur pro Spiel. <span className="text-accent">Pro Saison.</span>
            </h2>
            <p className="mt-2 text-sm md:text-base text-brand-night-navy/70">
              Eure Saison-Story braucht Spannung? Sponsoren setzen auf das große Ziel:
              Aufstieg, Klassenerhalt, Tabellenplatz. Klappt&apos;s? Mannschaftskasse füllt sich.
              Klappt&apos;s nicht? Auch okay, kein Risiko für Sponsoren.
            </p>
          </div>
          {/* Bewusst ANDERES Layout als die übrigen 4-Spalten-Raster (Steps,
              Trigger, Stories): auf Mobile ein horizontales Snap-Rail zum Wischen,
              auf Desktop ein dichtes asymmetrisches Bento mit zwei breiten
              Hero-Wetten oben. */}
          <div className="mt-6 md:mt-8 -mx-5 md:mx-0">
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 no-scrollbar md:grid md:grid-cols-4 md:gap-4 md:px-0 md:pb-0 md:overflow-visible">
              <SeasonBetCard icon={ArrowUp} name="Aufstieg" example="z.B. 200 €" detail="Wenn am Saison-Ende Platz 1 oder 2" highlight wide />
              <SeasonBetCard icon={LifeBuoy} name="Klassenerhalt" example="z.B. 100 €" detail="Wenn nicht abgestiegen" wide />
              <SeasonBetCard icon={Medal} name="Top 5" example="z.B. 75 €" detail="Wenn End-Tabellenplatz 1–5" />
              <SeasonBetCard icon={Target} name="Platz 5–9" example="z.B. 50 €" detail="Solides Mittelfeld" />
              <SeasonBetCard icon={Crown} name="Meister" example="z.B. 500 €" detail="Nur wenn Tabellenführer am Saisons-Ende" />
              <SeasonBetCard icon={Trophy} name="Pokal-Halbfinale" example="z.B. 150 €" detail="Wenn HF im Verbands-/Kreispokal erreicht" />
              <SeasonBetCard icon={ShieldCheck} name="Kein Abstieg" example="z.B. 80 €" detail="Sicherheits-Polster Variante" />
              <SeasonBetCard icon={Flag} name="Custom-Ziel" example="frei wählbar" detail={'z.B. "20 Tore mehr als letzte Saison"'} />
            </div>
          </div>
          <p className="mt-5 md:mt-6 text-xs md:text-sm text-brand-night-navy/70 max-w-2xl">
            Tabellen-Stände werden automatisch nach Saisonende gewertet.
            Custom-Ziele werden von der Mannschaft gemeldet und vom Sponsor bestätigt, gleicher
            Trust-Mechanismus wie bei Spezial-Events.
          </p>
          <InlineCTA caption="Bringt Spannung in eure Saison." />
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-6xl px-5 md:px-6 py-10 md:py-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
              Faire <span className="text-accent">Preise.</span>
            </h2>
            <p className="mt-2 text-brand-night-navy/60 text-xs md:text-sm max-w-xl">
              Pro Mannschaft eigenständig, oder Vereinslizenz für alle Teams.
              <strong className="text-brand-night-navy"> Erste 30 Tage gratis.</strong>{" "}
              Monatlich kündbar. KickPact zwackt nie was vom Sponsoren-Geld ab.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-[0.7rem] md:text-xs font-bold uppercase tracking-[0.15em] text-accent-dark ring-1 ring-accent/30">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            30 Tage gratis testen
          </span>
        </div>
        <div className="mt-6 md:mt-8 grid gap-4 md:gap-6 md:grid-cols-3">
          <PriceCard
            plan="Basic"
            price="5 €"
            unit="/ Mannschaft / Monat"
            perPlayer="0,23 – 0,50 € pro Spieler/Monat"
            features={[
              "Eine Mannschaft, eigenständig verwaltet",
              "Bis zu 5 Sponsoren",
              "Alle 10 Auto-Trigger (Tor, Sieg, Comeback, …)",
              "Alle 6 manuelle Trigger",
              "Monatliche PDF-Rechnung",
              "30 Tage gratis · monatlich kündbar"
            ]}
          />
          <PriceCard
            plan="Pro"
            price="19 €"
            unit="/ Mannschaft / Monat"
            perPlayer="0,76 – 1,06 € pro Spieler/Monat"
            highlight
            features={[
              "Alles aus Basic",
              "Unlimited Sponsoren",
              "Mannschafts-Logo auf PDF-Rechnungen",
              'Custom Trigger-Texte (z.B. "Bizeps-Tor")',
              "Saison-Wetten (Aufstieg, Klassenerhalt, …)",
              "30 Tage gratis · monatlich kündbar"
            ]}
          />
          <PriceCard
            plan="Vereinslizenz"
            price="49 €"
            unit="/ Verein / Monat"
            perPlayer="bei 4 Teams à 22 Spielern: ~0,56 € pro Spieler"
            features={[
              "Alle Mannschaften des Vereins inklusive",
              "Master-Admin verwaltet alle Teams zentral",
              "Pro-Features für jedes Team",
              "Konsolidierte Vereins-Rechnung",
              "Übergreifende Sponsor-Übersicht",
              "Lohnt ab ~3 Mannschaften"
            ]}
          />
        </div>
        <p className="mt-6 md:mt-8 text-xs md:text-sm text-brand-night-navy/60">
          Die Sponsorengelder gehen zu 100 % an die Mannschaft. KickPact kostet nur eine
          kleine Lizenz, meist weniger, als ein einziger guter Spieltag einbringt.
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-3xl px-5 md:px-6 py-10 md:py-14">
          <h2 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
            Häufige <span className="text-accent">Fragen</span>
          </h2>
          <Accordion type="single" collapsible className="mt-5 md:mt-6">
            <AccordionItem value="was-kann-ein-pact-sein" className="border-brand-neutral/40">
              <AccordionTrigger className="text-left text-brand-night-navy hover:no-underline hover:text-accent">
                Was kann ein Pact alles sein?
              </AccordionTrigger>
              <AccordionContent className="text-brand-night-navy/70 leading-relaxed">
                <p className="mb-4">
                  Vom simplen Tor bis zum Saison-Aufstieg. Die Beträge sind nur Beispiele,
                  du wählst pro Trigger frei zwischen 0,50 € und 500 €.
                </p>
                <div className="rounded-xl bg-brand-night-navy p-4 md:p-5">
                  <div className="grid gap-2.5 md:gap-3 grid-cols-2 lg:grid-cols-4">
                    <TriggerCard icon={Goal} name="Pro Tor" examples={["z.B. 5 € · 10 € · 25 €"]} auto />
                    <TriggerCard icon={UserRound} name="Pro Spieler-Tor" examples={["z.B. 3 € wenn Schmidt trifft"]} auto highlight />
                    <TriggerCard icon={Trophy} name="Pro Sieg" examples={["z.B. 10 € · 25 € · 50 €"]} auto />
                    <TriggerCard icon={Shield} name="Pro Zu-Null" examples={["z.B. 5 € · 15 € · 30 €"]} auto />
                    <TriggerCard icon={Flame} name="Pro Comeback" examples={["z.B. 20 € · 50 € · 100 €"]} auto />
                    <TriggerCard icon={Target} name="Pro Hattrick" examples={["z.B. 25 € · 50 € · 100 €"]} auto />
                    <TriggerCard icon={Sparkles} name="Pro Spezial-Tor" examples={["Kopfball, Volley, Elfmeter"]} />
                    <TriggerCard icon={Gem} name="Custom-Event" examples={["Bizeps-Tor · Trainer-Trinkrunde"]} />
                  </div>
                  <p className="mt-4 text-[0.7rem] md:text-xs text-white/50 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Auto
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/60" /> Mannschaft meldet + Sponsor bestätigt
                    </span>
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
            <FaqItem
              q="Mannschaft oder Verein: was ist der Unterschied?"
              a={'Jede Mannschaft ist bei KickPact eigenständig. Trainer/Betreuer melden sich für ihre Mannschaft an, verwalten Sponsoren und Pacts selbst, keine Vorstands-Politik. Hat dein Verein mehrere Teams (Herren, Jugend, Damen, Senioren) und einen Master-Admin der alles zentral steuern soll, gibt es die Vereinslizenz: 49 €/Monat all-in für alle Mannschaften des Vereins, mit konsolidierter Rechnung und übergreifender Sponsor-Übersicht.'}
            />
            <FaqItem
              q="Sind die Beträge irgendwie vorgegeben?"
              a="Nein. Beträge sind komplett frei wählbar, von 0,50 € bis 500 € pro Event. Familie nimmt oft 1–5 €/Tor, Unternehmen 25–100 €/Sieg. Im Pact-Setup siehst du eine Worst-Case-Hochrechnung, damit du nicht überraschend mehr zahlst als gedacht. Plus optionaler Monats-Cap."
            />
            <FaqItem
              q="Wie funktionieren die Saison-Wetten?"
              a={'Saison-Wetten sind Pacts, die nicht pro Spiel sondern erst am Saisons-Ende abrechnen: z.B. 200 € für Aufstieg, 100 € für Klassenerhalt, 50 € für Platz 1–5. KickPact liest die End-Tabelle automatisch; wenn das Ziel erreicht wurde, geht der volle Betrag an den Verein. Wenn nicht, zahlt der Sponsor nichts.'}
            />
            <FaqItem
              q="Funktioniert das auch für Junioren-Mannschaften?"
              a={'Ja. Solange eure Mannschaft öffentlich gelistet ist, holen wir die Spielergebnisse automatisch. Bei Junioren kannst du einen Elternteil als Sponsor-Manager hinterlegen: er sammelt Pacts von Oma, Onkel, Freunden und behält den Überblick, ohne dass jeder eine eigene Mail-Adresse braucht. Familien-Sponsoring auch ohne Smartphone für Linus aus der C-Jugend.'}
            />
            <FaqItem
              q="Sind die Beträge für den Sponsor steuerlich absetzbar?"
              a="Bei Unternehmens-Sponsoren: ja, als Werbeleistung. KickPact erzeugt eine ordentliche Vereins-Rechnung mit USt-ID (oder §19-Kleinunternehmer-Hinweis). Bei Privatpersonen (Familie, Freunde) gilt der allgemeine Status, keine Steuervorteile, aber auch keine Pflichten."
            />
            <FaqItem
              q="Kann ich einen Pact auf einen bestimmten Spieler binden?"
              a={'Ja. Beispiel: "3 € wenn Schmidt ein Tor schießt." Im Pact-Setup wählst du den Trigger „Tor von Spieler X", suchst den Spieler über das Spielerprofil aus, und KickPact erkennt automatisch nach jedem Spiel ob Schmidt getroffen hat. Bei nicht zuordenbaren Spielern (z.B. Junioren ohne öffentliches Profil) meldet der Trainer manuell.'}
            />
            <FaqItem
              q="Was passiert wenn meine Mannschaft schlecht spielt?"
              a="Sponsoren zahlen weniger. Das ist genau die Idee von Performance-Sponsoring. Im Worst Case (kein Tor, keine Siege) bekommt die Mannschaftskasse gar nichts, aber dann gibt's auch nichts zu feiern."
            />
            <FaqItem
              q="Wie verhindere ich, dass ein Sponsor von einer hohen Rechnung überrascht wird?"
              a='Jeder Pact kann einen optionalen Monats-Cap haben (z.B. "maximal 50 € pro Monat egal was passiert"). Wir empfehlen das aktiv im Pact-Setup. Außerdem zeigt KickPact dem Sponsor immer eine Worst-Case-Schätzung.'
            />
            <FaqItem
              q="Was, wenn der Trainer einen Spezial-Event falsch meldet?"
              a={'Spezial-Events (Kopfballtor, Hackentor, etc.) erscheinen als "pending" beim Sponsor. Er kann bestätigen oder bestreiten. Erst bestätigte Events landen auf der Rechnung. Trust by design.'}
            />
            <FaqItem
              q="Kann ich jederzeit kündigen?"
              a="Ja, das Abo ist monatlich kündbar. Nach Kündigung läuft KickPact noch bis Monatsende weiter. Bestehende Pacts enden zum Saison-Ende; Sponsoren können erneuern."
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
          <div className="absolute top-0 right-0 h-72 md:h-96 w-72 md:w-96 rounded-full bg-accent/15 blur-3xl" aria-hidden />
          <div className="absolute bottom-0 left-0 h-56 md:h-72 w-56 md:w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        </div>
        <div className="relative mx-auto max-w-3xl px-5 md:px-6 py-12 md:py-16 text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.6rem] md:text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/20">
            Kick · Pact · Impact
          </span>
          <h2 className="mt-3 md:mt-4 font-display font-black text-[1.75rem] sm:text-3xl md:text-5xl leading-[1.05] tracking-tight text-brand-night-navy">
            Bereit für mehr
            <br />
            <span className="text-accent">Impact pro Spiel?</span>
          </h2>
          <p className="mt-3 text-sm md:text-base text-brand-night-navy/70 max-w-xl mx-auto">
            30 Tage gratis. Kein Vertrag. Kein Risiko für deine Mannschaft.
          </p>
          <div className="mt-6 md:mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <MagneticCTA
              href="/signup?role=mannschaft"
              className="w-full sm:w-auto justify-between sm:justify-start"
            >
              Mannschaft anlegen
            </MagneticCTA>
            <MagneticCTA
              href="/mannschaften"
              variant="outline"
              className="w-full sm:w-auto justify-between sm:justify-start"
            >
              Mannschaften finden
            </MagneticCTA>
          </div>
        </div>
      </section>

      {/* MINI-FOOTER */}
      <section className="mx-auto max-w-6xl px-5 md:px-6 py-6 md:py-10 text-xs md:text-sm text-brand-night-navy/60">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <Link href="/status" className="hover:text-accent">
            System-Status &amp; Live-Demo →
          </Link>
          <nav className="flex flex-col md:flex-row gap-2 md:gap-4">
            <Link href="/impressum" className="hover:text-accent">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-accent">
              Datenschutz
            </Link>
            <Link href="/agb" className="hover:text-accent">
              AGB
            </Link>
          </nav>
          <span>© {new Date().getFullYear()} KickPact</span>
        </div>
      </section>
    </main>
  );
}

function InlineCTA({
  caption,
  variant = "default"
}: {
  caption: string;
  variant?: "default" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <div
      className={
        "mt-8 md:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 text-center sm:text-left"
      }
    >
      <p
        className={
          "text-sm md:text-base font-semibold " +
          (isDark ? "text-white" : "text-brand-night-navy")
        }
      >
        {caption}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <MagneticCTA href="/signup">Jetzt loslegen · 30 Tage gratis</MagneticCTA>
      </div>
    </div>
  );
}

function PledgeChip({
  icon: Icon,
  amount,
  label,
  muted = false
}: {
  icon: LucideIcon;
  amount: string;
  label?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs md:text-sm font-medium ring-1 backdrop-blur-sm " +
        (muted
          ? "bg-white/60 ring-brand-neutral/60 text-brand-night-navy/70"
          : "bg-white/85 ring-accent/30 text-brand-night-navy")
      }
    >
      <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-accent-dark" aria-hidden />
      <strong className={muted ? "font-semibold" : "font-bold text-accent-dark"}>
        {amount}
      </strong>
      {label && <span className="text-brand-night-navy/70">{label}</span>}
    </span>
  );
}

function BenefitLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0 text-accent mt-0.5"
      >
        <path
          fillRule="evenodd"
          d="M16.704 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <Card className="border-brand-neutral/40 shadow-none hover:border-accent/40 transition-colors">
      <CardContent className="p-4 md:p-6">
        <div className="font-mono text-[0.7rem] md:text-xs text-accent font-bold tracking-widest">{num}</div>
        <h3 className="mt-2 md:mt-3 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
          {title}
        </h3>
        <p className="mt-1.5 md:mt-2 text-xs md:text-sm text-brand-night-navy/70 leading-relaxed">{body}</p>
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
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
        />
      </div>
      <div className="p-4 md:p-6">
        <div className="text-[0.65rem] md:text-xs uppercase tracking-[0.15em] text-accent-dark font-bold">
          {kicker}
        </div>
        <h3 className="mt-2 md:mt-3 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
          {headline}
        </h3>
        <p className="mt-2 md:mt-3 text-xs md:text-sm text-brand-night-navy/70 leading-relaxed">{body}</p>
      </div>
    </article>
  );
}

function TriggerCard({
  icon: Icon,
  name,
  examples,
  auto = false,
  highlight = false
}: {
  icon: LucideIcon;
  name: string;
  examples: string[];
  auto?: boolean;
  highlight?: boolean;
}) {
  // Magnetic-Pull-Card: folgt leicht dem Cursor (nur Maus, max ~8px), bezel-Schale.
  return (
    <MagneticCard
      bezel
      strength={0.85}
      className={
        "h-full bg-white/5 " + (highlight ? "ring-accent/40" : "ring-white/10")
      }
      innerClassName={
        "p-3 md:p-4 transition-colors " +
        (highlight
          ? "bg-accent/15 ring-1 ring-accent/40"
          : "bg-white/[0.06] ring-1 ring-white/10 hover:ring-accent/40")
      }
    >
      <div className="flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-accent">
          <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        </span>
        <span
          className={
            "h-1.5 w-1.5 mt-2 rounded-full " + (auto ? "bg-accent" : "bg-white/60")
          }
          title={auto ? "Auto" : "Manuell"}
        />
      </div>
      <div className="mt-2 md:mt-3 font-display font-black text-xs md:text-sm tracking-tight text-white">
        {name}
      </div>
      <div className="mt-1 text-[0.65rem] md:text-xs text-white/70 leading-snug">{examples.join(" · ")}</div>
    </MagneticCard>
  );
}

function SeasonBetCard({
  icon: Icon,
  name,
  example,
  detail,
  highlight = false,
  wide = false
}: {
  icon: LucideIcon;
  name: string;
  example: string;
  detail: string;
  highlight?: boolean;
  wide?: boolean;
}) {
  // Magnetic-Pull-Card; folgt leicht dem Cursor (nur Maus, max ~8px).
  return (
    <MagneticCard
      className={
        "shrink-0 w-[68vw] max-w-[16rem] snap-start rounded-xl border p-3 md:w-auto md:max-w-none md:p-4 transition-colors " +
        (wide ? "md:col-span-2 " : "") +
        (highlight
          ? "border-accent bg-accent/10"
          : "border-brand-neutral/40 bg-white hover:border-accent/50")
      }
    >
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent-dark">
          <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        </span>
        <div className="text-[0.65rem] md:text-xs font-bold text-accent-dark">{example}</div>
      </div>
      <div className="mt-2 md:mt-3 font-display font-black text-sm md:text-base tracking-tight text-brand-night-navy">
        {name}
      </div>
      <div className="mt-1 text-[0.65rem] md:text-xs text-brand-night-navy/60 leading-snug">{detail}</div>
    </MagneticCard>
  );
}

function PriceCard({
  plan,
  price,
  unit,
  perPlayer,
  features,
  highlight
}: {
  plan: string;
  price: string;
  unit: string;
  perPlayer?: string;
  features: string[];
  highlight?: boolean;
}) {
  // Double-Bezel „Hardware"-Card mit Magnetic-Pull; CTA ist ein Button-in-Button
  // mit magnetischem Trailing-Icon.
  return (
    <MagneticCard
      bezel
      strength={0.6}
      className={
        "h-full " +
        (highlight ? "bg-accent/10 ring-accent/30" : "bg-brand-night-navy/[0.03] ring-black/5")
      }
      innerClassName={
        "p-6 md:p-8 ring-1 " +
        (highlight ? "bg-accent/5 ring-accent/30" : "bg-white ring-brand-neutral/40")
      }
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {plan}
        </h3>
        {highlight && (
          <span className="rounded-full bg-accent text-white text-[0.55rem] md:text-[0.6rem] uppercase tracking-widest font-bold px-2 py-1">
            empfohlen
          </span>
        )}
      </div>
      <div className="mt-4 md:mt-6 flex items-baseline gap-2">
        <span className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          {price}
        </span>
        <span className="text-xs md:text-sm text-brand-night-navy/60">{unit}</span>
      </div>
      {perPlayer && (
        <p className="mt-1.5 text-[0.7rem] md:text-xs font-semibold text-accent-dark">
          ≈ {perPlayer}
        </p>
      )}
      <ul className="mt-4 md:mt-6 space-y-2 md:space-y-2.5 text-xs md:text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-brand-night-navy/80">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0 text-accent mt-0.5"
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
      <div className="mt-6 md:mt-8">
        <MagneticCTA
          href={signupHrefForPlan(plan)}
          variant={highlight ? "accent" : "outline"}
          className="w-full justify-between"
        >
          Mit {plan} starten
        </MagneticCTA>
      </div>
    </MagneticCard>
  );
}

/**
 * Maps the marketing-Plan-Label auf den richtigen Signup-Role-Param. Vereinslizenz
 * adressiert einen Verein-mit-mehreren-Mannschaften, alles andere ist Single-Mannschaft.
 */
function signupHrefForPlan(plan: string): string {
  if (plan.toLowerCase().startsWith("verein")) {
    return "/signup?role=verein";
  }
  return "/signup?role=mannschaft";
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
