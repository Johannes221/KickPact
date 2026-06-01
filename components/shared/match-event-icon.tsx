import {
  Goal,
  ArrowRightLeft,
  RectangleVertical,
  Target,
  Flame,
  Zap,
  Sparkles,
  Circle,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Icon für rohe Spielereignisse (type + subtype: tor / auswechslung / karte /
 * spezial). Karten tragen ihre semantische Farbe (rot/gelb) selbst. Ersetzt die
 * früher in Match-Events-Liste und Sponsor-Inbox duplizierten Emoji-Funktionen.
 */
function resolve(
  type: string,
  subtype: string | null
): { Icon: LucideIcon; color: string } {
  if (type === "tor") return { Icon: Goal, color: "text-accent-dark" };
  if (type === "auswechslung")
    return { Icon: ArrowRightLeft, color: "text-brand-night-navy/50" };
  if (type === "karte")
    return subtype === "rot"
      ? { Icon: RectangleVertical, color: "text-brand-alert-red" }
      : { Icon: RectangleVertical, color: "text-amber-500" };
  if (type === "spezial") {
    if (subtype === "kopfball")
      return { Icon: Target, color: "text-brand-night-navy/70" };
    if (subtype === "hackentor")
      return { Icon: Flame, color: "text-brand-night-navy/70" };
    if (subtype === "elfmeter")
      return { Icon: Zap, color: "text-brand-night-navy/70" };
    return { Icon: Sparkles, color: "text-brand-night-navy/70" };
  }
  return { Icon: Circle, color: "text-brand-night-navy/30" };
}

export function MatchEventIcon({
  type,
  subtype,
  className
}: {
  type: string;
  subtype: string | null;
  className?: string;
}) {
  const { Icon, color } = resolve(type, subtype);
  return <Icon className={cn("h-5 w-5", color, className)} aria-hidden />;
}
