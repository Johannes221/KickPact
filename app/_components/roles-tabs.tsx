"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function RolesTabs() {
  return (
    <Tabs defaultValue="verein" className="w-full">
      <TabsList className="bg-white/10 border border-white/20 p-1 h-auto">
        <TabsTrigger
          value="verein"
          className="data-[state=active]:bg-accent data-[state=active]:text-white text-white/70 px-6 py-2.5 font-semibold"
        >
          🏟️  Du bist Verein
        </TabsTrigger>
        <TabsTrigger
          value="sponsor"
          className="data-[state=active]:bg-accent data-[state=active]:text-white text-white/70 px-6 py-2.5 font-semibold"
        >
          💚  Du bist Sponsor
        </TabsTrigger>
      </TabsList>

      <TabsContent value="verein" className="mt-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-3 space-y-5">
            <h3 className="font-display font-black text-3xl md:text-4xl tracking-tight">
              Aus jedem Spiel <span className="text-accent">echtes Sponsoring</span>.
            </h3>
            <p className="text-white/80 leading-relaxed">
              Klassisches Trikot-Sponsoring ist mühsam: einmal verkaufen, dann Stille. Mit
              KickPact wird jeder Spieltag zur Sponsoren-Touchpoint — und dein Verein
              bekommt nicht 1× im Jahr ein Trikot bezahlt, sondern jede Saison über deine
              Performance Geld rein.
            </p>
            <ul className="space-y-3 text-white/80">
              <Bullet>
                Vereins-Onboarding in 90 Sekunden — wir finden dich auf Fußball.de.
              </Bullet>
              <Bullet>
                Sponsoren über einen Einladungslink — Familie, Freunde, Trikot-Sponsoren,
                Stammtisch. Alle in einem System.
              </Bullet>
              <Bullet>
                Vollautomatische Auswertung jedes Spiels — du machst nichts außer
                Spezial-Events nach dem Schlusspfiff melden (30 Sek am Smartphone).
              </Bullet>
              <Bullet>
                PDF-Rechnungen mit Vereins-Briefkopf + USt — fertig zum Versenden.
              </Bullet>
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="accent" size="lg" asChild>
                <Link href="/signup">Verein anlegen · 30 Tage gratis</Link>
              </Button>
            </div>
          </div>
          <div className="md:col-span-2">
            <ExampleCard
              title="Beispiel-Saison"
              subtitle="1. Herren · 18 Spiele"
              lines={[
                { label: "Tante Erna", value: "5 € pro Tor · 10 € pro Sieg" },
                { label: "Bäckerei Müller", value: "20 € pro Comeback · 50 € pro Sieg" },
                { label: "Onkel Tom", value: "10 € pro Spezial-Tor" },
                { label: "8 weitere Sponsoren", value: "diverse Pledges" }
              ]}
              total="≈ 4.300 € / Saison"
              hint="Bei ⌀ 2 Toren pro Spiel & 60% Win-Quote"
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="sponsor" className="mt-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-3 space-y-5">
            <h3 className="font-display font-black text-3xl md:text-4xl tracking-tight">
              Jedes Tor wird zum <span className="text-accent">geilen Moment</span>.
            </h3>
            <p className="text-white/80 leading-relaxed">
              Du willst den Verein deines Sohnes, deiner Tochter oder die Mannschaft aus
              der Nachbarschaft unterstützen — aber 200 € einmal überweisen ist langweilig.
              Du willst mitfiebern. Mit KickPact versprichst du Beträge an Spielereignisse.
              Je besser sie spielen, desto mehr fließt.
            </p>
            <ul className="space-y-3 text-white/80">
              <Bullet>
                Frei wählbare Pledges — von „5 € pro Tor" bis „50 € pro Comeback-Sieg" ist
                alles drin.
              </Bullet>
              <Bullet>
                Sicher mit Cap: optional „max 50 € pro Monat" — du behältst die Kontrolle,
                egal wie geil die Mannschaft drauf ist.
              </Bullet>
              <Bullet>
                Spezial-Events bestätigst du selbst (Verein meldet, du klickst „Bestätigen"
                oder „Bestreiten").
              </Bullet>
              <Bullet>
                Als Unternehmen: ordentliche Rechnung vom Verein — steuerlich absetzbar als
                Werbeleistung.
              </Bullet>
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="accent" size="lg" asChild>
                <Link href="/login">Einladungslink bekommen? Login →</Link>
              </Button>
              <p className="text-xs text-white/50 pt-3 w-full">
                Sponsoren werden vom Verein eingeladen — keine direkte Anmeldung nötig.
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
      <div className="mt-5 pt-4 border-t border-white/20">
        <div className="font-display font-black text-2xl tracking-tight text-accent">
          {total}
        </div>
        {hint && <p className="mt-1 text-xs text-white/50">{hint}</p>}
      </div>
    </div>
  );
}
