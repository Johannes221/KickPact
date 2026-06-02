"use client";

/**
 * App-Intro-Wizard (WS-8) — Einstieg der nativen iOS-App statt der
 * Marketing-Landingpage. Foto-getrieben (Full-Bleed-Hero + Bold-Type), on-brand.
 * 3 Slides Value-Prop, BEWUSST ohne Preise/Stripe (Apple-Anti-Steering), skippable.
 *
 * Returnende ausgeloggte Nutzer überspringen die Slides automatisch
 * (localStorage `kp_intro_seen`) → direkt Login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const INTRO_SEEN_KEY = "kp_intro_seen";

const SLIDES = [
  {
    image: "/brand/photos/team-hero.png",
    title: "Performance-Sponsoring\nfür deinen Verein",
    body: "Lokale Sponsoren unterstützen deine Mannschaft — leistungsbasiert, fair und transparent."
  },
  {
    image: "/brand/photos/team-celebration.png",
    title: "Pro Tor.\nPro Sieg.\nPro Aufstieg.",
    body: "Sponsoren versprechen Beträge pro Ereignis. Spieldaten und Vereinsmeldungen werden automatisch erfasst."
  },
  {
    image: "/brand/photos/player-and-sponsor.png",
    title: "100 % bleibt\nbei der Mannschaft",
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

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-brand-night-navy">
      <Image
        src={slide.image}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Lesbarkeits-Gradient: unten satt Navy → oben transparent */}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/65 to-brand-night-navy/10" />

      <div className="relative flex min-h-[100dvh] flex-col pt-safe pb-safe text-white">
        <div className="flex items-center justify-between px-5 pt-3">
          <Image src="/brand/mark-white.png" alt="KickPact" width={34} height={34} priority />
          <Button
            variant="ghost"
            size="sm"
            onClick={finish}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            Überspringen
          </Button>
        </div>

        <div className="flex-1" />

        <div className="px-6">
          <h1 className="whitespace-pre-line font-display text-[2.6rem] font-black leading-[1.03] tracking-tight">
            {slide.title}
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white/75">
            {slide.body}
          </p>
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-7" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-7 bg-accent" : "w-2 bg-white/30"
              }`}
            />
          ))}
        </div>

        <div className="px-6 pb-4">
          <Button
            variant="accent"
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-black/20"
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          >
            {isLast ? "Los geht’s" : "Weiter"}
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
