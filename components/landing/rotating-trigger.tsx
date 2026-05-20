"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cycelt durch die wichtigsten Pledge-Trigger-Typen — visualisiert sofort:
 * "es geht um Spielereignisse, von Tor bis Aufstieg". Animation: Emoji
 * poppt rein (Scale + Rotate), Wort fliegt von unten rein.
 *
 * Tempo: ~2.2s pro Trigger. Reduced-motion User bekommen statisches
 * "Jedes Tor".
 */
const TRIGGERS = [
  { emoji: "⚽", word: "Jedes Tor" },
  { emoji: "🏆", word: "Jeder Sieg" },
  { emoji: "🛡️", word: "Jedes Zu-Null" },
  { emoji: "⬆️", word: "Jeder Aufstieg" },
  { emoji: "🎯", word: "Jeder Hattrick" },
  { emoji: "🔥", word: "Jedes Comeback" },
  { emoji: "💎", word: "Jedes Spezial-Tor" }
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

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2 md:gap-3 align-baseline whitespace-nowrap",
        className
      )}
    >
      <span
        key={`emoji-${idx}`}
        className={cn(
          "inline-block translate-y-[0.05em]",
          !prefersReducedMotion && "animate-trigger-pop"
        )}
        aria-hidden
      >
        {current.emoji}
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
