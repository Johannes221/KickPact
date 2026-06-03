"use client";

import { useEffect, useRef } from "react";

/**
 * WaveDots — fließendes grünes Punkt-Wellenfeld (Canvas). Ein Raster feiner
 * Dots wird von mehreren wandernden Sinuswellen verschoben & in der Helligkeit
 * moduliert → smooth durchlaufende Wellenbänder. Unten dichter/heller, nach oben
 * ausgeblendet, damit zentrierter Content lesbar bleibt.
 *
 * Performance: ein Canvas, requestAnimationFrame, DPR-gecappt. Bei
 * `prefers-reduced-motion` wird nur EIN statischer Frame gezeichnet.
 */
export function WaveDots({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Non-null-typisierte Consts, damit das Narrowing in den Closures hält.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const spacing = 22;
    let w = 0;
    let h = 0;
    let raf = 0;

    function resize() {
      const rect = canvas.parentElement?.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
      h = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(tms: number) {
      const t = tms / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let x = -spacing; x <= w + spacing; x += spacing) {
        for (let y = -spacing; y <= h + spacing; y += spacing) {
          // Primäres, leicht diagonal wanderndes Wellenband + organische Overlays
          const phase = x * 0.011 + y * 0.004 + t * 0.7;
          const wave =
            Math.sin(phase) * 16 +
            Math.sin((x * 0.5 + y) * 0.012 - t * 0.5) * 10 +
            Math.cos((x - y) * 0.009 + t * 0.45) * 7;
          const py = y + wave;

          // Nach oben ausblenden (unten dichtes Feld, oben frei für Text)
          const vfade = Math.min(1, Math.max(0, (py / h - 0.18) / 0.8));
          if (vfade <= 0) continue;
          // Wellenkamm → Helligkeit (durchlaufende Ridges)
          const crest = 0.5 + 0.5 * Math.sin(phase);
          const alpha = vfade * (0.10 + crest * 0.45);
          if (alpha <= 0.015) continue;

          const r = 1 + crest * 1.1;
          ctx.beginPath();
          ctx.arc(x, py, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(1, 196, 87, ${alpha})`;
          ctx.fill();
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`absolute inset-0 h-full w-full ${className}`}
    />
  );
}
