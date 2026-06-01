import {
  Goal,
  Trophy,
  Frown,
  Handshake,
  Shield,
  Flame,
  Target,
  TrendingUp,
  Rocket,
  Sparkles,
  Square,
  Forward,
  Star,
  Gem,
  ArrowUp,
  LifeBuoy,
  Medal,
  Crown,
  Flag,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zentrale Icon-Zuordnung für Pledge-/Saison-Trigger (TriggerType aus
 * lib/triggers/labels). Ersetzt die früher in mehreren Screens duplizierten
 * Emoji-Maps (Pledge-Builder, Ereignisse-Liste, Saison-Wetten).
 */
const ICON_BY_TRIGGER: Record<string, LucideIcon> = {
  goal_total: Goal,
  goal_by_player: Goal,
  win: Trophy,
  loss: Frown,
  draw: Handshake,
  clean_sheet: Shield,
  comeback_win: Flame,
  hattrick: Target,
  goal_diff_min: TrendingUp,
  goals_scored_min: Rocket,
  special_goal: Sparkles,
  yellow_card: Square,
  red_card: Square,
  assist: Forward,
  man_of_match: Star,
  custom: Gem,
  season_promotion: ArrowUp,
  season_no_relegation: LifeBuoy,
  season_table_position: Medal,
  season_champion: Crown,
  season_cup_round: Trophy,
  season_custom: Flag
};

export function triggerIcon(type: string): LucideIcon {
  return ICON_BY_TRIGGER[type] ?? Trophy;
}

export function TriggerIcon({
  type,
  className
}: {
  type: string;
  className?: string;
}) {
  const Icon = triggerIcon(type);
  return <Icon className={cn("h-5 w-5", className)} aria-hidden />;
}
