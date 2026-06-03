import { Logo } from "@/components/shared/logo";

/**
 * Gemeinsames Auth-Layout (Login / Registrieren / Verify).
 *
 * Gibt allen Auth-Seiten einen ruhigen, nativen Rahmen: Logo oben zentriert,
 * System-Font (native-shell), Off-White-Hintergrund, Safe-Area. Die einzelnen
 * Seiten rendern ihre Card darunter und behalten ihr eigenes Layout.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="native-shell min-h-[100dvh] bg-brand-off-white">
      <div className="flex justify-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-1">
        <Logo variant="full" href="/" className="h-6 w-auto" />
      </div>
      {children}
    </div>
  );
}
