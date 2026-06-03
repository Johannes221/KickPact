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
    // Zeilen-Abstand der Wellen-Strähnen + Dot-Schritt entlang einer Strähne.
    const rowGap = 18;
    const dx = 7;
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
      // Jede Zeile ist eine kohärent undulierende Wellen-Strähne aus Dots.
      // Die Strähnen teilen sich die Wellen, sind aber per Zeilen-Phase (s)
      // versetzt → sie überlagern/kreuzen sich zu einem fließenden Mesh.
      for (let baseY = -rowGap; baseY <= h + rowGap; baseY += rowGap) {
        const s = baseY / rowGap;
        // Amplitude alterniert pro Zeile → benachbarte Strähnen divergieren.
        const amp = 10 + 10 * Math.sin(s * 0.5);
        for (let x = -dx; x <= w + dx; x += dx) {
          // Große Phasen-Verschiebung pro Zeile (s * 0.45) + weite, langsam
          // sweepende Welle → die Strähnen kreuzen sich ineinander = Netz.
          const phase = x * 0.011 + t * 0.5 + s * 0.45;
          const wave =
            Math.sin(phase) * amp +
            Math.sin(x * 0.005 - t * 0.32 + s * 0.25) * 16;
          const py = baseY + wave;

          // Nach oben ausblenden (unten dichtes Netz, oben frei für Text).
          const vfade = Math.min(1, Math.max(0, (py / h - 0.08) / 0.9));
          if (vfade <= 0) continue;
          // Wellenkamm → Helligkeit/Größe (durchlaufende Ridges).
          const crest = 0.5 + 0.5 * Math.sin(phase);
          const alpha = vfade * (0.1 + crest * 0.26);
          if (alpha <= 0.015) continue;

          const r = 0.75 + crest * 0.85;
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
