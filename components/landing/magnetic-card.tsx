"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Taktile „Hardware"-Card mit zwei Effekten:
 *
 * 1. **Magnetic-Pull** — die Card folgt leicht dem Cursor (max ~8px via
 *    useSpring, nur transform). Gegated hinter `@media (hover:hover) and
 *    (pointer:fine)`: das CSS unten setzt `--mag: 1` nur auf fähigen Geräten,
 *    und wir multiplizieren das Offset damit, sodass Touch-Geräte hart bei 0
 *    bleiben. Zusätzlich respektieren wir reduced-motion (Spring → instant 0).
 *
 * 2. **Double-Bezel** (optional, `bezel`) — äußere Schale (ring + dezenter bg +
 *    p-1.5 + rounded-2xl) um einen inneren Kern (rounded-xl + Inset-Highlight):
 *    der „Gerät in Tray"-Look aus dem high-end-visual-design-Skill.
 *
 * Nur `transform`/`opacity` werden animiert → 60fps auch auf Mobile.
 */
const MAX = 8; // px

export function MagneticCard({
  children,
  className,
  innerClassName,
  bezel = false,
  strength = 1,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  bezel?: boolean;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(relX * MAX * 2 * strength);
    y.set(relY * MAX * 2 * strength);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  const inner = bezel ? (
    <div
      className={cn(
        "h-full rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]",
        innerClassName
      )}
    >
      {children}
    </div>
  ) : (
    children
  );

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x: sx, y: sy }}
      className={cn(
        "magnetic-card",
        bezel && "rounded-2xl p-1.5 ring-1 ring-black/5",
        className
      )}
    >
      {inner}
    </motion.div>
  );
}
