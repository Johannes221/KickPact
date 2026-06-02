"use client";

/**
 * App-Intro-Wizard (WS-8) — helles, premium iOS-Onboarding (Variante 4).
 *
 * Light-Theme: weißer Hintergrund, KICKPACT-Wordmark, Meilenstein-Illustration
 * (Tor/Sieg/Aufstieg = Sponsoren-Pledge-Beträge = Produkt-Value-Prop, KEIN
 * Abo-Preis → Apple-Anti-Steering nicht betroffen). Skippable.
 *
 * Returnende ausgeloggte Nutzer überspringen automatisch (localStorage) → Login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Target, Trophy, Rocket, Zap, ShieldCheck, type LucideIcon } from "lucide-react";

const INTRO_SEEN_KEY = "kp_intro_seen";

type Milestone = { icon: LucideIcon; label: string; amount: string };
const MILESTONES: Milestone[] = [
  { icon: Target, label: "Pro Tor", amount: "3 €" },
  { icon: Trophy, label: "Pro Sieg", amount: "50 €" },
  { icon: Rocket, label: "Pro Aufstieg", amount: "200 €" }
];

type Slide = {
  kind: "hero" | "plain";
  icon?: LucideIcon;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    kind: "hero",
    title: "Du bestimmst\nden Betrag.",
    body: "Sponsoren versprechen einen Betrag pro Ereignis. 100 % bleibt bei der Mannschaft."
  },
  {
    kind: "plain",
    icon: Zap,
    title: "Vollautomatisch\nerfasst.",
    body: "Spieldaten und Vereinsmeldungen werden automatisch abgerechnet — kein manueller Aufwand."
  },
  {
    kind: "plain",
    icon: ShieldCheck,
    title: "Fair &\ntransparent.",
    body: "Kein Take, keine versteckten Kosten. In rund 90 Sekunden startklar."
  }
];

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

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const PlainIcon = slide.icon;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white pt-safe pb-safe text-brand-night-navy">
      {/* Header: Wordmark + Überspringen */}
      <header className="flex items-center justify-between px-6 pt-4">
        <Image
          src="/brand/logo-navy-horizontal.png"
          alt="KickPact"
          width={150}
          height={20}
          className="h-5 w-auto"
          priority
        />
        <button
          type="button"
          onClick={finish}
          className="-mr-2 rounded-lg px-2 py-1 text-sm font-medium text-brand-night-navy/45 active:text-brand-night-navy/70"
        >
          Überspringen
        </button>
      </header>

      {/* Visual */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {slide.kind === "hero" ? (
          <MilestonePath />
        ) : (
          PlainIcon && (
            <span className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-accent/10 text-accent">
              <PlainIcon className="h-11 w-11" strokeWidth={2} aria-hidden />
            </span>
          )
        )}
      </div>

      {/* Text */}
      <div className="px-7">
        <h1 className="whitespace-pre-line font-display text-[2.6rem] font-black leading-[1.0] tracking-tight">
          {slide.title}
        </h1>
        <p className="mt-3.5 max-w-sm text-[17px] leading-relaxed text-brand-night-navy/55">
          {slide.body}
        </p>
      </div>

      {/* Footer: Dots + CTA */}
      <footer className="space-y-6 px-6 pb-4 pt-8">
        <div className="flex gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-8 bg-accent" : "w-1.5 bg-brand-night-navy/12"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-white shadow-[0_10px_30px_-8px_rgba(1,196,87,0.5)] transition-transform active:scale-[0.98]"
        >
          {isLast ? "Los geht’s" : "Weiter"}
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </footer>
    </div>
  );
}

/** Meilenstein-Pfad: Tor → Sieg → Aufstieg mit gestrichelter Verbindung. */
function MilestonePath() {
  return (
    <div className="relative w-full max-w-xs py-2">
      {MILESTONES.map((m, i) => {
        const Icon = m.icon;
        const last = i === MILESTONES.length - 1;
        return (
          <div key={m.label} className="relative flex items-center gap-4 pb-7 last:pb-0">
            {/* gestrichelte Verbindungslinie */}
            {!last && (
              <span
                className="absolute left-7 top-14 h-7 w-px border-l-2 border-dashed border-accent/35"
                aria-hidden
              />
            )}
            <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Icon className="h-7 w-7" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="flex flex-1 items-baseline justify-between border-b border-brand-neutral/40 pb-3">
              <span className="text-base font-semibold text-brand-night-navy/80">{m.label}</span>
              <span className="font-display text-2xl font-black tracking-tight text-accent">
                {m.amount}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
