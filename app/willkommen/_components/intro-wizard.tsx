"use client";

/**
 * App-Intro-Wizard (WS-8) — premium iOS-Onboarding für die native App.
 *
 * Type-/Brand-getrieben (kein Foto-Full-Bleed): dunkles Navy, crisper grüner
 * Marken-Mark als Motiv, große Display-Headlines, Eyebrow-Chip, segmentierte
 * Progress-Bar, Accent-CTA. BEWUSST ohne Preise (Apple-Anti-Steering), skippable.
 *
 * Returnende ausgeloggte Nutzer überspringen automatisch (localStorage) → Login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Target, TrendingUp, ShieldCheck, type LucideIcon } from "lucide-react";

const INTRO_SEEN_KEY = "kp_intro_seen";

type Slide = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: Target,
    eyebrow: "Performance-Sponsoring",
    title: "Sponsoring,\ndas mitspielt.",
    body: "Lokale Sponsoren unterstützen deine Mannschaft — leistungsbasiert, fair und transparent."
  },
  {
    icon: TrendingUp,
    eyebrow: "Vollautomatisch",
    title: "Pro Tor.\nPro Sieg.\nPro Aufstieg.",
    body: "Sponsoren versprechen Beträge pro Ereignis. Spieldaten werden automatisch erfasst."
  },
  {
    icon: ShieldCheck,
    eyebrow: "Fair & transparent",
    title: "100 % bleibt\nim Verein.",
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
  const Icon = slide.icon;

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-brand-night-navy pt-safe pb-safe text-white">
      {/* Brand-Motiv: großer grüner Mark, crisp (hochauflösend), dezent */}
      <Image
        src="/brand/mark-green.png"
        alt=""
        width={420}
        height={420}
        priority
        className="pointer-events-none absolute -right-24 -top-20 w-[420px] max-w-none opacity-[0.07]"
      />
      {/* Accent-Glow */}
      <div className="pointer-events-none absolute -right-10 top-0 h-72 w-72 rounded-full bg-accent/25 blur-[120px]" />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 pt-4">
        <Image src="/brand/mark-white.png" alt="KickPact" width={30} height={30} priority />
        <button
          type="button"
          onClick={finish}
          className="-mr-2 rounded-lg px-2 py-1 text-sm font-medium text-white/55 active:text-white/80"
        >
          Überspringen
        </button>
      </header>

      {/* Inhalt — unten ausgerichtet, große Typo */}
      <main className="relative flex flex-1 flex-col justify-end px-6 pb-2">
        <div className="mb-6 inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3.5 py-1.5 backdrop-blur-sm">
          <Icon className="h-4 w-4 text-accent" strokeWidth={2.5} aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/80">
            {slide.eyebrow}
          </span>
        </div>
        <h1 className="whitespace-pre-line font-display text-[2.75rem] font-black leading-[0.98] tracking-tight">
          {slide.title}
        </h1>
        <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-white/60">{slide.body}</p>
      </main>

      {/* Footer — segmentierte Progress + CTA */}
      <footer className="relative space-y-7 px-6 pb-3 pt-8">
        <div className="flex gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= index ? "bg-accent" : "bg-white/15"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-white shadow-[0_10px_34px_-6px_rgba(34,197,94,0.55)] transition-transform active:scale-[0.98]"
        >
          {isLast ? "Los geht’s" : "Weiter"}
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </footer>
    </div>
  );
}
