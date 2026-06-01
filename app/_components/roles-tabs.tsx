"use client";

import Link from "next/link";
import { Goal, HandCoins } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function RolesTabs() {
  return (
    <Tabs defaultValue="verein" className="w-full">
      <TabsList className="bg-white/10 border border-white/20 p-1 h-auto">
        <TabsTrigger
          value="verein"
          className="data-[state=active]:bg-accent data-[state=active]:text-white text-white/70 px-4 sm:px-6 py-2.5 font-semibold text-xs sm:text-sm"
        >
          <span className="inline-flex items-center gap-1.5">
            <Goal className="h-4 w-4" aria-hidden />
            Du bist Mannschaft
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="sponsor"
          className="data-[state=active]:bg-accent data-[state=active]:text-white text-white/70 px-4 sm:px-6 py-2.5 font-semibold text-xs sm:text-sm"
        >
          <span className="inline-flex items-center gap-1.5">
            <HandCoins className="h-4 w-4" aria-hidden />
            Du bist Sponsor
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="verein" className="mt-6 md:mt-8">
        <div className="grid gap-6 md:gap-10 md:grid-cols-5">
          <div className="md:col-span-3 space-y-4 md:space-y-5">
            <h3 className="font-display font-black text-xl md:text-3xl lg:text-4xl tracking-tight">
              Aus jedem Spiel <span className="text-accent">eure Mannschaftskasse</span>.
            </h3>
            <p className="text-white/80 leading-relaxed text-sm md:text-base">
              Klassisches Trikot-Sponsoring ist mühsam: einmal verkaufen, dann Stille. Mit
              KickPact wird jeder Spieltag zur Sponsoren-Touchpoint — und eure Mannschaft
              bekommt nicht 1× im Jahr ein Trikot bezahlt, sondern jede Saison über eure
              Performance Geld direkt in die eigene Kasse.
            </p>
            <ul className="space-y-2.5 md:space-y-3 text-white/80 text-sm md:text-base">
              <Bullet>
                Mannschafts-Onboarding in 90 Sekunden — wir finden eure Mannschaft automatisch.
              </Bullet>
              <Bullet>
                Sponsoren über einen Einladungslink — Familie, Freunde, Stammtisch,
                lokale Firmen. Alle in einem System.
              </Bullet>
              <Bullet>
                Vollautomatische Auswertung jedes Spiels — ihr macht nichts außer
                Spezial-Events nach Schlusspfiff melden (30 Sek am Smartphone).
              </Bullet>
              <Bullet>
                Geld geht direkt an eure Mannschaftskasse — nicht in den Vereins-Topf.
                Mehrere Teams im Verein? Vereinslizenz wählen.
              </Bullet>
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="accent" size="lg" asChild>
                <Link href="/signup?role=mannschaft">Mannschaft anlegen · 30 Tage gratis</Link>
              </Button>
            </div>
          </div>
          <div className="md:col-span-2">
            <ExampleCard
              title="Beispiel-Pacts"
              subtitle="1. Herren · so könnte's aussehen"
              lines={[
                { label: "Tante Erna", value: "5 €/Tor · 10 €/Sieg" },
                { label: "Bäckerei Müller", value: "20 €/Comeback · 50 €/Sieg" },
                { label: "Opa Heinz", value: "200 € auf Aufstieg" },
                { label: "Onkel Tom", value: "10 €/Spezial-Tor" }
              ]}
              total="Pacts frei wählbar"
              hint="Jeder Sponsor wählt selbst — von 50 Cent bis 500 € pro Event"
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="sponsor" className="mt-6 md:mt-8">
        <div className="grid gap-6 md:gap-10 md:grid-cols-5">
          <div className="md:col-span-3 space-y-4 md:space-y-5">
            <h3 className="font-display font-black text-xl md:text-3xl lg:text-4xl tracking-tight">
              Jedes Tor wird zum <span className="text-accent">geilen Moment</span>.
            </h3>
            <p className="text-white/80 leading-relaxed text-sm md:text-base">
              Du willst die Mannschaft deines Sohnes, deiner Tochter oder das Team aus
              der Nachbarschaft unterstützen — aber 200 € einmal überweisen ist langweilig.
              Du willst mitfiebern. Mit KickPact versprichst du Beträge an Spielereignisse.
              Je besser sie spielen, desto mehr fließt — direkt in ihre Mannschaftskasse.
            </p>
            <ul className="space-y-2.5 md:space-y-3 text-white/80 text-sm md:text-base">
              <Bullet>
                Frei wählbare Pacts — von „1 € pro Tor" bis „50 € pro Comeback-Sieg" ist
                alles drin.
              </Bullet>
              <Bullet>
                Sicher mit Cap: optional „max 50 € pro Monat" — du behältst die Kontrolle.
              </Bullet>
              <Bullet>
                100 % geht direkt an die Mannschaft — KickPact zwackt nichts ab.
              </Bullet>
              <Bullet>
                Als Unternehmen: ordentliche Rechnung — steuerlich absetzbar als
                Werbeleistung.
              </Bullet>
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="accent" size="lg" asChild>
                <Link href="/signup?role=sponsor">Als Sponsor registrieren →</Link>
              </Button>
              <p className="text-xs text-white/50 pt-3 w-full">
                Schon einen Einladungslink? Einfach öffnen — wir leiten dich automatisch ans
                richtige Sponsor-Setup weiter.
              </p>
            </div>
          </div>
          <div className="md:col-span-2">
            <ExampleCard
              title="Beispiel-Spiel"
              subtitle="FC Test 3:1 (HZ 0:1)"
              lines={[
                { label: "3× Tor à 5 €", value: "15 €" },
                { label: "1× Sieg", value: "10 €" },
                { label: "1× Comeback", value: "20 €" },
                { label: "2× Schmidt-Tor à 3 €", value: "6 €" }
              ]}
              total="51 € · für ein Spiel"
              hint="Mit Cap kannst du das jederzeit deckeln"
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent">
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

function ExampleCard({
  title,
  subtitle,
  lines,
  total,
  hint
}: {
  title: string;
  subtitle: string;
  lines: { label: string; value: string }[];
  total: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/5 p-6 backdrop-blur">
      <div className="text-xs uppercase tracking-widest text-accent font-bold">{title}</div>
      <div className="mt-1 text-sm text-white/60">{subtitle}</div>
      <ul className="mt-5 space-y-2 text-sm">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3">
            <span className="text-white/70">{l.label}</span>
            <span className="text-white font-mono tabular-nums text-right">{l.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 md:mt-5 pt-3 md:pt-4 border-t border-white/20">
        <div className="font-display font-black text-lg md:text-2xl tracking-tight text-accent">
          {total}
        </div>
        {hint && <p className="mt-1 text-xs text-white/50">{hint}</p>}
      </div>
    </div>
  );
}
