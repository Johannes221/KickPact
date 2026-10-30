import { Building2, Goal, HandCoins, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IdentityEntry } from "@/lib/auth/identity-routing";
import { TeamCrest } from "@/components/shared/team-crest";
import { crestSrc } from "@/lib/utils/crest-url";

/**
 * Icon je Identity-Rolle (Verein / Mannschaft / Sponsor) — ersetzt die früheren
 * Emojis in den Konto-Menüs (Header-Dropdown + Mobile-Drawer). Rendert das Icon
 * in einem akzent-getönten Kreis; die Größe steuert die `className` des Wrappers.
 *
 * Für Mannschafts-Einträge (`kind === "team"`) zeigt es — sofern `crest` gesetzt
 * ist — das echte Vereinswappen (`/api/crest`, hochgeladenes Logo hat Vorrang)
 * statt des generischen Ziel-Icons. Fehlt ein Wappen, greift der saubere
 * Platzhalter von `TeamCrest`.
 */
const ICON_BY_KIND: Record<IdentityEntry["kind"], LucideIcon> = {
  club: Building2,
  team: Goal,
  sponsor: HandCoins
};

export function IdentityIcon({
  kind,
  className,
  crest,
  size = 28
}: {
  kind: IdentityEntry["kind"];
  className?: string;
  /** Nur für Team-Einträge: echtes Wappen statt generischem Icon. */
  crest?: { name: string; fussballdeTeamId?: string | null } | null;
  /** Kantenlänge des Wappens in px (Default 28 = h-7). */
  size?: number;
}) {
  if (kind === "team" && crest) {
    return (
      <TeamCrest
        name={crest.name}
        src={crestSrc(crest.name, crest.fussballdeTeamId)}
        size={size}
        shape="squircle"
        className={className}
      />
    );
  }
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
