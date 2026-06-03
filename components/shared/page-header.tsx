import { cn } from "@/lib/utils";

/**
 * Geteilter Seiten-Header für den App-Content. Ersetzt den früheren
 * Eyebrow-Stapel (Vereinsname uppercase → Mannschaftsname uppercase → riesige
 * Display-Headline → Saison-Pill), der dieselbe Info dreifach zeigte und lange
 * Namen abschnitt.
 *
 * Genau EIN Titel (vollständig, sauber umbrechend via `.title-wrap` — keine
 * Truncation, keine Silbentrennung mitten im Wort) + optionaler Subtitle, der
 * den Kontext (Mannschaft · Saison) in EINER lesbaren Zeile bündelt.
 *
 * Server-Component (kein State) — direkt in Server-Pages verwendbar.
 */
export interface PageHeaderProps {
  title: string;
  /** Kontext in einer Zeile, z.B. "FC Sportfr. Dossenheim · Saison 25/26". */
  subtitle?: string;
  /** Optionale Aktion rechts (z.B. ein Button / Toggle). */
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="title-wrap text-ios-title1 text-ios-label">
          {title}
        </h1>
        {subtitle ? (
          <p className="title-wrap mt-1 text-ios-subhead text-ios-label-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
