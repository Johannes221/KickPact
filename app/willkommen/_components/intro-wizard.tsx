"use client";

/**
 * App-Intro-Wizard — helles, natives iOS-Onboarding.
 *
 * 5 Slides, je EINE Botschaft (Reduktion):
 *   1. Was ist KickPact (Hook + Value-Prop)
 *   2. Du bestimmst den Betrag (Meilenstein-Beispiel)
 *   3. So einfach läuft's (Features gebündelt)
 *   4. Was es bringt (Benefits für Mannschaften UND Sponsoren)
 *   5. 30 Tage gratis testen (Trial-Angebot, risikofrei)
 *
 * Light-Theme, System-Font (native-shell), Safe-Area, skippable. Returnende
 * Nutzer überspringen automatisch (localStorage) → Login.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Target,
  Trophy,
  Rocket,
  Users,
  HandCoins,
  Check,
  Gift,
  ShieldCheck,
  Coins,
  type LucideIcon
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { BrandBackdrop, type BrandBackdropVariant } from "@/components/shared/brand-backdrop";

const INTRO_SEEN_KEY = "kp_intro_seen";

// ── Slide-Bausteine ─────────────────────────────────────────────────────────

function SlideTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="title-wrap whitespace-pre-line text-[2.1rem] font-extrabold leading-[1.05] tracking-tight text-brand-night-navy">
      {children}
    </h1>
  );
}

function SlideBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 max-w-sm text-[17px] leading-relaxed text-brand-night-navy/55">
      {children}
    </p>
  );
}

const EVENT_WORDS = [
  "Jedes Tor",
  "Jeder Sieg",
  "Jeder Aufstieg",
  "Jeder Hattrick",
  "Jeder Assist",
  "Jedes Zu-Null"
] as const;

/** Rotierendes Ereignis-Wort, das hereinfliegt (Marken-Motion). */
function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setI((p) => (p + 1) % EVENT_WORDS.length),
      1900
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <span key={i} className="animate-trigger-fly inline-block text-accent">
      {EVENT_WORDS[i]}
    </span>
  );
}

/** Eine Wert-Pill (Icon + Text) — füllt den Raum unter dem Intro mit Substanz. */
function ValuePill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-brand-neutral/30 bg-white px-4 py-2.5 text-[15px] font-semibold text-brand-night-navy/80 shadow-[0_4px_14px_-8px_rgba(1,196,87,0.35)]">
      <Icon className="h-[1.15rem] w-[1.15rem] shrink-0 text-accent" strokeWidth={2.3} aria-hidden />
      {children}
    </span>
  );
}

/** Slide 1 — Hook: jedes Ereignis wird zu Geld (rotierend, ohne Logo-Kasten). */
function SlideIntro() {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="title-wrap whitespace-pre-line text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-brand-night-navy">
        <RotatingWord />
        {"\nwird zu Geld."}
      </h1>
      <SlideBody>
        Sponsoren versprechen einen Betrag pro Ereignis — KickPact lädt sie
        automatisch nach Spielende.
      </SlideBody>
      <div className="mt-9 flex flex-col items-stretch gap-3">
        <ValuePill icon={ShieldCheck}>100 % bleibt bei eurer Mannschaft</ValuePill>
        <ValuePill icon={Coins}>Ab unter 1 € pro Spieler/Monat</ValuePill>
      </div>
    </div>
  );
}

type Milestone = { icon: LucideIcon; label: string; amount: string };
const MILESTONES: Milestone[] = [
  { icon: Target, label: "Pro Tor", amount: "3 €" },
  { icon: Trophy, label: "Pro Sieg", amount: "50 €" },
  { icon: Rocket, label: "Pro Aufstieg", amount: "200 €" }
];

