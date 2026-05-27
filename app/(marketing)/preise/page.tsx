import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

import { PricingToggle } from "./_components/pricing-toggle";

export const metadata = {
  title: "Preise & Pakete – Vereinssponsoring ohne versteckte Kosten",
  description:
    "Transparente Preise für Amateurfußball-Sponsoring: 0 % Provision auf Pledges, " +
    "Saison-Pass mit 2 Monaten geschenkt, ab 5 €/Mannschaft/Monat. " +
    "Weniger als 1 € pro Spieler im Monat.",
  keywords: [
    "Vereinssponsoring Kosten",
    "Amateurfußball Sponsoring Preis",
    "Sponsor Amateurverein günstig",
  ],
};

// ---------------------------------------------------------------------------
// Page-Level Daten: Vereinslizenz-Math, Per-Player-Pricing, FAQ.
// ---------------------------------------------------------------------------

const CLUB_BREAKEVEN_ROWS: ReadonlyArray<{
  teams: number;
  proMonthly: number;
  vereinMonthly: number;
  savings: number;
  highlight?: boolean;
}> = [
  { teams: 2, proMonthly: 38, vereinMonthly: 49, savings: -11 },
  { teams: 3, proMonthly: 57, vereinMonthly: 49, savings: 8, highlight: true },
  { teams: 4, proMonthly: 76, vereinMonthly: 49, savings: 27 },
  { teams: 6, proMonthly: 114, vereinMonthly: 49, savings: 65 },
  { teams: 10, proMonthly: 190, vereinMonthly: 49, savings: 141 }
];

const PER_PLAYER_ROWS: ReadonlyArray<{
  players: number;
  perPlayer: string;
  label?: string;
}> = [
  { players: 30, perPlayer: "1,63 €" },
  {
    players: 50,
    perPlayer: "0,98 €",
    label: "Unter 1 € pro Spieler"
  },
  { players: 100, perPlayer: "0,49 €" },
  { players: 200, perPlayer: "0,25 €" }
];

