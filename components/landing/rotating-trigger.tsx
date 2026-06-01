"use client";

import { useEffect, useState } from "react";
import {
  Goal,
  Trophy,
  Shield,
  ArrowUp,
  Target,
  Flame,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cycelt durch die wichtigsten Pledge-Trigger-Typen — visualisiert sofort:
 * "es geht um Spielereignisse, von Tor bis Aufstieg". Animation: Icon
 * poppt rein (Scale + Rotate), Wort fliegt von unten rein.
 *
 * Tempo: ~2.2s pro Trigger. Reduced-motion User bekommen statisches
 * "Jedes Tor".
 */
const TRIGGERS: { Icon: LucideIcon; word: string }[] = [
  { Icon: Goal, word: "Jedes Tor" },
  { Icon: Trophy, word: "Jeder Sieg" },
  { Icon: Shield, word: "Jedes Zu-Null" },
  { Icon: ArrowUp, word: "Jeder Aufstieg" },
  { Icon: Target, word: "Jeder Hattrick" },
  { Icon: Flame, word: "Jedes Comeback" },
  { Icon: Sparkles, word: "Jedes Spezial-Tor" }
];

export function RotatingTrigger({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const tick = setInterval(() => {
      setIdx((prev) => (prev + 1) % TRIGGERS.length);
    }, 2200);
    return () => clearInterval(tick);
  }, [prefersReducedMotion]);

  const current = TRIGGERS[idx];
  const Icon = current.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 md:gap-3 align-baseline whitespace-nowrap",
        className
      )}
    >
      <span
        key={`emoji-${idx}`}
        className={cn(
          "inline-flex translate-y-[0.05em] text-accent",
          !prefersReducedMotion && "animate-trigger-pop"
        )}
        aria-hidden
      >
        <Icon className="h-[0.85em] w-[0.85em]" strokeWidth={2.5} />
      </span>
      <span
        key={`word-${idx}`}
        className={cn("inline-block", !prefersReducedMotion && "animate-trigger-fly")}
      >
        {current.word}
      </span>
    </span>
  );
}