/** Slide 2 — Meilenstein-Beispiel: du bestimmst den Betrag. */
function SlideAmount() {
  return (
    <div className="w-full">
      <SlideTitle>{"Zum\nBeispiel."}</SlideTitle>
      <SlideBody>
        Sponsoren legen fest, was ihnen ein Tor, Sieg oder Aufstieg wert ist.
      </SlideBody>
      <div className="mt-8 space-y-3">
        {MILESTONES.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="flex items-center gap-4 rounded-2xl border border-brand-neutral/30 bg-white p-3.5"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="flex-1 text-[17px] font-semibold text-brand-night-navy/80">
                {m.label}
              </span>
              <span className="text-2xl font-extrabold tracking-tight text-accent">
                {m.amount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Step = { title: string; body: string };
const STEPS: Step[] = [
  { title: "Mannschaft anlegen", body: "In wenigen Schritten startklar." },
  { title: "Mannschaft verifizieren", body: "Kurzer Nachweis — einmalig." },
  { title: "Spiele laden automatisch", body: "Nach Spielende ziehen wir Tore, Siege & Co." },
  { title: "Sponsoren einladen", body: "Ein Link für Familie, Stammtisch & Fans." },
  { title: "Ereignisse werden verrechnet", body: "Die Kasse füllt sich von allein — 100 % für euch." }
];

/** Slide 3 — echter Ablauf in 4 Schritten (Timeline). */
function SlideHowItWorks() {
  return (
    <div className="w-full">
      <SlideTitle>{"So läuft's."}</SlideTitle>
      <ol className="mt-7 space-y-1">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-white">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <span className="my-1 w-px flex-1 bg-accent/25" aria-hidden />
              )}
            </div>
            <div className="min-w-0 pb-5">
              <div className="text-[17px] font-semibold text-brand-night-navy">
                {s.title}
              </div>
              <div className="text-[15px] leading-snug text-brand-night-navy/55">
                {s.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type BenefitCard = { icon: LucideIcon; audience: string; points: string[] };
const BENEFITS: BenefitCard[] = [
  {
    icon: Users,
    audience: "Für Mannschaften",
    points: [
      "100 % bleibt bei euch — kein Abzug",
      "Kasse wächst automatisch, ohne Aufwand",
      "Eigenständig — keine Vorstands-Politik",
      "Live mitfiebern: jedes Tor zählt"
    ]
  },
  {
    icon: HandCoins,
    audience: "Für Sponsoren",
    points: [
      "Zahl nur, wenn das Team wirklich liefert",
      "Frei wählbar: 0,50 € bis 500 € pro Event",
      "Optionaler Monats-Cap, nie Überraschungen",
      "Zahlungsübersicht am Monatsende, 100 % ans Team"
    ]
  }
];

/** Slide 4 — Benefits beidseitig. */
function SlideBenefits() {
  return (
    <div className="w-full">
      <SlideTitle>{"Vorteile für\nbeide Seiten."}</SlideTitle>
      <div className="mt-6 space-y-3">
        {BENEFITS.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.audience}
              className="rounded-2xl border border-brand-neutral/30 bg-white p-4"
            >
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.2} aria-hidden />
                </span>
                <span className="text-[15px] font-bold text-brand-night-navy">
                  {b.audience}
                </span>
              </div>
              <ul className="space-y-1.5">
                {b.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <span className="text-[14px] leading-snug text-brand-night-navy/70">
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TRIAL_POINTS = [
  "Alle Features frei",
  "Jederzeit kündbar",
  "Ohne Kreditkarte"
] as const;

/** Slide 5 — Trial-Angebot: 30 Tage gratis, risikofrei. */
function SlideTrial() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-8 grid h-24 w-24 place-items-center rounded-[2rem] bg-accent shadow-[0_18px_40px_-12px_rgba(1,196,87,0.55)]">
        <Gift className="h-11 w-11 text-white" strokeWidth={2} aria-hidden />
      </span>
      <SlideTitle>{"30 Tage\ngratis testen."}</SlideTitle>
      <SlideBody>
        Voller Funktionsumfang, keine Kreditkarte nötig. Danach weniger als 1 €
        pro Spieler im Monat.
      </SlideBody>
      <ul className="mt-8 w-full max-w-xs space-y-3 text-left">
        {TRIAL_POINTS.map((p) => (
          <li
            key={p}
            className="flex items-center gap-3 rounded-2xl border border-brand-neutral/30 bg-white p-3.5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <Check className="h-5 w-5" strokeWidth={2.6} aria-hidden />
            </span>
            <span className="text-[16px] font-semibold text-brand-night-navy/80">
              {p}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SLIDES: ReadonlyArray<{ id: string; render: () => ReactNode }> = [
  { id: "intro", render: () => <SlideIntro /> },
  { id: "amount", render: () => <SlideAmount /> },
  { id: "how", render: () => <SlideHowItWorks /> },
  { id: "benefits", render: () => <SlideBenefits /> },
  { id: "trial", render: () => <SlideTrial /> }
];

// ── Wizard ──────────────────────────────────────────────────────────────────

export function IntroWizard() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  // Live-Drag-Offset (px) während des Wischens — echtes natives Swipe-Gefühl.
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);
  const [bgVariant, setBgVariant] = useState<BrandBackdropVariant>("dots");

  useEffect(() => {
    if (window.localStorage.getItem(INTRO_SEEN_KEY)) {
      router.replace("/login");
      return;
    }
    const bg = new URLSearchParams(window.location.search).get("bg");
    if (bg === "blobs" || bg === "net" || bg === "waves" || bg === "dots") setBgVariant(bg);
    setReady(true);
  }, [router]);

  function finish() {
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // localStorage im WebView ggf. restriktiv — Flag ist nur Komfort.
    }
    router.push("/login");
  }

  const goTo = (i: number) =>
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    setDrag(e.touches[0].clientX - startX.current);
  }
  function onTouchEnd() {
    if (startX.current === null) return;
    if (drag <= -60) goTo(index + 1);
    else if (drag >= 60) goTo(index - 1);
    startX.current = null;
    setDrag(0);
  }

  if (!ready) return null;

  const isLast = index === SLIDES.length - 1;

  return (
    <div className="native-shell relative flex min-h-[100dvh] flex-col overflow-hidden bg-white pt-safe pb-safe text-brand-night-navy">
      <BrandBackdrop variant={bgVariant} />
      {/* Header: Logo + Überspringen */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-4">
        <Logo variant="full" href={null} className="h-5 w-auto" />
        <button
          type="button"
          onClick={finish}
          className="-mr-2 rounded-lg px-2 py-1 text-sm font-medium text-brand-night-navy/45 active:text-brand-night-navy/70"
        >
          Überspringen
        </button>
      </header>

      {/* Slide-Inhalt als wischbarer Carousel-Track (Live-Finger-Tracking). */}
      <div
        className="relative z-10 flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(-${index * 100}% + ${drag}px))`,
            transition:
              drag === 0
                ? "transform 0.35s cubic-bezier(0.22,1,0.36,1)"
                : "none"
          }}
        >
          {SLIDES.map((s) => (
            <div
              key={s.id}
              className="flex h-full w-full shrink-0 flex-col justify-center overflow-y-auto px-7 py-6"
            >
              {s.render()}
            </div>
          ))}
        </div>
      </div>

      {/* Footer: Progress-Bar (volle Breite, segmentiert) + CTA */}
      <footer className="relative z-10 space-y-6 px-6 pb-4 pt-6">
        <div
          className="flex w-full gap-1.5"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={SLIDES.length}
          aria-label={`Schritt ${index + 1} von ${SLIDES.length}`}
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Zu Schritt ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= index ? "bg-accent" : "bg-brand-night-navy/15"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isLast ? finish() : goTo(index + 1))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-white shadow-[0_10px_30px_-8px_rgba(1,196,87,0.5)] transition-transform active:scale-[0.98]"
        >
          {isLast ? "Los geht's" : "Weiter"}
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </footer>
    </div>
  );
}
