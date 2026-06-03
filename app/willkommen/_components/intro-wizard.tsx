"use client";

/**
 * App-Intro-Wizard — helles, natives iOS-Onboarding.
 *
 * 4 Slides, je EINE Botschaft (Reduktion):
 *   1. Was ist KickPact (Hook + Value-Prop)
 *   2. Du bestimmst den Betrag (Meilenstein-Beispiel)
 *   3. So einfach läuft's (Features gebündelt)
 *   4. Was es bringt (Benefits für Mannschaften UND Sponsoren)
 *
 * Light-Theme, System-Font (native-shell), Safe-Area, skippable. Returnende
 * Nutzer überspringen automatisch (localStorage) → Login.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Target,
  Trophy,
  Rocket,
  Zap,
  ShieldCheck,
  Clock,
  Users,
  HandCoins,
  Check,
  type LucideIcon
} from "lucide-react";
import { Logo } from "@/components/shared/logo";

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

/** Slide 1 — Hook: was ist KickPact. */
function SlideIntro() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-8 grid h-24 w-24 place-items-center rounded-[2rem] bg-accent shadow-[0_18px_40px_-12px_rgba(1,196,87,0.55)]">
        <Logo variant="mark" inverted href={null} />
      </span>
      <SlideTitle>{"Sponsoring,\ndas mitfiebert."}</SlideTitle>
      <SlideBody>
        KickPact macht jedes Tor, jeden Sieg und jeden Aufstieg zu echter
        Unterstützung für deine Mannschaft.
      </SlideBody>
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
      <SlideTitle>{"Du bestimmst\nden Betrag."}</SlideTitle>
      <SlideBody>
        Sponsoren versprechen einen Betrag pro Ereignis — 100 % bleibt bei der
        Mannschaft.
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

type Feature = { icon: LucideIcon; title: string; body: string };
const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: "Automatisch erfasst",
    body: "Spieldaten & Meldungen rechnen wir automatisch ab."
  },
  {
    icon: ShieldCheck,
    title: "Fair & transparent",
    body: "Kein Take, keine versteckten Kosten."
  },
  {
    icon: Clock,
    title: "In 90 Sekunden startklar",
    body: "Einrichten und loslegen — ohne Technik-Stress."
  }
];

/** Slide 3 — Features gebündelt. */
function SlideFeatures() {
  return (
    <div className="w-full">
      <SlideTitle>{"So einfach\nläuft's."}</SlideTitle>
      <div className="mt-8 space-y-5">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon className="h-[1.4rem] w-[1.4rem]" strokeWidth={2.1} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[17px] font-semibold text-brand-night-navy">
                  {f.title}
                </div>
                <div className="text-[15px] leading-snug text-brand-night-navy/55">
                  {f.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type BenefitCard = { icon: LucideIcon; audience: string; points: string[] };
const BENEFITS: BenefitCard[] = [
  {
    icon: Users,
    audience: "Für Mannschaften",
    points: [
      "Geld für jedes Tor, jeden Sieg, jeden Aufstieg",
      "100 % bleibt bei euch — kein Abzug",
      "Null Aufwand: läuft vollautomatisch"
    ]
  },
  {
    icon: HandCoins,
    audience: "Für Sponsoren",
    points: [
      "Zahl nur, wenn das Team wirklich liefert",
      "Volle Transparenz über jeden Cent",
      "Zeig Flagge für deinen Verein vor Ort"
    ]
  }
];

/** Slide 4 — Benefits beidseitig. */
function SlideBenefits() {
  return (
    <div className="w-full">
      <SlideTitle>{"Gemacht für\nbeide Seiten."}</SlideTitle>
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

const SLIDES: ReadonlyArray<{ id: string; render: () => ReactNode }> = [
  { id: "intro", render: () => <SlideIntro /> },
  { id: "amount", render: () => <SlideAmount /> },
  { id: "features", render: () => <SlideFeatures /> },
  { id: "benefits", render: () => <SlideBenefits /> }
];

// ── Wizard ──────────────────────────────────────────────────────────────────

export function IntroWizard() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(INTRO_SEEN_KEY)) {
      router.replace("/login");
      return;
    }
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

  if (!ready) return null;

  const isLast = index === SLIDES.length - 1;

  return (
    <div className="native-shell flex min-h-[100dvh] flex-col bg-white pt-safe pb-safe text-brand-night-navy">
      {/* Header: Logo + Überspringen */}
      <header className="flex items-center justify-between px-6 pt-4">
        <Logo variant="full" href={null} className="h-5 w-auto" />
        <button
          type="button"
          onClick={finish}
          className="-mr-2 rounded-lg px-2 py-1 text-sm font-medium text-brand-night-navy/45 active:text-brand-night-navy/70"
        >
          Überspringen
        </button>
      </header>

      {/* Slide-Inhalt */}
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-7 py-6">
        {SLIDES[index].render()}
      </div>

      {/* Footer: Progress-Dots + CTA */}
      <footer className="space-y-6 px-6 pb-4 pt-6">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={SLIDES.length}
          aria-label={`Schritt ${index + 1} von ${SLIDES.length}`}
        >
          {SLIDES.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index
                  ? "w-8 bg-accent"
                  : i < index
                    ? "w-1.5 bg-accent/40"
                    : "w-1.5 bg-brand-night-navy/15"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-white shadow-[0_10px_30px_-8px_rgba(1,196,87,0.5)] transition-transform active:scale-[0.98]"
        >
          {isLast ? "Los geht's" : "Weiter"}
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </footer>
    </div>
  );
}
