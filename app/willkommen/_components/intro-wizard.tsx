"use client";

/**
 * App-Intro-Wizard (WS-8) — der Einstieg der nativen iOS-App statt der
 * Marketing-Landingpage. 3 Slides Value-Prop (BEWUSST ohne Preise/Stripe →
 * Apple-Anti-Steering), skippable, danach Login.
 *
 * Returnende ausgeloggte Nutzer überspringen die Slides automatisch
 * (localStorage-Flag `kp_intro_seen`) → direkt Login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight, Target, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const INTRO_SEEN_KEY = "kp_intro_seen";

const SLIDES = [
  {
    icon: Target,
    title: "Performance-Sponsoring\nfür deinen Verein",
    body: "Lokale Sponsoren unterstützen deine Mannschaft — leistungsbasiert, fair und transparent."
  },
  {
    icon: Zap,
    title: "Pro Tor. Pro Sieg.\nPro Aufstieg.",
    body: "Sponsoren versprechen Beträge pro Ereignis. Spieldaten und Vereinsmeldungen werden automatisch erfasst."
  },
  {
    icon: ShieldCheck,
    title: "100 % bleibt\nbei der Mannschaft",
    body: "Kein Take, keine versteckten Kosten. In rund 90 Sekunden startklar."
  }
];

export function IntroWizard() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Schon gesehen? → Slides überspringen, direkt zum Login.
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
      // localStorage kann im WebView restriktiv sein — Flag ist nur Komfort.
    }
    router.push("/login");
  }

  // Verhindert kurzes Aufblitzen der Slides, falls schon gesehen.
  if (!ready) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Icon = slide.icon;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-off-white pt-safe pb-safe">
      <div className="flex justify-end px-5 pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={finish}
          className="text-brand-night-navy/50"
        >
          Überspringen
        </Button>
      </div>

      <div className="flex justify-center pt-2">
        <Image
          src="/brand/logo-navy-stacked.png"
          alt="KickPact"
          width={150}
          height={88}
          priority
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/10 text-accent">
          <Icon className="h-10 w-10" strokeWidth={2} aria-hidden />
        </span>
        <h1 className="whitespace-pre-line font-display text-3xl font-black leading-tight tracking-tight text-brand-night-navy">
          {slide.title}
        </h1>
        <p className="mt-4 max-w-xs text-base leading-relaxed text-brand-night-navy/60">
          {slide.body}
        </p>
      </div>

      <div className="flex justify-center gap-2 pb-6" aria-hidden>
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-accent" : "w-2 bg-brand-night-navy/15"
            }`}
          />
        ))}
      </div>

      <div className="px-6 pb-4">
        <Button
          variant="accent"
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-bold"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
        >
          {isLast ? "Los geht’s" : "Weiter"}
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
