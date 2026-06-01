import { Building2, Goal, HandCoins, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IdentityEntry } from "@/lib/auth/identity-routing";

/**
 * Icon je Identity-Rolle (Verein / Mannschaft / Sponsor) — ersetzt die früheren
 * Emojis in den Konto-Menüs (Header-Dropdown + Mobile-Drawer). Rendert das Icon
 * in einem akzent-getönten Kreis; die Größe steuert die `className` des Wrappers.
 */
const ICON_BY_KIND: Record<IdentityEntry["kind"], LucideIcon> = {
  club: Building2,
  team: Goal,
  sponsor: HandCoins
};

export function IdentityIcon({
  kind,
  className
}: {
  kind: IdentityEntry["kind"];
  className?: string;
}) {
  const Icon = ICON_BY_KIND[kind];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark",
        className
      )}
      aria-hidden
    >
      <Icon className="h-[1.1rem] w-[1.1rem]" />
    </span>
  );
}