const FAQ_ITEMS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Was passiert in der Sommerpause (Juni/Juli)?",
    a: "Beim Saison-Pass wird die Subscription automatisch von 1. Juni bis 31. Juli pausiert — kein €, kein Crawler, deine Daten bleiben sichtbar. Zum 1. August läuft alles automatisch wieder an. Beim Annual-Plan läuft die Saison durch, sinnvoll für Hallenfußball oder ganzjährige Setups."
  },
  {
    q: "Was wenn ich mitten in der Saison einsteige?",
    a: "Bis zum 5. Spieltag der laufenden Saison kannst du den Saison-Pass zum vollen Preis buchen. Danach gibt es nur noch Monatsabo — der nächste Saison-Pass startet zum 1. Juli für die kommende Saison. Kein Pro-Rated: simpel, fair, kein Last-Minute-Gaming."
  },
  {
    q: "Kann ich Saison-Wetten später noch anlegen?",
    a: "Saison-Wetten (Aufstieg, Klassenerhalt, Tabellenplatz …) sind nur bis zum 5. Spieltag buchbar — danach ist es Insider-Spiel, kein Sponsoring. Bestehende Wetten bleiben aktiv, neue erst wieder zur nächsten Saison ab Juli."
  },
  {
    q: "Was ist der Unterschied Saison-Pass vs. Annual?",
    a: "Saison-Pass läuft 10 Monate (Aug–Mai) aktiv + 2 Monate kostenlos pausiert, ist pro aktivem Monat günstiger. Annual läuft 12 Monate durch, lohnt sich wenn auch im Sommer Matches stattfinden (Hallenfußball, Veteranen-Turniere)."
  },
  {
    q: "Kann ich monatlich kündigen?",
    a: "Monatsabo: jederzeit zum Ende des Abrechnungsmonats. Saison-Pass: bis 1. Juli für die kommende Saison, sonst läuft er automatisch um eine Saison weiter. Annual: 30 Tage vor Laufzeit-Ende."
  },
  {
    q: "Wann lohnt sich die Vereinslizenz?",
    a: "Ab 3 Mannschaften: mathematisch günstiger als 3× Pro (49 € vs. 57 €). Plus Master-Cockpit, Sammelrechnung, Cross-Team-Sponsor-View. Bei 50 Spielern bist du unter 1 € pro Spieler — bei 200 Spielern bei 0,25 €."
  },
  {
    q: "Wirklich 0 % Provision auf Pledges?",
    a: "Ja, in allen Tarifen. KickPact stellt die Plattform und wickelt Tracking, PDF-Rechnungen und Sponsor-Inbox ab — finanziert wird das über die Lizenzgebühr. Was Sponsoren versprechen, kommt 1:1 bei eurer Mannschaft an."
  },
  {
    q: "Was ist mit der Umsatzsteuer?",
    a: "Alle Preise zzgl. 19 % USt. Auf der Rechnung wird die USt. separat ausgewiesen. Vereine ohne Vorsteuerabzug zahlen brutto, gewerbliche Sponsoren können die USt. ihrer eigenen Pledges geltend machen."
  },
  {
    q: "Was passiert wenn ich von Basic auf Pro upgrade?",
    a: "Sofort: Sponsor- und Pledge-Rule-Caps fallen weg, Saison-Wetten + Custom-Trigger werden freigeschaltet, dein Vereins-Logo erscheint auf der nächsten PDF-Rechnung. Bestehende Pledges laufen unverändert weiter, beim Monatsabo wird pro-rated abgerechnet."
  },
  {
    q: "Was passiert bei einem Disput?",
    a: "Sponsoren bestätigen oder bestreiten jedes Event innerhalb von 7 Tagen. Bei Streit erscheinen Event-Beweise (Spielnachweis, ggf. Trainer-Foto), und der Verein kann den Pledge stornieren. Monats-Rechnung wird erst danach final erstellt — kein Geld fließt für strittige Events."
  }
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PreisePage() {
  return (
    <main>
      {/* HERO + PRICING (kompakt, Pricing direkt sichtbar) */}
      <section className="relative overflow-hidden bg-white">
        <div
          className="absolute inset-0 bg-gradient-to-br from-accent/10 via-white to-accent/5"
          aria-hidden
        />
        <div
          className="absolute top-0 right-0 h-56 md:h-72 w-56 md:w-72 rounded-full bg-accent/15 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl px-5 md:px-6 pt-6 md:pt-10 pb-12 md:pb-16">
          {/* Minimaler Hero — Pricing direkt darunter */}
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-[0.6rem] md:text-xs font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/30">
              0 % Provision
            </span>
            <h1 className="mt-3 font-display font-black text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight text-brand-night-navy">
              100 % der Einnahmen{" "}
              <span className="text-accent">gehen an euch.</span>
            </h1>
            <p className="mt-3 text-sm md:text-base text-brand-night-navy/70 max-w-xl mx-auto">
              30 Tage kostenlos testen — ohne Kreditkarte.
            </p>
          </div>

          {/* Pricing-Toggle + Cards + Matrix direkt darunter */}
          <div className="mt-6 md:mt-8">
            <PricingToggle />
          </div>
        </div>
      </section>

      {/* CLUB MATH BLOCK */}
      <section className="bg-brand-off-white border-y border-brand-neutral/40">
        <div className="mx-auto max-w-6xl px-5 md:px-6 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-brand-night-navy/70 ring-1 ring-brand-neutral/40">
              Vereinslizenz-Mathematik
            </span>
            <h2 className="mt-4 font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
              Wann lohnt sich die{" "}
              <span className="text-accent">Vereinslizenz?</span>
            </h2>
            <p className="mt-3 text-sm md:text-base text-brand-night-navy/65">
              Ab 3 Mannschaften ist die Vereinslizenz günstiger als Pro × n —
              plus Master-Cockpit und Sammelrechnung.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:gap-8 md:grid-cols-2">
            {/* Break-Even-Tabelle */}
            <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6">
              <h3 className="font-display font-black text-lg text-brand-night-navy">
                Break-Even pro Monatsabo
              </h3>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                Pro × n Mannschaften vs. Vereinslizenz (49 €/Mon)
              </p>
              <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-brand-neutral/30">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-brand-off-white text-[0.65rem] uppercase tracking-wider text-brand-night-navy/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">
                        Teams
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Pro × n
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Verein
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Ersparnis
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLUB_BREAKEVEN_ROWS.map((row) => (
                      <tr
                        key={row.teams}
                        className={
                          row.highlight
                            ? "bg-accent/10 font-semibold"
                            : "border-t border-brand-neutral/25"
                        }
                      >
                        <td className="px-3 py-2.5 text-brand-night-navy">
                          {row.teams}
                          {row.highlight && (
                            <span className="ml-1.5 text-[0.55rem] uppercase tracking-wider text-accent-dark">
                              Break-Even
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-brand-night-navy/80">
                          {row.proMonthly} €
                        </td>
                        <td className="px-3 py-2.5 text-right text-brand-night-navy/80">
                          {row.vereinMonthly} €
                        </td>
                        <td
                          className={
                            "px-3 py-2.5 text-right font-bold " +
                            (row.savings >= 0
                              ? "text-accent-dark"
                              : "text-brand-night-navy/50")
                          }
                        >
                          {row.savings >= 0
                            ? `+${row.savings} €`
                            : `${row.savings} €`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-Player-Tabelle */}
            <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6">
              <h3 className="font-display font-black text-lg text-brand-night-navy">
                Per-Player-Pricing
              </h3>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                Vereinslizenz (49 €/Mon) geteilt durch Spieler-Anzahl
              </p>
              <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-brand-neutral/30">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-brand-off-white text-[0.65rem] uppercase tracking-wider text-brand-night-navy/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">
                        Vereinsgröße
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        € / Spieler / Monat
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PER_PLAYER_ROWS.map((row) => {
                      const highlight = row.players === 50;
                      return (
                        <tr
                          key={row.players}
                          className={
                            highlight
                              ? "bg-accent/10 font-semibold"
                              : "border-t border-brand-neutral/25"
                          }
                        >
                          <td className="px-3 py-2.5 text-brand-night-navy">
                            {row.players} Spieler
                            {row.label && (
                              <span className="ml-1.5 text-[0.55rem] uppercase tracking-wider text-accent-dark">
                                {row.label}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-brand-night-navy">
                            {row.perPlayer}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[0.7rem] text-brand-night-navy/55">
                Typischer Verein mit Senioren + 3 Jugend-Mannschaften ≈ 80–120
                Spieler.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 md:px-6 py-14 md:py-20">
        <div className="text-center">
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
            Häufige <span className="text-accent">Fragen</span>
          </h2>
          <p className="mt-3 text-sm md:text-base text-brand-night-navy/65">
            Noch was offen? <Link href="mailto:hallo@kickpact.de" className="text-accent-dark font-semibold underline-offset-4 hover:underline">Mail an hallo@kickpact.de</Link> — wir antworten innerhalb von 24 h.
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-10">
          {FAQ_ITEMS.map((item, idx) => (
            <AccordionItem
              key={item.q}
              value={`q-${idx}`}
              className="border-brand-neutral/40"
            >
              <AccordionTrigger className="text-left font-semibold text-brand-night-navy hover:no-underline hover:text-accent-dark">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-brand-night-navy/75 leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="mt-10 text-center text-xs md:text-sm text-brand-night-navy/55 leading-relaxed">
          Alle Preise zzgl. USt. (19 %). Monatlich kündbar. Saison-Pass mit
          ~22 % Rabatt vs. Monatsabo (~2 Monate geschenkt). Sommerpause Juni/Juli
          kostenlos.
        </p>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden bg-white border-t border-brand-neutral/40">
        <div
          className="absolute inset-0 bg-gradient-to-br from-accent/15 via-white to-accent/5"
          aria-hidden
        />
        <div
          className="absolute top-0 right-0 h-72 md:h-96 w-72 md:w-96 rounded-full bg-accent/15 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl px-5 md:px-6 py-14 md:py-20 text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-accent-dark ring-1 ring-accent/20">
            30 Tage gratis · Keine Kreditkarte
          </span>
          <h2 className="mt-4 font-display font-black text-3xl sm:text-4xl md:text-5xl leading-[1.05] tracking-tight text-brand-night-navy">
            Bereit für euer
            <br />
            <span className="text-accent">erstes Sponsoring?</span>
          </h2>
          <p className="mt-4 text-sm md:text-base text-brand-night-navy/70 max-w-xl mx-auto">
            In 90 Sekunden online. Kein Vertrag. Kein Risiko für deine
            Mannschaft.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="accent"
              size="lg"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/onboarding/mannschaft/verein">
                Kostenlos starten
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/">Mehr erfahren</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
