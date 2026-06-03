import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListRowProps {
  /** Optional links die ganze Zeile (Anchor — Rechtsklick/„neuer Tab" bleibt). */
  href?: string;
  /** Führendes Element: Logo/Avatar/Icon-Kreis. */
  leading?: React.ReactNode;
  /** Haupttitel der Zeile. */
  title: React.ReactNode;
  /** Optionale zweite Zeile (Kontext). */
  subtitle?: React.ReactNode;
  /** Rechts ausgerichteter Inhalt: Betrag, Badge, Datum … */
  trailing?: React.ReactNode;
  /** Chevron rechts anzeigen (Default: an, wenn href gesetzt). */
  chevron?: boolean;
  className?: string;
}

/**
 * Einheitliche iOS-Listenzeile. Ersetzt die zuvor pro Seite inline gebauten
 * `rounded-lg bg-white shadow-ios-card p-3 flex …`-Zeilen. Shadow-only Card-Look,
 * tactile Press bei Links, Chevron-Affordanz. Alle Maße/Farben über Tokens.
 */
export function ListRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  className,
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(href);
  const Tag = href ? Link : "div";
  const tagProps = href ? { href } : {};
  return (
    <Tag
      {...(tagProps as { href: string })}
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-ios-card px-4 py-3 shadow-ios-card",
        href && "press",
        className
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-ios-headline text-ios-label">{title}</div>
        {subtitle ? (
          <div className="truncate text-ios-footnote text-ios-label-secondary">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div className="shrink-0 text-right text-ios-subhead text-ios-label-secondary">
          {trailing}
        </div>
      ) : null}
      {showChevron ? (
        <ChevronRight
          className="h-5 w-5 shrink-0 text-ios-label-tertiary"
          aria-hidden
        />
      ) : null}
    </Tag>
  );
}
