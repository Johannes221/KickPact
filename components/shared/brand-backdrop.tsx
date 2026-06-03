import { WaveDots } from "@/components/shared/wave-dots";

/**
 * Brand-Backdrop — dezenter, animierter grüner Hintergrund für Onboarding-/
 * Welcome-Screens. `prefers-reduced-motion` friert die Bewegung ein. Liegt
 * absolut hinter dem Content (z-0); der Aufrufer setzt Content auf `relative z-10`.
 *
 * Varianten:
 *   - "dots"  → fließendes grünes Punkt-Wellenfeld (Canvas, Default)
 *   - "waves" → fließende grüne Wellenlinien, die scrollen
 *   - "net"   → driftendes grünes Netz-Grid
 *   - "blobs" → langsam schwebende grüne Mesh-Gradient-Blobs
 */
export type BrandBackdropVariant = "dots" | "waves" | "net" | "blobs";

const ACCENT = "1, 196, 87"; // #01C457

// Periodische Sinus-Welle (eine volle Periode pro 1200px Kachel → nahtloses
// horizontales Scrollen via background-position). stroke-width parametrisiert.
function waveUrl(strokeWidth: number) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='340' viewBox='0 0 1200 340' preserveAspectRatio='none'><path d='M0 170 C 200 60 400 60 600 170 C 800 280 1000 280 1200 170' fill='none' stroke='#01C457' stroke-width='${strokeWidth}' stroke-linecap='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const WAVE_LAYERS: {
  top: string;
  sw: number;
  opacity: number;
  anim: string;
}[] = [
  { top: "16%", sw: 2, opacity: 0.18, anim: "animate-wave-fast" },
  { top: "30%", sw: 4, opacity: 0.26, anim: "animate-wave-l" },
  { top: "46%", sw: 3, opacity: 0.16, anim: "animate-wave-r" },
  { top: "62%", sw: 5, opacity: 0.12, anim: "animate-wave-slow" }
];

export function BrandBackdrop({
  variant = "dots",
  className = ""
}: {
  variant?: BrandBackdropVariant;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-0 overflow-hidden ${className}`}
    >
      {/* Weicher Brand-Glow, oben mittig — gibt Tiefe ohne den hellen Look zu kippen */}
      <div
        className="absolute left-1/2 top-[18%] h-[120vw] w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(${ACCENT},0.12) 0%, rgba(${ACCENT},0.04) 38%, transparent 70%)`
        }}
      />

      {variant === "dots" && <WaveDots />}

      {variant === "waves" && (
        <div
          className="absolute inset-0"
          style={{
            // Wellen zu den Rändern hin ausblenden, damit nichts hart abschneidet
            maskImage:
              "radial-gradient(ellipse 100% 90% at 50% 42%, #000 45%, transparent 85%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 100% 90% at 50% 42%, #000 45%, transparent 85%)"
          }}
        >
          {WAVE_LAYERS.map((l, i) => (
            <div
              key={i}
              className={`absolute inset-x-0 h-[340px] ${l.anim}`}
              style={{
                top: l.top,
                opacity: l.opacity,
                backgroundImage: waveUrl(l.sw),
                backgroundSize: "1200px 340px",
                backgroundRepeat: "repeat-x"
              }}
            />
          ))}
        </div>
      )}

      {variant === "net" && (
        <div
          className="absolute inset-0 animate-grid-drift"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(${ACCENT},0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(${ACCENT},0.10) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
            maskImage:
              "radial-gradient(ellipse 90% 80% at 50% 38%, #000 35%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 80% at 50% 38%, #000 35%, transparent 78%)"
          }}
        />
      )}

      {variant === "blobs" && (
        <>
          <span
            className="animate-blob-a absolute -left-[15%] top-[8%] h-[60vw] w-[60vw] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, rgba(${ACCENT},0.22) 0%, transparent 70%)`
            }}
          />
          <span
            className="animate-blob-b absolute right-[-20%] top-[30%] h-[55vw] w-[55vw] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, rgba(${ACCENT},0.18) 0%, transparent 70%)`
            }}
          />
          <span
            className="animate-blob-c absolute bottom-[-10%] left-[20%] h-[50vw] w-[50vw] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, rgba(${ACCENT},0.16) 0%, transparent 70%)`
            }}
          />
        </>
      )}
    </div>
  );
}
