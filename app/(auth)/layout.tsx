import { Logo } from "@/components/shared/logo";

/**
 * Gemeinsames Auth-Layout (Login / Registrieren / Verify).
 *
 * Gibt allen Auth-Seiten einen ruhigen, premium-nativen Rahmen: prominentes
 * Logo oben zentriert, System-Font (native-shell), Off-White-Hintergrund mit
 * dezentem Accent-Glow + diagonalem Muster, Safe-Area. Die einzelnen Seiten
 * rendern ihre Card darunter und behalten ihr eigenes Layout.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="native-shell relative min-h-[100dvh] overflow-hidden bg-brand-off-white">
      {/* Dezenter Premium-Hintergrund — ruhig, nicht ablenkend. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Sanfter Accent-Glow oben, läuft ins Off-White aus. */}
        <div className="absolute inset-x-0 top-0 h-[60dvh] bg-gradient-to-b from-accent/[0.08] via-accent/[0.02] to-transparent" />
        {/* Diffuser Lichtpunkt für etwas Tiefe. */}
        <div className="absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />
        {/* Feines diagonales Linienmuster, kaum sichtbar. */}
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(1,196,87,0.04) 0px, rgba(1,196,87,0.04) 1px, transparent 1px, transparent 22px)"
          }}
        />
      </div>

      <div className="relative">
        <div className="flex flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-1 text-center">
          <Logo variant="full" href="/" className="h-9 w-auto" />
          <p className="mt-4 text-sm font-medium text-brand-night-navy/50">
            Performance-Sponsoring für deinen Verein
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
