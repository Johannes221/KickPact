import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Lucide-Icon im getönten Kreis. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optionale Aktion (z.B. PrimaryButton zum Anlegen). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Einheitlicher Leerzustand. Ersetzt die zuvor pro Seite inline gebauten
 * „Noch keine …"-Blöcke. Zentriert, dezent, Token-basiert.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl bg-ios-card px-6 py-12 text-center shadow-ios-card",
        className
      )}
    >
      {Icon ? (
        <span
          className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-ios-fill-tertiary text-ios-label-secondary"
          aria-hidden
        >
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <h3 className="text-ios-headline text-ios-label">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-ios-subhead text-ios-label-secondary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
